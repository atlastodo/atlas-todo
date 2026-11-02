import { useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { rescopeNeeded, rescopeTask, type MemberRole } from "@atlastodo/client-core";
import {
  allTasks,
  buildActivityFeed,
  canUndoActivity,
  decodePlace,
  parse,
  projectDescendantIds,
  toProject,
  undoActivity,
  visibleTasks,
  type Activity,
  type ActivityGroup,
  type EvalContext,
  type FeedItem,
  type FeedScope,
} from "@atlastodo/shared";
import { useStore } from "../data/StoreProvider";
import { AuthContext } from "../auth/AuthContext";
import { useActivities } from "./useActivities";
import { useComments } from "./useComments";
import { useProjectMembers } from "./useProjectMembers";
import { useLabels } from "./useLabels";
import { useSavedFilters } from "./useSavedFilters";
import { usePreferences } from "./usePreferences";
import { useNow } from "./useNow";
import { activityScope, type ActivityView } from "../lib/activityScope";
import { useActivityText } from "./useActivityText";

/** Which feed: a smart view's, a project's, a saved filter's, or (none) everything. */
export type FeedTarget =
  { view: ActivityView } | { project: string } | { filter: string } | undefined;

export interface FeedOptions {
  people?: ReadonlySet<string>;
  groups?: ReadonlySet<ActivityGroup>;
  limit: number;
}

export interface UseActivityFeed {
  items: FeedItem[];
  hasMore: boolean;
  /** Whether the scope has any entry at all, filters aside (to tell "nothing yet" from "no match"). */
  anyInScope: boolean;
  /** The people with entries in scope, for the person filter (only offered when there are others). */
  people: { id: string; name: string }[];
  /** "Activity · Today"-style title for the scope. */
  title: string;
  /** Whether the target exists (a deleted project or filter has no feed). */
  found: boolean;
  describe: (a: Activity) => string;
  /** A task's title in quotes, or "a task" once it is gone. */
  taskLabel: (taskId: string) => string;
  nameOf: (userId: string) => string;
  canUndo: (a: Activity) => boolean;
  /** Undo an entry; false when it no longer applies (someone changed the field since). */
  undo: (a: Activity) => boolean;
}

/**
 * The activity feed of a view (`activityScope`) or of everything: entries and comments, filtered,
 * paged and described, with undo. Undo is offered per `canUndoActivity`, with the user's role in
 * the entry's project (an unshared or personal one is theirs), and goes through the task rules.
 */
export function useActivityFeed(target: FeedTarget, options: FeedOptions): UseActivityFeed {
  const { t } = useTranslation();
  const { store, version, kick } = useStore();
  const auth = useContext(AuthContext);
  const myId = auth?.session?.user.id;
  const keyring = auth?.keyring ?? null;
  const { activities } = useActivities();
  const { comments } = useComments();
  const { members } = useProjectMembers();
  const { byId: labelById } = useLabels();
  const { filters } = useSavedFilters();
  const { timezone, weekStartsOn } = usePreferences();
  const timeZone = timezone || undefined;
  const now = useNow();
  const { describe, nameOf, taskLabel, projectName } = useActivityText();

  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => allTasks(store), [store, version]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  // Primitives, so a route that rebuilds the target object each render does not re-derive.
  const viewId = target && "view" in target ? target.view : null;
  const projectId = target && "project" in target ? target.project : null;
  const filterId = target && "filter" in target ? target.filter : null;
  const filter = filterId ? filters.find((f) => f.id === filterId) : null;

  const scope = useMemo<FeedScope | undefined>(() => {
    if (!viewId && !projectId && !filterId) return undefined;
    const visibleIds = new Set(visibleTasks(store, tasks).map((task) => task.id));
    const input = { all: tasks, visibleIds, now, timeZone, myId };
    if (viewId) return activityScope({ kind: "view", view: viewId }, input);
    if (projectId) {
      const all = store.list("project").map((e) => toProject(e.id, e.fields));
      const projectIds = new Set([projectId, ...projectDescendantIds(all, projectId)]);
      return activityScope({ kind: "project", projectIds }, input);
    }
    const parsed = filter ? parse(filter.query) : null;
    if (!parsed?.ok) return { taskIds: new Set(), projectIds: new Set() };
    const ctx: EvalContext = {
      now,
      timeZone,
      weekStartsOn,
      labelsOf: (task) =>
        task.label_ids
          .map((id) => labelById(id)?.name)
          .filter((name): name is string => name != null && name !== ""),
      projectNameOf: (task) => (task.project_id ? projectName(task.project_id) : null),
    };
    return activityScope({ kind: "filter", ast: parsed.ast, ctx }, input);
  }, [
    store,
    tasks,
    now,
    timeZone,
    myId,
    weekStartsOn,
    labelById,
    projectName,
    filter,
    viewId,
    projectId,
    filterId,
  ]);

  const scoped = useMemo(
    () => buildActivityFeed({ activities, comments, scope }),
    [activities, comments, scope],
  );
  const { items, hasMore } = useMemo(
    () =>
      buildActivityFeed({
        activities,
        comments,
        scope,
        people: options.people,
        groups: options.groups,
        limit: options.limit,
      }),
    [activities, comments, scope, options.people, options.groups, options.limit],
  );

  const people = useMemo(() => {
    const ids = new Set(scoped.items.map((i) => i.actorId).filter((id) => id !== ""));
    return [...ids]
      .map((id) => ({ id, name: nameOf(id) }))
      .sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : a.name.localeCompare(b.name)));
  }, [scoped.items, nameOf, myId]);

  // The user's role in a project: an unshared or personal one (no member rows) is their own.
  const roleIn = useCallback(
    (projectId: string | null): MemberRole => {
      if (!projectId) return "owner";
      const rows = members.filter((m) => m.project_id === projectId);
      if (rows.length === 0) return "owner";
      const mine = rows.find((m) => m.user_id === myId && m.state === "active");
      return mine?.role ?? "commenter";
    },
    [members, myId],
  );
  // Where the entry lives now.
  const roleFor = useCallback(
    (a: Activity): MemberRole =>
      roleIn(a.task_id ? (taskById.get(a.task_id)?.project_id ?? null) : a.project_id),
    [taskById, roleIn],
  );

  const canUndo = useCallback(
    (a: Activity) => {
      if (myId === undefined || !canUndoActivity(store, a, activities, roleFor(a))) return false;
      // Undoing a move writes the task back into its old project: that takes edit rights there too.
      if (a.kind === "move") {
        const back = roleIn(decodePlace(a.from)?.project_id ?? null);
        return back === "owner" || back === "editor";
      }
      return true;
    },
    // `version`: the undo check reads the store's current values.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [store, version, activities, roleFor, roleIn, myId],
  );

  const undo = useCallback(
    (a: Activity) => {
      if (!myId) return false;
      // A move back across a sharing boundary re-sends the task under the other key, as "Move to" does.
      let rescopeFrom: string | null | undefined;
      if (a.kind === "move") {
        const raw = store.rawField("task", a.task_id, "project_id");
        const from = typeof raw === "string" && raw !== "" ? raw : null;
        const to = decodePlace(a.from)?.project_id ?? null;
        if (rescopeNeeded(store, keyring, from, to)) rescopeFrom = from;
      }
      if (!undoActivity(store, myId, a, activities, Date.now(), timeZone)) return false;
      if (rescopeFrom !== undefined) rescopeTask(store, keyring, a.task_id, rescopeFrom, myId);
      kick();
      return true;
    },
    [store, myId, activities, timeZone, keyring, kick],
  );

  const title = useMemo(() => {
    if (!viewId && !projectId && !filterId) return t("activity.allTitle");
    const name = viewId
      ? t(`nav.${viewId}`)
      : projectId
        ? projectName(projectId)
        : (filter?.name ?? null);
    return name ? t("activity.scopedTitle", { name }) : t("activity.title");
  }, [viewId, projectId, filterId, t, projectName, filter]);

  const found = projectId
    ? store.get("project", projectId) != null
    : filterId
      ? filter != null
      : true;

  return {
    items,
    hasMore,
    anyInScope: scoped.items.length > 0,
    people,
    title,
    found,
    describe,
    taskLabel,
    nameOf,
    canUndo,
    undo,
  };
}
