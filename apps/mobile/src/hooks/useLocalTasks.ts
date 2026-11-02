import { useCallback, useContext, useMemo } from "react";
import {
  rescopeNeeded,
  rescopeTask,
  type CreateTaskInput,
  type SyncStatus,
  type Task,
} from "@atlastodo/client-core";
import {
  allTasks as deriveAll,
  archivedTasks as deriveArchived,
  visibleTasks as deriveVisible,
  createTask,
  discardTask,
  duplicateTask,
  moveTask,
  moveTaskToProject,
  reparentTask,
  restoreTask,
  setTaskArchived,
  skipTask,
  softDeleteTask,
  toggleTask,
  updateRecurringTask,
  updateTask,
  type RecurEditScope,
  type TaskMove,
  type TaskProjectMove,
} from "@atlastodo/shared";
import { useStore } from "../data/StoreProvider";
import { AuthContext } from "../auth/AuthContext";
import { usePreferences } from "./usePreferences";
import { dropActivity, withNewActivity } from "../lib/activityLog";

export type { RecurEditScope, TaskMove, TaskProjectMove };

/**
 * Ids of tasks this device created in this app session (created, duplicated, or spawned by a
 * recurring completion): the only tasks `discard` may tombstone. Module-level so every hook
 * instance shares it.
 *
 * `discard` is a hard delete that syncs to every member of a shared project, and callers decide
 * from what they see ("the title is blank"). A task that synced in blank, or one this device cannot
 * decrypt, looks like an abandoned draft, so the rule is enforced here rather than by callers.
 */
const createdThisSession = new Set<string>();

/**
 * The `deleted` entries `remove` wrote, by task. `restore` is the delete toast's undo: it takes
 * the entry back rather than recording a restore. Module-level for the same reason as above.
 */
const deleteEntries = new Map<string, string[]>();

/**
 * Local-first task data over the app's {@link StoreProvider} store. Reads and writes are instant
 * against the in-memory store while the provider's `SyncClient` syncs in the background.
 *
 * The rules (what completing a recurring task means, which tasks a list may show) live in
 * `@atlastodo/shared`'s `taskOps`; this hook only subscribes, memoises and kicks a sync after a write.
 *
 * @param actorId Current user id; when given, every change (create, fields, moves, delete) records
 *   an `activity` entry attributed to them.
 *
 * A task this device cannot decrypt is read-only (`taskOps` refuses the writes), so the writers
 * report whether anything was written; an undo toast must only count what really changed.
 */
export interface UseLocalTasks {
  /** Active tasks: not trashed or archived, and not inside a trashed/archived container. */
  tasks: Task[];
  /** Individually-archived tasks, for the Archive view. */
  archivedTasks: Task[];
  status: SyncStatus;
  /** Create a task; returns the new task's id. */
  create: (input: CreateTaskInput) => string;
  /** Toggle a task; returns the spawned next-instance id when completing a recurring one. */
  toggle: (task: Task) => string | null;
  /** Skip a recurring task's occurrence: advance its due date without completing it. */
  skip: (task: Task) => void;
  /** Soft-delete a task to Trash (recoverable for 30 days), hidden from every list. */
  remove: (task: Task) => boolean;
  /**
   * Undo a soft-delete (the delete toast): clears `deleted_at` so the task returns to its lists,
   * taking back the `deleted` entry instead of recording a restore.
   */
  restore: (task: Task) => boolean;
  /** Create a copy of a task (title suffixed " (copy)"); the new task's id, or null if refused. */
  duplicate: (task: Task) => string | null;
  /**
   * Hard-remove a task by id (a real tombstone), to undo a duplicate or recurring spawn or drop a
   * blank draft. Only acts on tasks this device created this session, never a locked one.
   */
  discard: (id: string) => void;
  /** Write the given fields on a task, skipping ones already equal to the current value. */
  update: (task: Task, patch: Partial<Task>) => boolean;
  /** Update a recurring task with an explicit scope (this occurrence vs all). */
  updateRecurring: (task: Task, patch: Partial<Task>, scope: RecurEditScope) => boolean;
  /** Persist a move (section and/or order and/or due date) by id. */
  move: (id: string, patch: TaskMove) => boolean;
  /** Make a task a subtask of `parentId` (or top-level when null), ranked at `sortOrder`. */
  reparent: (id: string, parentId: string | null, sortOrder: number) => boolean;
  /** Move a task to a different project (and section) -- the "Move to" action. */
  moveToProject: (id: string, target: TaskProjectMove) => boolean;
  /** Archive or restore a task (tucked away from every list without deleting it). */
  setArchived: (task: Task, archived: boolean) => boolean;
}

export function useLocalTasks(actorId?: string): UseLocalTasks {
  const { store, status, version, kick } = useStore();
  const keyring = useContext(AuthContext)?.keyring ?? null;
  const timeZone = usePreferences().timezone || undefined;

  // `version` bumps on every store change to force a re-derive.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => deriveAll(store), [store, version]);
  const tasks = useMemo(() => deriveVisible(store, all), [store, all]);
  const archived = useMemo(() => deriveArchived(store, all), [store, all]);

  const create = useCallback(
    (input: CreateTaskInput) => {
      const id = createTask(store, input, timeZone, actorId);
      createdThisSession.add(id);
      kick();
      return id;
    },
    [store, kick, timeZone, actorId],
  );

  const duplicate = useCallback(
    (task: Task) => {
      const id = duplicateTask(store, task, timeZone);
      if (id == null) return null;
      createdThisSession.add(id);
      kick();
      return id;
    },
    [store, kick, timeZone],
  );

  const discard = useCallback(
    (id: string) => {
      if (!createdThisSession.has(id)) {
        if (__DEV__) console.warn(`[atlas] refused to discard task ${id}: not created here`);
        return;
      }
      // `discardTask` itself refuses a locked task.
      if (!discardTask(store, id)) {
        if (__DEV__) console.warn(`[atlas] refused to discard task ${id}: locked`);
        return;
      }
      createdThisSession.delete(id);
      kick();
    },
    [store, kick],
  );

  const toggle = useCallback(
    (task: Task) => {
      const spawnedId = toggleTask(store, task, actorId, Date.now(), timeZone);
      if (spawnedId != null) createdThisSession.add(spawnedId);
      kick();
      return spawnedId;
    },
    [store, kick, actorId, timeZone],
  );

  const skip = useCallback(
    (task: Task) => {
      skipTask(store, task, actorId, Date.now(), timeZone);
      kick();
    },
    [store, kick, actorId, timeZone],
  );

  const remove = useCallback(
    (task: Task) => {
      const { result, entries } = withNewActivity(store, () =>
        softDeleteTask(store, task, Date.now(), actorId),
      );
      if (!result) return false;
      deleteEntries.set(task.id, entries);
      kick();
      return true;
    },
    [store, kick, actorId],
  );

  const restore = useCallback(
    (task: Task) => {
      const entries = deleteEntries.get(task.id);
      // Without a delete to take back (it happened elsewhere), this is a restore of its own.
      if (!restoreTask(store, task, entries ? undefined : actorId)) return false;
      if (entries) {
        dropActivity(store, entries);
        deleteEntries.delete(task.id);
      }
      kick();
      return true;
    },
    [store, kick, actorId],
  );

  const update = useCallback(
    (task: Task, patch: Partial<Task>) => {
      const changed = updateTask(store, task, patch, actorId, Date.now(), timeZone);
      if (changed) kick();
      return changed;
    },
    [store, kick, actorId, timeZone],
  );

  const updateRecurring = useCallback(
    (task: Task, patch: Partial<Task>, scope: RecurEditScope) => {
      const changed = updateRecurringTask(store, task, patch, scope, actorId, Date.now(), timeZone);
      if (changed) kick();
      return changed;
    },
    [store, kick, actorId, timeZone],
  );

  const move = useCallback(
    (id: string, patch: TaskMove) => {
      const changed = moveTask(store, id, patch, Date.now(), actorId);
      if (changed) kick();
      return changed;
    },
    [store, kick, actorId],
  );

  const reparent = useCallback(
    (id: string, parentId: string | null, sortOrder: number) => {
      const changed = reparentTask(store, all, id, parentId, sortOrder);
      if (changed) kick();
      return changed;
    },
    [store, all, kick],
  );

  const moveToProject = useCallback(
    (id: string, target: TaskProjectMove) => {
      const raw = store.rawField("task", id, "project_id");
      const from = typeof raw === "string" && raw !== "" ? raw : null;
      // Decided before the move: afterwards the store already places the task in its new project.
      const rescope = rescopeNeeded(store, keyring, from, target.project_id);
      if (!moveTaskToProject(store, id, target, Date.now(), actorId)) return false;
      // Content written under the old scope's key must be re-sent under the new one.
      if (rescope) rescopeTask(store, keyring, id, from);
      kick();
      return true;
    },
    [store, kick, keyring, actorId],
  );

  const setArchived = useCallback(
    (task: Task, archived: boolean) => {
      if (!setTaskArchived(store, task, archived)) return false;
      kick();
      return true;
    },
    [store, kick],
  );

  return {
    tasks,
    archivedTasks: archived,
    status,
    create,
    duplicate,
    discard,
    toggle,
    skip,
    remove,
    restore,
    update,
    updateRecurring,
    move,
    reparent,
    moveToProject,
    setArchived,
  };
}
