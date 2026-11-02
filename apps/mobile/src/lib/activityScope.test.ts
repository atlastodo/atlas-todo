import { LocalStore } from "@atlastodo/client-core";
import { allTasks, createTask, parse, visibleTasks } from "@atlastodo/shared";
import { activityScope, type ScopeTarget } from "./activityScope";

/**
 * Which tasks a view's activity covers: what it shows now, plus what was completed or deleted from
 * it in the last seven days, judged as if still open.
 */
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 2, 12);

function setup() {
  const store = new LocalStore("test");
  const add = (title: string, fields: Record<string, unknown> = {}) => {
    const id = createTask(store, { title, due_at: NOW });
    for (const [k, v] of Object.entries(fields)) store.set("task", id, k, v);
    return id;
  };
  const scope = (target: ScopeTarget) =>
    activityScope(target, {
      all: allTasks(store),
      visibleIds: new Set(visibleTasks(store).map((t) => t.id)),
      now: NOW,
      timeZone: "UTC",
      myId: "me",
    });
  return { store, add, scope };
}

describe("activityScope", () => {
  it("covers Today's tasks and those completed or deleted from it this week", () => {
    const { add, scope } = setup();
    const open = add("Open");
    const doneRecently = add("Done 3 days ago", {
      is_completed: true,
      completed_at: NOW - 3 * DAY,
    });
    const doneLongAgo = add("Done 8 days ago", { is_completed: true, completed_at: NOW - 8 * DAY });
    const deleted = add("Deleted yesterday", { deleted_at: NOW - DAY });
    const later = add("Next week", { due_at: NOW + 7 * DAY });
    const { taskIds, projectIds } = scope({ kind: "view", view: "today" });
    expect(taskIds.has(open)).toBe(true);
    expect(taskIds.has(doneRecently)).toBe(true);
    expect(taskIds.has(doneLongAgo)).toBe(false);
    expect(taskIds.has(deleted)).toBe(true);
    expect(taskIds.has(later)).toBe(false);
    expect(projectIds.size).toBe(0);
  });

  it("covers a project's tasks and its own entries", () => {
    const { add, scope } = setup();
    const inside = add("Inside", { project_id: "p1" });
    const outside = add("Outside", { project_id: "p2" });
    const { taskIds, projectIds } = scope({ kind: "project", projectId: "p1" });
    expect([...taskIds]).toEqual([inside]);
    expect(taskIds.has(outside)).toBe(false);
    expect([...projectIds]).toEqual(["p1"]);
  });

  it("covers a filter's matches, a recently completed one judged as open", () => {
    const { add, scope } = setup();
    const urgent = add("Urgent", { priority: 1 });
    const urgentDone = add("Urgent done", {
      priority: 1,
      is_completed: true,
      completed_at: NOW - DAY,
    });
    const calm = add("Calm", { priority: 4 });
    const parsed = parse("p1");
    if (!parsed.ok) throw new Error("bad query");
    const { taskIds } = scope({
      kind: "filter",
      ast: parsed.ast,
      ctx: { now: NOW, timeZone: "UTC", labelsOf: () => [], projectNameOf: () => null },
    });
    expect(taskIds.has(urgent)).toBe(true);
    expect(taskIds.has(urgentDone)).toBe(true);
    expect(taskIds.has(calm)).toBe(false);
  });

  it("covers the tasks assigned to me in Assigned", () => {
    const { add, scope } = setup();
    const mine = add("Mine", { assignee_id: "me" });
    const theirs = add("Theirs", { assignee_id: "bo" });
    const { taskIds } = scope({ kind: "view", view: "assigned" });
    expect(taskIds.has(mine)).toBe(true);
    expect(taskIds.has(theirs)).toBe(false);
  });
});
