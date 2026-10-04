import { describe, it, expect } from "vitest";
import {
  appendScheduleChange,
  bestStreak,
  completionRate,
  currentStreak,
  currentStrength,
  dateKey,
  dateKeyFromMs,
  daysBetweenKeys,
  evaluatePeriods,
  isActiveToday,
  isScheduledOn,
  MAX_SCAN_DAYS,
  MAX_SCHEDULE_HISTORY,
  MAX_STEPS,
  nextDue,
  periodsBetween,
  shiftDateKey,
  strengthSeries,
  toHabit,
  totalCheckins,
  weekdayOfKey,
  type CheckinState,
  type Habit,
} from "./habits";

/** A habit with everything defaulted; override only what a case is about. */
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
    reminder_time: null,
    schedule_history: [],
    archived_at: null,
    // 2026-07-06 is a Monday.
    created_at: new Date(2026, 6, 6, 12).getTime(),
    sort_order: 0,
    ...over,
  };
}

/** `{ "2026-07-06": "done", ... }` -> the states map the engine reads. */
function states(entries: Record<string, CheckinState>): Map<string, CheckinState> {
  return new Map(Object.entries(entries));
}

/** `done("2026-07-06", "2026-07-07")`; the common all-done case. */
function done(...keys: string[]): Map<string, CheckinState> {
  return new Map(keys.map((k) => [k, "done" as CheckinState]));
}

/** Noon on a local calendar date, so the day key is unambiguous in every machine timezone. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe("toHabit", () => {
  it("reads a habit written before groups, steps or schedule history existed", () => {
    const habit = toHabit("h1", { name: "Meditate", goal_kind: "daily" });
    expect(habit.kind).toBe("habit");
    expect(habit.parent_id).toBeNull();
    expect(habit.steps).toEqual([]);
    expect(habit.schedule_history).toEqual([]);
  });

  it("keeps a group's kind and a member's parent", () => {
    expect(toHabit("g1", { kind: "group" }).kind).toBe("group");
    expect(toHabit("h1", { parent_id: "g1" }).parent_id).toBe("g1");
    // Junk in either field must read as a plain standalone habit, never crash a render.
    expect(toHabit("h1", { kind: "routine", parent_id: 7 }).kind).toBe("habit");
    expect(toHabit("h1", { kind: "routine", parent_id: 7 }).parent_id).toBeNull();
  });

  it("drops non-string and empty steps", () => {
    expect(toHabit("h1", { steps: ["cleanse", "", 3, null, "moisturize"] }).steps).toEqual([
      "cleanse",
      "moisturize",
    ]);
  });

  it("caps steps so one field can never blow the server's op-value limit", () => {
    const many = Array.from({ length: MAX_STEPS + 10 }, (_, i) => `step ${i}`);
    expect(toHabit("h1", { steps: many }).steps).toHaveLength(MAX_STEPS);
  });

  it("sorts schedule history oldest first and drops unorderable entries", () => {
    // The array is one LWW field, so a merge between two devices can hand back any order.
    const habit = toHabit("h1", {
      schedule_history: [
        { from: "2026-07-13", goal_kind: "daily", days: [1, 4], target: 1 },
        { from: "not-a-date", goal_kind: "daily", days: [], target: 1 },
        null,
        { from: "2026-06-01", goal_kind: "weekly", days: [], target: 3 },
      ],
    });
    expect(habit.schedule_history.map((s) => s.from)).toEqual(["2026-06-01", "2026-07-13"]);
    expect(habit.schedule_history[0]).toEqual({
      from: "2026-06-01",
      goal_kind: "weekly",
      days: [],
      target: 3,
    });
  });

  it("keeps the newest schedule versions when the history is capped", () => {
    const many = Array.from({ length: MAX_SCHEDULE_HISTORY + 5 }, (_, i) => ({
      from: dateKey(new Date(2020, 0, 1 + i, 12)),
      goal_kind: "daily",
      days: [],
      target: 1,
    }));
    const kept = toHabit("h1", { schedule_history: many }).schedule_history;
    expect(kept).toHaveLength(MAX_SCHEDULE_HISTORY);
    expect(kept[kept.length - 1]!.from).toBe(many[many.length - 1]!.from);
  });
});

describe("date keys", () => {
  it("walks whole calendar days across a spring-forward boundary", () => {
    // US spring-forward: 2026-03-08 02:00 local jumps to 03:00, so that day is only 23h long.
    // Keys are calendar dates, not instants, so the walk must not skip or repeat one.
    expect(shiftDateKey("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDateKey("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetweenKeys("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("walks whole calendar days across a fall-back boundary", () => {
    // 2026-11-01 is 25h long in the US; 2026-10-25 is the EU equivalent.
    expect(shiftDateKey("2026-11-01", 1)).toBe("2026-11-02");
    expect(shiftDateKey("2026-10-25", 1)).toBe("2026-10-26");
    expect(daysBetweenKeys("2026-10-24", "2026-11-02")).toBe(9);
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(shiftDateKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
    expect(shiftDateKey("2027-02-28", 1)).toBe("2027-03-01");
    expect(shiftDateKey("2026-03-09", -2)).toBe("2026-03-07");
  });

  it("reports the weekday of a key, Sunday = 0", () => {
    expect(weekdayOfKey("2026-07-05")).toBe(0); // Sunday
    expect(weekdayOfKey("2026-07-06")).toBe(1); // Monday
    expect(weekdayOfKey("2026-07-11")).toBe(6); // Saturday
  });

  it("keys an instant by its local calendar date", () => {
    expect(dateKeyFromMs(at(2026, 7, 6))).toBe("2026-07-06");
    expect(dateKey(new Date(2026, 6, 6, 12))).toBe("2026-07-06");
  });
});

describe("isScheduledOn", () => {
  it("honours the weekday selection for a daily habit", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    expect(isScheduledOn(mwf, "2026-07-06")).toBe(true); // Monday
    expect(isScheduledOn(mwf, "2026-07-07")).toBe(false); // Tuesday
    expect(isScheduledOn(mwf, "2026-07-08")).toBe(true); // Wednesday
  });

  it("treats an empty weekday selection as every day", () => {
    expect(isScheduledOn(makeHabit(), "2026-07-07")).toBe(true);
  });

  it("ignores the weekday selection for flexible goals, any day counts", () => {
    // `days` belongs to the daily editor; a 3x-week goal is satisfied on any day of the week.
    const weekly = makeHabit({ goal_kind: "weekly", target: 3, days: [1, 3, 5] });
    expect(isScheduledOn(weekly, "2026-07-07")).toBe(true);
  });
});

describe("periodsBetween", () => {
  it("gives a daily habit one period per day, off-days holding nothing to do", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    const periods = periodsBetween(mwf, "2026-07-06", "2026-07-08");
    expect(periods).toHaveLength(3);
    expect(periods[0]).toEqual({
      from: "2026-07-06",
      to: "2026-07-06",
      scheduled: ["2026-07-06"],
      goal: 1,
    });
    expect(periods[1]!.scheduled).toEqual([]); // Tuesday
    expect(periods[2]!.scheduled).toEqual(["2026-07-08"]);
  });

  it("aligns weekly periods to the week-start preference", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    // Sunday-start: the week holding Wed 2026-07-08 runs Sun 05 .. Sat 11.
    const sun = periodsBetween(weekly, "2026-07-08", "2026-07-08", 0);
    expect(sun).toHaveLength(1);
    expect(sun[0]!.from).toBe("2026-07-05");
    expect(sun[0]!.to).toBe("2026-07-11");
    // Monday-start: the same day sits in Mon 06 .. Sun 12.
    const mon = periodsBetween(weekly, "2026-07-08", "2026-07-08", 1);
    expect(mon[0]!.from).toBe("2026-07-06");
    expect(mon[0]!.to).toBe("2026-07-12");
    expect(mon[0]!.scheduled).toHaveLength(7);
  });

  it("covers the whole span, so a range spanning two weeks yields both", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    const periods = periodsBetween(weekly, "2026-07-06", "2026-07-15", 1);
    expect(periods.map((p) => p.from)).toEqual(["2026-07-06", "2026-07-13"]);
  });

  it("cuts interval habits into N-day blocks anchored at the creation date", () => {
    const every3 = makeHabit({ goal_kind: "interval", target: 3 }); // created 2026-07-06
    const periods = periodsBetween(every3, "2026-07-06", "2026-07-12");
    expect(periods.map((p) => [p.from, p.to])).toEqual([
      ["2026-07-06", "2026-07-08"],
      ["2026-07-09", "2026-07-11"],
      ["2026-07-12", "2026-07-14"],
    ]);
  });

  it("anchors interval blocks consistently before the creation date", () => {
    const every3 = makeHabit({ goal_kind: "interval", target: 3 });
    const periods = periodsBetween(every3, "2026-07-01", "2026-07-03");
    // Blocks tile backwards off the same anchor rather than restarting.
    expect(periods[periods.length - 1]!.to).toBe("2026-07-05");
  });
});

describe("a span longer than the scan bound", () => {
  // Seven years of a daily habit kept every day, read up to 2033-07-06.
  const today = at(2033, 7, 6);
  const todayKey = "2033-07-06";
  const start = "2026-07-06";
  const history = done(
    ...Array.from({ length: daysBetweenKeys(start, todayKey) + 1 }, (_, i) =>
      shiftDateKey(start, i),
    ),
  );

  it("keeps the most recent periods", () => {
    const periods = periodsBetween(makeHabit(), start, todayKey);
    expect(periods).toHaveLength(MAX_SCAN_DAYS + 1);
    expect(periods[0]!.from).toBe(shiftDateKey(todayKey, -MAX_SCAN_DAYS));
    expect(periods[periods.length - 1]!.to).toBe(todayKey);
  });

  it("rates the recent periods of a long window", () => {
    // The last week missed: a scan cut at the old end would never see it.
    const lapsed = new Map(history);
    for (let i = 1; i <= 7; i++) lapsed.delete(shiftDateKey(todayKey, -i));
    const rate = completionRate(makeHabit(), lapsed, at(2026, 7, 6), today);
    expect(rate.periods).toBe(MAX_SCAN_DAYS + 1);
    expect(rate.met).toBe(MAX_SCAN_DAYS + 1 - 7);
  });

  it("charts strength up to the end of a long window", () => {
    const series = strengthSeries(makeHabit(), history, at(2026, 7, 6), today);
    expect(series[series.length - 1]!.date).toBe(todayKey);
    expect(series[series.length - 1]!.score).toBeGreaterThan(0.99);
  });
});

describe("schedule history", () => {
  // 2026-06-01 is a Monday, so June's Mondays are 1/8/15/22/29 and its Thursdays 4/11/18/25.
  const CREATED = new Date(2026, 5, 1, 12).getTime();

  /** Adapalene: two nights a week for four weeks, then escalated to four. */
  const adapalene = (history: boolean) =>
    makeHabit({
      created_at: CREATED,
      days: [1, 3, 4, 6],
      schedule_history: history
        ? [
            { from: "2026-06-01", goal_kind: "daily", days: [1, 4], target: 1 },
            { from: "2026-06-29", goal_kind: "daily", days: [1, 3, 4, 6], target: 1 },
          ]
        : [],
    });

  const kept = done(
    // Mon/Thu, kept perfectly under the original two-nights-a-week schedule.
    "2026-06-01",
    "2026-06-04",
    "2026-06-08",
    "2026-06-11",
    "2026-06-15",
    "2026-06-18",
    "2026-06-22",
    "2026-06-25",
    // From the escalation on Mon 2026-06-29, four nights a week.
    "2026-06-29",
    "2026-07-01",
    "2026-07-02",
  );

  it("keeps the streak alive when the schedule tightens", () => {
    expect(currentStreak(adapalene(true), kept, at(2026, 7, 2))).toBe(11);
  });

  it("...where without the history the same days read as a collapsed streak", () => {
    // Judging June by July's weekdays turns every Wednesday and
    // Saturday before the change into a night that was missed.
    expect(currentStreak(adapalene(false), kept, at(2026, 7, 2))).toBe(3);
  });

  it("judges a past day by the schedule in force then", () => {
    const habit = adapalene(true);
    expect(isScheduledOn(habit, "2026-06-24")).toBe(false); // a Wednesday, before the change
    expect(isScheduledOn(habit, "2026-07-01")).toBe(true); // a Wednesday, after it
  });

  it("reads a habit that has never changed exactly as one whose only version is its own", () => {
    // The upgrade guarantee: an empty history is not a special case in the engine, it simply
    // resolves to the habit's current fields for all of time.
    const never = makeHabit({ created_at: CREATED, days: [1, 4] });
    const seeded = makeHabit({
      created_at: CREATED,
      days: [1, 4],
      schedule_history: [{ from: "2026-06-01", goal_kind: "daily", days: [1, 4], target: 1 }],
    });
    expect(periodsBetween(never, "2026-06-01", "2026-07-02")).toEqual(
      periodsBetween(seeded, "2026-06-01", "2026-07-02"),
    );
    // Every Mon/Thu was kept; Wed 2026-07-01 was never scheduled for it, so it bridges.
    expect(currentStreak(never, kept, at(2026, 7, 2))).toBe(10);
  });

  it("counts a backfill from before the first version under the oldest schedule", () => {
    // A day predating every recorded version is judged by the earliest rules we know of, not the
    // newest; otherwise backfilling history would be scored against a schedule that post-dates it.
    const habit = adapalene(true);
    expect(isScheduledOn(habit, "2026-05-20")).toBe(false); // a Wednesday
    expect(isScheduledOn(habit, "2026-05-21")).toBe(true); // a Thursday
  });

  it("applies a weekly target change from the following week", () => {
    // Changed on Wed 2026-07-08: a mid-week jump would give the habit weeks starting on a
    // Wednesday, so it waits for Mon 2026-07-13.
    const habit = makeHabit({
      goal_kind: "weekly",
      target: 5,
      schedule_history: [
        { from: "2026-07-06", goal_kind: "weekly", days: [], target: 3 },
        { from: "2026-07-08", goal_kind: "weekly", days: [], target: 5 },
      ],
    });
    const periods = periodsBetween(habit, "2026-07-06", "2026-07-15", 1);
    expect(periods.map((p) => [p.from, p.goal])).toEqual([
      ["2026-07-06", 3],
      ["2026-07-13", 5],
    ]);
  });

  it("excludes the period a schedule change cut short rather than failing it", () => {
    // Weekly 3x switched to daily on Wed 2026-07-08. The Mon-Tue stub wanted three check-ins in
    // two days under one rule and one a day under the other; judging it either way is wrong.
    const habit = makeHabit({
      goal_kind: "daily",
      target: 1,
      schedule_history: [
        { from: "2026-07-06", goal_kind: "weekly", days: [], target: 3 },
        { from: "2026-07-08", goal_kind: "daily", days: [], target: 1 },
      ],
    });
    const periods = periodsBetween(habit, "2026-07-06", "2026-07-09", 1);
    expect(periods[0]).toMatchObject({ from: "2026-07-06", to: "2026-07-07", goal: 0 });
    const results = evaluatePeriods(
      done("2026-07-06", "2026-07-08", "2026-07-09"),
      periods,
      "2026-07-09",
    );
    expect(results[0]!.target).toBe(0);
    // Excluded, so it bridges: the two daily days after it are an unbroken run.
    expect(
      currentStreak(habit, done("2026-07-06", "2026-07-08", "2026-07-09"), at(2026, 7, 9), 1),
    ).toBe(2);
  });

  it("re-anchors interval blocks at the change date", () => {
    // "Every 2 days" set on the 10th counts from the 10th, not from a grid laid down at creation.
    const habit = makeHabit({
      goal_kind: "interval",
      target: 2,
      schedule_history: [
        { from: "2026-07-06", goal_kind: "interval", days: [], target: 3 },
        { from: "2026-07-10", goal_kind: "interval", days: [], target: 2 },
      ],
    });
    const periods = periodsBetween(habit, "2026-07-06", "2026-07-13");
    expect(periods.map((p) => [p.from, p.to, p.goal])).toEqual([
      ["2026-07-06", "2026-07-08", 1],
      ["2026-07-09", "2026-07-09", 0], // cut by the change, so excluded
      ["2026-07-10", "2026-07-11", 1],
      ["2026-07-12", "2026-07-13", 1],
    ]);
  });
});

describe("appendScheduleChange", () => {
  const CREATED = new Date(2026, 6, 6, 12).getTime(); // 2026-07-06
  const CHANGED = new Date(2026, 6, 13, 12).getTime(); // 2026-07-13

  it("seeds the habit's existing schedule before recording the first change", () => {
    const habit = makeHabit({ created_at: CREATED, days: [1, 4] });
    const history = appendScheduleChange(habit, { days: [1, 3, 4, 6] }, CHANGED);
    expect(history).toEqual([
      { from: "2026-07-06", goal_kind: "daily", days: [1, 4], target: 1 },
      { from: "2026-07-13", goal_kind: "daily", days: [1, 3, 4, 6], target: 1 },
    ]);
  });

  it("replaces the same day's entry rather than appending", () => {
    // The goal editor writes the kind and the weekdays as separate calls, and every stepper press
    // is another one; so a minute of fiddling must collapse to one version, not five.
    const habit = makeHabit({ created_at: CREATED, days: [1, 4] });
    const first = appendScheduleChange(habit, { goal_kind: "weekly", target: 3 }, CHANGED)!;
    const after = makeHabit({ ...habit, goal_kind: "weekly", target: 3, schedule_history: first });
    const second = appendScheduleChange(after, { target: 4 }, CHANGED);
    expect(second).toHaveLength(2);
    expect(second![1]).toMatchObject({ from: "2026-07-13", goal_kind: "weekly", target: 4 });
  });

  it("records nothing when the patch changes no schedule field", () => {
    const habit = makeHabit({ created_at: CREATED, days: [1, 4] });
    expect(appendScheduleChange(habit, {}, CHANGED)).toBeNull();
    // Same weekdays in a different order is the same schedule.
    expect(appendScheduleChange(habit, { days: [4, 1] }, CHANGED)).toBeNull();
    // `daily` ignores `target` entirely, so moving it is not a change to the schedule.
    expect(appendScheduleChange(habit, { target: 5 }, CHANGED)).toBeNull();
  });

  it("collapses a change undone on the same day", () => {
    const habit = makeHabit({ created_at: CREATED, days: [1, 4] });
    const first = appendScheduleChange(habit, { goal_kind: "weekly", target: 3 }, CHANGED)!;
    const after = makeHabit({ ...habit, goal_kind: "weekly", target: 3, schedule_history: first });
    // Back to where it started: one version, not two saying the same thing.
    const undone = appendScheduleChange(after, { goal_kind: "daily", days: [1, 4] }, CHANGED);
    expect(undone).toHaveLength(1);
  });
});

describe("the skip rule", () => {
  const evaluate = (
    habit: Habit,
    s: Map<string, CheckinState>,
    from: string,
    to: string,
    today: string,
  ) => evaluatePeriods(s, periodsBetween(habit, from, to, 1), today);

  it("excludes a daily period whose only scheduled day was skipped", () => {
    const [period] = evaluate(
      makeHabit(),
      states({ "2026-07-07": "skip" }),
      "2026-07-07",
      "2026-07-07",
      "2026-07-09",
    );
    expect(period!.skipped).toBe(1);
    expect(period!.target).toBe(0); // 0 => excluded from streak and rate entirely
    expect(period!.met).toBe(false);
  });

  it("lowers a weekly target by the number of skipped days", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    const [period] = evaluate(
      weekly,
      states({
        "2026-07-06": "skip",
        "2026-07-07": "skip",
        "2026-07-08": "skip",
        "2026-07-09": "skip",
        "2026-07-10": "skip",
        "2026-07-11": "done",
        "2026-07-12": "done",
      }),
      "2026-07-06",
      "2026-07-12",
      "2026-07-20",
    );
    // 7 days - 5 skipped = 2 available, so the 3x goal drops to 2; and 2 were done.
    expect(period!.target).toBe(2);
    expect(period!.done).toBe(2);
    expect(period!.met).toBe(true);
  });

  it("excludes a weekly period where every day was skipped", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    const all: Record<string, CheckinState> = {};
    for (let i = 0; i < 7; i++) all[shiftDateKey("2026-07-06", i)] = "skip";
    const [period] = evaluate(weekly, states(all), "2026-07-06", "2026-07-12", "2026-07-20");
    expect(period!.target).toBe(0);
  });

  it("never counts a skip as a completion", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 2 });
    const [period] = evaluate(
      weekly,
      states({ "2026-07-06": "done", "2026-07-07": "skip" }),
      "2026-07-06",
      "2026-07-12",
      "2026-07-20",
    );
    expect(period!.done).toBe(1);
    expect(period!.target).toBe(2); // 6 days still available, so the goal stands
    expect(period!.met).toBe(false);
  });
});

describe("currentStreak: daily", () => {
  it("counts consecutive completed days", () => {
    const s = done("2026-07-06", "2026-07-07", "2026-07-08");
    expect(currentStreak(makeHabit(), s, at(2026, 7, 8))).toBe(3);
  });

  it("breaks on a missed day", () => {
    const s = done("2026-07-06", "2026-07-08");
    expect(currentStreak(makeHabit(), s, at(2026, 7, 8))).toBe(1);
  });

  it("grants today grace: not yet done today does not break the streak", () => {
    const s = done("2026-07-06", "2026-07-07");
    expect(currentStreak(makeHabit(), s, at(2026, 7, 8))).toBe(2);
  });

  it("skips off-days entirely: they neither count nor break", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    // Mon 06, Wed 08, Fri 10 done; Tue/Thu are not scheduled.
    const s = done("2026-07-06", "2026-07-08", "2026-07-10");
    expect(currentStreak(mwf, s, at(2026, 7, 10))).toBe(3);
  });

  it("breaks when a scheduled day is missed", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    const s = done("2026-07-06", "2026-07-10"); // Wed 08 missed
    expect(currentStreak(mwf, s, at(2026, 7, 10))).toBe(1);
  });

  it("bridges a streak across a skipped day", () => {
    const s = new Map<string, CheckinState>([
      ["2026-07-06", "done"],
      ["2026-07-07", "skip"],
      ["2026-07-08", "done"],
    ]);
    // The skipped day is excluded, so the two done days remain consecutive.
    expect(currentStreak(makeHabit(), s, at(2026, 7, 8))).toBe(2);
  });
});

describe("currentStreak: weekly", () => {
  const weekly = makeHabit({ goal_kind: "weekly", target: 3 });

  it("counts consecutive satisfied weeks, not days", () => {
    const s = done(
      // week of Mon 2026-06-22
      "2026-06-22",
      "2026-06-24",
      "2026-06-26",
      // week of Mon 2026-06-29
      "2026-06-29",
      "2026-07-01",
      "2026-07-03",
      // week of Mon 2026-07-06 (the in-progress week)
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    );
    expect(currentStreak(weekly, s, at(2026, 7, 8), 1)).toBe(3);
  });

  it("does not count an in-progress week as broken while it is still short", () => {
    const s = done(
      "2026-06-22",
      "2026-06-24",
      "2026-06-26",
      "2026-06-29",
      "2026-07-01",
      "2026-07-03",
      // this week only 2 of 3 so far; in progress, not failed
      "2026-07-06",
      "2026-07-07",
    );
    expect(currentStreak(weekly, s, at(2026, 7, 8), 1)).toBe(2);
  });

  it("counts the in-progress week once its goal is met", () => {
    const s = done(
      "2026-06-29",
      "2026-07-01",
      "2026-07-03",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    );
    expect(currentStreak(weekly, s, at(2026, 7, 8), 1)).toBe(2);
  });

  it("breaks on a completed week that fell short", () => {
    const s = done(
      "2026-06-22",
      "2026-06-24",
      "2026-06-26",
      "2026-06-29",
      "2026-07-01", // only 2 of 3 in a finished week
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    );
    expect(currentStreak(weekly, s, at(2026, 7, 8), 1)).toBe(1);
  });

  it("follows the week-start preference", () => {
    // Sun 2026-07-05 + Mon 06 + Tue 07. Under a Sunday start those are one week (3/3 met);
    // under a Monday start Sunday belongs to the previous week, so neither week reaches 3.
    const s = done("2026-07-05", "2026-07-06", "2026-07-07");
    expect(currentStreak(weekly, s, at(2026, 7, 7), 0)).toBe(1);
    expect(currentStreak(weekly, s, at(2026, 7, 7), 1)).toBe(0);
  });
});

describe("currentStreak: interval", () => {
  it("counts consecutive satisfied blocks", () => {
    const every3 = makeHabit({ goal_kind: "interval", target: 3 });
    // Blocks from 2026-07-06: [06..08], [09..11], [12..14].
    const s = done("2026-07-06", "2026-07-10", "2026-07-13");
    expect(currentStreak(every3, s, at(2026, 7, 13))).toBe(3);
  });

  it("breaks when a block passed with nothing in it", () => {
    const every3 = makeHabit({ goal_kind: "interval", target: 3 });
    const s = done("2026-07-06", "2026-07-13"); // block [09..11] empty
    expect(currentStreak(every3, s, at(2026, 7, 13))).toBe(1);
  });

  it("does not break while the current block is still open", () => {
    const every3 = makeHabit({ goal_kind: "interval", target: 3 });
    const s = done("2026-07-06", "2026-07-10");
    // 2026-07-12 opens block [12..14]; nothing done in it yet, but it has not ended.
    expect(currentStreak(every3, s, at(2026, 7, 12))).toBe(2);
  });
});

describe("isActiveToday", () => {
  // 2026-07-08 is a Wednesday.
  const WED = at(2026, 7, 8);

  it("wants a check-in on a scheduled day it has not been done on", () => {
    expect(isActiveToday(makeHabit(), new Map(), WED)).toBe(true);
  });

  it("drops off on a weekday it is not scheduled for", () => {
    const monThu = makeHabit({ days: [1, 4] });
    expect(isActiveToday(monThu, new Map(), WED)).toBe(false);
    expect(isActiveToday(monThu, new Map(), at(2026, 7, 9))).toBe(true); // Thursday
  });

  it("stays once it has been done today, so ticking it never makes it vanish", () => {
    expect(isActiveToday(makeHabit(), done("2026-07-08"), WED)).toBe(true);
  });

  it("stays once today has been skipped, so the skip is still reversible", () => {
    expect(isActiveToday(makeHabit(), states({ "2026-07-08": "skip" }), WED)).toBe(true);
  });

  it("keeps asking a weekly goal until its week is met, then stops", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    expect(isActiveToday(weekly, done("2026-07-06"), WED, 1)).toBe(true);
    expect(isActiveToday(weekly, done("2026-07-06", "2026-07-07", "2026-07-09"), WED, 1)).toBe(
      false,
    );
  });

  it("stops asking an interval habit once its block is satisfied", () => {
    // Blocks of 3 from 2026-07-06: [06..08] holds today.
    const every3 = makeHabit({ goal_kind: "interval", target: 3 });
    expect(isActiveToday(every3, new Map(), WED)).toBe(true);
    expect(isActiveToday(every3, done("2026-07-06"), WED)).toBe(false);
  });

  it("never lists an archived habit", () => {
    expect(isActiveToday(makeHabit({ archived_at: 1 }), new Map(), WED)).toBe(false);
  });

  it("judges the day by the schedule that was in force then", () => {
    // Wednesday was an off-day until the escalation on 2026-07-08 made it a scheduled one.
    const escalated = makeHabit({
      days: [1, 3, 4],
      schedule_history: [
        { from: "2026-07-01", goal_kind: "daily", days: [1, 4], target: 1 },
        { from: "2026-07-08", goal_kind: "daily", days: [1, 3, 4], target: 1 },
      ],
    });
    expect(isActiveToday(escalated, new Map(), WED)).toBe(true);
    expect(isActiveToday(escalated, new Map(), at(2026, 7, 1))).toBe(false);
  });
});

describe("bestStreak", () => {
  it("reports the longest run ever, not the current one", () => {
    const s = done(
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09", // run of 4
      // 2026-07-10 missed
      "2026-07-11",
      "2026-07-12", // current run of 2
    );
    const habit = makeHabit();
    expect(bestStreak(habit, s, at(2026, 7, 12))).toBe(4);
    expect(currentStreak(habit, s, at(2026, 7, 12))).toBe(2);
  });

  it("is at least the current streak", () => {
    const s = done("2026-07-06", "2026-07-07", "2026-07-08");
    expect(bestStreak(makeHabit(), s, at(2026, 7, 8))).toBe(3);
  });
});

describe("completionRate", () => {
  it("counts satisfied periods over the window", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    // Mon 06 .. Fri 17 is 6 scheduled days; 4 done.
    const s = done("2026-07-06", "2026-07-08", "2026-07-13", "2026-07-17");
    const rate = completionRate(mwf, s, at(2026, 7, 6), at(2026, 7, 17), 1);
    expect(rate.periods).toBe(6);
    expect(rate.met).toBe(4);
    expect(rate.rate).toBeCloseTo(4 / 6, 5);
  });

  it("is 0 when the window holds nothing scheduled", () => {
    const sundays = makeHabit({ days: [0] });
    const rate = completionRate(sundays, new Map(), at(2026, 7, 6), at(2026, 7, 8), 1);
    expect(rate).toEqual({ periods: 0, met: 0, rate: 0 });
  });

  it("excludes skipped periods rather than counting them as failures", () => {
    const s = new Map<string, CheckinState>([
      ["2026-07-06", "done"],
      ["2026-07-07", "skip"],
      ["2026-07-08", "done"],
    ]);
    const rate = completionRate(makeHabit(), s, at(2026, 7, 6), at(2026, 7, 8), 1);
    expect(rate).toEqual({ periods: 2, met: 2, rate: 1 });
  });

  it("does not hold an unfinished period against you", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    const s = done("2026-06-29", "2026-07-01", "2026-07-03", "2026-07-06");
    // The week of 07-06 is still in progress with 1 of 3; it is not counted as a miss.
    const rate = completionRate(weekly, s, at(2026, 6, 29), at(2026, 7, 8), 1);
    expect(rate).toEqual({ periods: 1, met: 1, rate: 1 });
  });
});

describe("strength", () => {
  /** `n` consecutive day keys starting at `from`. */
  const run = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => shiftDateKey(from, i));

  it("reaches about 80% after a month of a daily habit", () => {
    // Loop's documented curve: multiplier 0.5 ** (sqrt(frequency) / 13), which puts a perfect
    // daily habit near 80% at one month. This pins our port to the published behaviour.
    const score = currentStrength(makeHabit(), done(...run("2026-07-06", 30)), at(2026, 8, 4));
    expect(score).toBeGreaterThan(0.78);
    expect(score).toBeLessThan(0.82);
  });

  it("dips on a miss instead of resetting to zero", () => {
    const keys = run("2026-07-06", 30); // 07-06 .. 08-04
    // Read the day *after* the last one, so the miss has settled: evaluated on 08-04 itself it
    // would still be in progress, and the grace would hide the dip this test is about.
    const perfect = currentStrength(makeHabit(), done(...keys), at(2026, 8, 5));
    const missed = currentStrength(makeHabit(), done(...keys.slice(0, 29)), at(2026, 8, 5));
    expect(missed).toBeLessThan(perfect);
    expect(missed).toBeGreaterThan(0.7); // a single miss is a dip, not a wipe
  });

  it("leaves the score unchanged across a skipped day", () => {
    const base = done(...run("2026-07-06", 10)); // 07-06 .. 07-15
    const withSkip = new Map(base);
    withSkip.set("2026-07-16", "skip");
    expect(currentStrength(makeHabit(), withSkip, at(2026, 7, 16))).toBeCloseTo(
      currentStrength(makeHabit(), base, at(2026, 7, 15)),
      10,
    );
  });

  it("emits one point per period, oldest first", () => {
    const series = strengthSeries(
      makeHabit(),
      done("2026-07-06", "2026-07-07"),
      at(2026, 7, 6),
      at(2026, 7, 8),
    );
    expect(series.map((p) => p.date)).toEqual(["2026-07-06", "2026-07-07", "2026-07-08"]);
    expect(series[0]!.score).toBeGreaterThan(0);
    expect(series[1]!.score).toBeGreaterThan(series[0]!.score);
  });

  it("starts from zero for a habit with no history", () => {
    expect(currentStrength(makeHabit(), new Map(), at(2026, 7, 8))).toBe(0);
  });

  it("scores each period at the rate that was in force when it ran", () => {
    // A habit that was daily for a month and is now weekly must not have that month re-scored at
    // the weekly rate: the decay is per-day raised to the period length, so a habit-wide exponent
    // would move all thirty of those daily steps as though each had been a whole week.
    const keys = run("2026-07-06", 30); // 07-06 .. 08-04, all kept
    const daily = makeHabit();
    const switched = makeHabit({
      goal_kind: "weekly",
      target: 3,
      schedule_history: [
        { from: "2026-07-06", goal_kind: "daily", days: [], target: 1 },
        // Aligns forward to Mon 2026-08-10, so all of the run above is still daily.
        { from: "2026-08-06", goal_kind: "weekly", days: [], target: 3 },
      ],
    });
    const before = at(2026, 8, 4);
    expect(strengthSeries(switched, done(...keys), before, before, 1)).toEqual(
      strengthSeries(daily, done(...keys), before, before, 1),
    );
  });
});

describe("nextDue", () => {
  it("is today when a daily habit has not been done yet", () => {
    expect(nextDue(makeHabit(), new Map(), at(2026, 7, 8))).toBe("2026-07-08");
  });

  it("rolls to the next scheduled day once today is done", () => {
    const mwf = makeHabit({ days: [1, 3, 5] });
    expect(nextDue(mwf, done("2026-07-08"), at(2026, 7, 8))).toBe("2026-07-10");
  });

  it("rolls past a skipped day", () => {
    const s = new Map<string, CheckinState>([
      ["2026-07-08", "done"],
      ["2026-07-09", "skip"],
    ]);
    expect(nextDue(makeHabit(), s, at(2026, 7, 8))).toBe("2026-07-10");
  });

  it("stays today while a weekly goal is still short", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 3 });
    expect(nextDue(weekly, done("2026-07-06"), at(2026, 7, 8), 1)).toBe("2026-07-08");
  });

  it("rolls to the next week once the weekly goal is met", () => {
    const weekly = makeHabit({ goal_kind: "weekly", target: 2 });
    const s = done("2026-07-06", "2026-07-07");
    expect(nextDue(weekly, s, at(2026, 7, 8), 1)).toBe("2026-07-13");
  });
});

describe("totalCheckins", () => {
  it("counts completions over all time and ignores skips", () => {
    const s = new Map<string, CheckinState>([
      ["2026-07-06", "done"],
      ["2026-07-07", "skip"],
      ["2026-07-08", "done"],
    ]);
    expect(totalCheckins(s)).toBe(2);
  });
});
