import { describe, it, expect } from "vitest";
import { habitReminderId, habitReminders } from "./habitSchedule";
import type { CheckinState, Habit } from "./habits";

function makeHabit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Meditate",
    kind: "habit",
    parent_id: null,
    goal_kind: "daily",
    days: [],
    target: 1,
    color: "#6366f1",
    icon: "hash",
    notes: "",
    steps: [],
    unit: "",
    reminder_time: "09:00",
    schedule_history: [],
    archived_at: null,
    created_at: new Date(2026, 6, 6, 12).getTime(),
    sort_order: 0,
    ...over,
  };
}

const states = (entries: Record<string, CheckinState> = {}) => new Map(Object.entries(entries));
const noStates = () => states();

/** Mon 2026-07-06 at 08:00 local; before a 09:00 reminder. */
const MORNING = new Date(2026, 6, 6, 8, 0).getTime();

describe("habitReminders", () => {
  it("plans a nudge for each upcoming scheduled day", () => {
    const plan = habitReminders([makeHabit()], noStates, MORNING, 1);
    // Today (09:00 is still ahead) plus the next seven days.
    expect(plan).toHaveLength(8);
    expect(plan[0]!.reminderId).toBe(habitReminderId("h1", "2026-07-06"));
    expect(plan[0]!.title).toBe("Meditate");
    expect(plan[0]!.fireAt).toBe(new Date(2026, 6, 6, 9, 0).getTime());
  });

  it("skips a habit with no reminder time", () => {
    expect(habitReminders([makeHabit({ reminder_time: null })], noStates, MORNING, 1)).toEqual([]);
  });

  it("skips an archived habit", () => {
    const archived = makeHabit({ archived_at: MORNING });
    expect(habitReminders([archived], noStates, MORNING, 1)).toEqual([]);
  });

  it("drops today's slot once its time has passed", () => {
    const evening = new Date(2026, 6, 6, 21, 0).getTime();
    const plan = habitReminders([makeHabit()], noStates, evening, 1);
    expect(plan.map((p) => p.reminderId)).not.toContain(habitReminderId("h1", "2026-07-06"));
  });

  it("says nothing about a day already recorded", () => {
    const done = () => states({ "2026-07-06": "done" });
    const plan = habitReminders([makeHabit()], done, MORNING, 1);
    expect(plan.map((p) => p.reminderId)).not.toContain(habitReminderId("h1", "2026-07-06"));
  });

  it("says nothing about a day deliberately skipped", () => {
    const skipped = () => states({ "2026-07-06": "skip" });
    const plan = habitReminders([makeHabit()], skipped, MORNING, 1);
    expect(plan.map((p) => p.reminderId)).not.toContain(habitReminderId("h1", "2026-07-06"));
  });

  it("only nudges on scheduled weekdays", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    const plan = habitReminders([mwf], noStates, MORNING, 1);
    // Mon 06, Wed 08, Fri 10, and Mon 13; the horizon's last day.
    expect(plan.map((p) => p.reminderId)).toEqual([
      habitReminderId("h1", "2026-07-06"),
      habitReminderId("h1", "2026-07-08"),
      habitReminderId("h1", "2026-07-10"),
      habitReminderId("h1", "2026-07-13"),
    ]);
  });

  it("goes quiet for the rest of the week once a weekly goal is met", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 2 });
    const met = () => states({ "2026-07-06": "done", "2026-07-07": "done" });
    const plan = habitReminders([weekly], met, MORNING, 1);
    // Nothing left in the week of Mon 06; the first nudge is in the following week.
    expect(plan.every((p) => p.reminderId >= habitReminderId("h1", "2026-07-13"))).toBe(true);
  });

  it("keeps nudging while a weekly goal is still short", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    const partial = () => states({ "2026-07-06": "done" });
    const plan = habitReminders([weekly], partial, MORNING, 1);
    expect(plan.map((p) => p.reminderId)).toContain(habitReminderId("h1", "2026-07-07"));
  });

  it("nudges under the outgoing schedule right up to the day a change takes effect", () => {
    // Mon+Wed until Fri 2026-07-10, Mon+Fri from then on. Wednesday the 8th still belongs to the
    // old schedule, so it is still nudged; and the 10th, which only the new one wants, is too.
    const changing = makeHabit({
      days: [1, 5],
      schedule_history: [
        { from: "2026-07-06", goal_kind: "daily", days: [1, 3], target: 1 },
        { from: "2026-07-10", goal_kind: "daily", days: [1, 5], target: 1 },
      ],
    });
    const plan = habitReminders([changing], noStates, MORNING, 1);
    expect(plan.map((p) => p.reminderId)).toEqual([
      habitReminderId("h1", "2026-07-06"),
      habitReminderId("h1", "2026-07-08"),
      habitReminderId("h1", "2026-07-10"),
      habitReminderId("h1", "2026-07-13"),
    ]);
  });

  it("gives every planned nudge a distinct, stable id", () => {
    const plan = habitReminders([makeHabit(), makeHabit({ id: "h2" })], noStates, MORNING, 1);
    const ids = plan.map((p) => p.reminderId);
    expect(new Set(ids).size).toBe(ids.length);
    // Re-planning the same inputs yields the same ids, so reconciling is a no-op.
    const again = habitReminders([makeHabit(), makeHabit({ id: "h2" })], noStates, MORNING, 1);
    expect(again.map((p) => p.reminderId)).toEqual(ids);
  });
});
