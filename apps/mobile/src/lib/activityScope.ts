import type { Task } from "@atlastodo/client-core";
import {
  assignedToMe,
  evaluate,
  inboxTasks,
  todayTasks,
  upcomingTasks,
  type EvalContext,
  type FeedScope,
  type FilterNode,
} from "@atlastodo/shared";

/** How long a task completed or deleted out of a view still counts as the view's. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export type ActivityView = "today" | "upcoming" | "inbox" | "assigned" | "all";

export type ScopeTarget =
  | { kind: "view"; view: ActivityView }
  /** `projectIds`: the project and the projects nested under it. */
  | { kind: "project"; projectIds: ReadonlySet<string> }
  | { kind: "filter"; ast: FilterNode; ctx: EvalContext };

export interface ScopeInput {
  /** Every task, trashed and archived ones included (`allTasks`). */
  all: readonly Task[];
  /** The ids lists show (`visibleTasks`): not trashed, archived or in a hidden container. */
  visibleIds: ReadonlySet<string>;
  now: number;
  timeZone?: string;
  myId?: string;
}

/**
 * Which tasks a view's activity covers: the tasks it shows now, plus those completed or deleted in
 * the last {@link RECENT_MS} that would match it if they were still open, so finishing or trashing
 * a task does not take its history out of the view. A project's feed also covers the project's own
 * entries (renames, sections, members).
 */
export function activityScope(target: ScopeTarget, input: ScopeInput): FeedScope {
  const since = input.now - RECENT_MS;
  const matches = (task: Task): boolean => {
    const open = { ...task, is_completed: false };
    switch (target.kind) {
      case "view":
        switch (target.view) {
          case "today":
            return todayTasks([open], input.now, input.timeZone).length > 0;
          case "upcoming":
            return upcomingTasks([open], input.now, input.timeZone).length > 0;
          case "inbox":
            return inboxTasks([open]).length > 0;
          case "assigned":
            return input.myId ? assignedToMe([open], input.myId).length > 0 : false;
          case "all":
            return true;
        }
        return false;
      case "project":
        return task.project_id !== null && target.projectIds.has(task.project_id);
      case "filter":
        return evaluate(target.ast, open, target.ctx);
    }
  };
  const taskIds = new Set<string>();
  for (const task of input.all) {
    // A project feed also keeps tasks hidden only by an archived section or nested project:
    // they are still the project's.
    const shown =
      !task.is_completed &&
      (input.visibleIds.has(task.id) ||
        (target.kind === "project" && task.deleted_at == null && task.archived_at == null));
    const recentlyDone =
      task.is_completed && task.completed_at != null && task.completed_at >= since;
    const recentlyDeleted = task.deleted_at != null && task.deleted_at >= since;
    if ((shown || recentlyDone || recentlyDeleted) && matches(task)) taskIds.add(task.id);
  }
  const projectIds = new Set<string>(target.kind === "project" ? target.projectIds : []);
  return { taskIds, projectIds };
}
