import { describe, it, expect } from "vitest";
import {
  flattenHabitGroups,
  habitGroupBestStreak,
  habitGroupBreak,
  habitGroupDays,
  habitGroupRate,
  habitGroupStreak,
  habitGroupToday,
  habitSiblings,
  hiddenHabitIds,
  moveHabitTarget,
  type HabitGroupMember,
} from "./habitGroups";
import { daysBetweenKeys, shiftDateKey, type CheckinState, type Habit } from "./habits";

/** 2026-07-06 is a Monday. */
const CREATED = new Date(2026, 6, 6, 12).getTime();
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

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
    created_at: CREATED,
    sort_order: 0,
    ...over,
  };
}

const group = (over: Partial<Habit> = {}) =>
  makeHabit({ kind: "group", name: "Skincare", ...over });
const done = (...keys: string[]): Map<string, CheckinState> =>
  new Map(keys.map((k) => [k, "done" as CheckinState]));
const member = (habit: Habit, states: Map<string, CheckinState> = new Map()): HabitGroupMember => ({
  habit,
  states,
});

describe("flattenHabitGroups", () => {
  it("emits each group followed by its members, standalone habits keeping their place", () => {
    const rows = flattenHabitGroups([
      makeHabit({ id: "solo", name: "Read", sort_order: 1 }),
      group({ id: "g", sort_order: 2 }),
      makeHabit({ id: "m2", parent_id: "g", sort_order: 4 }),
      makeHabit({ id: "m1", parent_id: "g", sort_order: 3 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["solo", "g", "m1", "m2"]);
    expect(rows[1]).toMatchObject({ kind: "group", memberCount: 2, expanded: true });
    expect(rows[2]).toMatchObject({ kind: "habit", depth: 1 });
    expect(rows[0]).toMatchObject({ kind: "habit", depth: 0 });
  });

  it("renders a member whose group is gone at the top level rather than losing it", () => {
    // A purge race, or a member that synced in before its group did.
    const rows = flattenHabitGroups([makeHabit({ id: "m", parent_id: "missing" })]);
    expect(rows).toEqual([
      { kind: "habit", key: "m", habit: expect.objectContaining({ id: "m" }), depth: 0 },
    ]);
  });

  it("refuses to nest: a group named as a parent that is not one is ignored", () => {
    const rows = flattenHabitGroups([
      makeHabit({ id: "a", sort_order: 1 }),
      makeHabit({ id: "b", parent_id: "a", sort_order: 2 }),
    ]);
    expect(rows.map((r) => [r.key, r.kind === "habit" ? r.depth : null])).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
  });

  it("keeps a group at the top level even if it somehow carries a parent", () => {
    const rows = flattenHabitGroups([
      group({ id: "outer", sort_order: 1 }),
      group({ id: "inner", parent_id: "outer", sort_order: 2 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["outer", "inner"]);
  });

  it("hides a collapsed group's members but keeps its count", () => {
    const habits = [group({ id: "g" }), makeHabit({ id: "m", parent_id: "g", sort_order: 1 })];
    const rows = flattenHabitGroups(habits, () => false);
    expect(rows.map((r) => r.key)).toEqual(["g"]);
    expect(rows[0]).toMatchObject({ memberCount: 1, expanded: false });
  });
});

describe("hiddenHabitIds", () => {
  const rows = (over: Record<string, Partial<Record<string, number | null>>> = {}) => [
    { id: "g", parent_id: null, archived_at: null, deleted_at: null, ...over.g },
    { id: "m", parent_id: "g", archived_at: null, deleted_at: null, ...over.m },
    { id: "solo", parent_id: null, archived_at: null, deleted_at: null, ...over.solo },
  ];

  it("hides a member of an archived group, and of a trashed one", () => {
    expect([...hiddenHabitIds(rows({ g: { archived_at: 1 } }))].sort()).toEqual(["g", "m"]);
    expect([...hiddenHabitIds(rows({ g: { deleted_at: 1 } }))].sort()).toEqual(["g", "m"]);
  });

  it("brings the members back when the group is restored", () => {
    expect(hiddenHabitIds(rows()).size).toBe(0);
  });

  it("hides a habit archived in its own right, and nothing else", () => {
    expect([...hiddenHabitIds(rows({ m: { archived_at: 1 } }))]).toEqual(["m"]);
  });
});

describe("moveHabitTarget", () => {
  const habits = [
    group({ id: "g", sort_order: 1 }),
    makeHabit({ id: "m", parent_id: "g", sort_order: 2 }),
    makeHabit({ id: "solo", sort_order: 3 }),
  ];

  it("puts a standalone habit at the end of a group", () => {
    expect(moveHabitTarget(habits, "solo", "g")).toMatchObject({ id: "solo", parent_id: "g" });
    expect(moveHabitTarget(habits, "solo", "g")!.sort_order).toBeGreaterThan(2);
  });

  it("takes a member back out", () => {
    expect(moveHabitTarget(habits, "m", null)).toMatchObject({ id: "m", parent_id: null });
  });

  it("refuses to put a group inside a group", () => {
    const two = [...habits, group({ id: "g2", sort_order: 4 })];
    expect(moveHabitTarget(two, "g2", "g")).toBeNull();
  });

  it("refuses a habit that is not a group as a destination", () => {
    expect(moveHabitTarget(habits, "m", "solo")).toBeNull();
    expect(moveHabitTarget(habits, "solo", "nope")).toBeNull();
  });

  it("is a no-op when the habit is already there", () => {
    expect(moveHabitTarget(habits, "m", "g")).toBeNull();
    expect(moveHabitTarget(habits, "solo", null)).toBeNull();
  });
});

describe("the combined streak", () => {
  const morning = makeHabit({ id: "morning", created_at: at(2026, 7, 1) });
  const evening = makeHabit({ id: "evening", days: [1, 4], created_at: at(2026, 7, 1) });

  it("counts a day only when every member that owed one got one", () => {
    const day = habitGroupDays(
      [member(morning, done("2026-07-06")), member(evening, done("2026-07-06"))],
      "2026-07-06",
      "2026-07-06",
      "2026-07-06",
    )[0]!;
    expect(day).toMatchObject({ due: 2, done: 2, met: true, excluded: false });
  });

  it("misses the day when one member is still unrecorded", () => {
    const day = habitGroupDays(
      [member(morning, done("2026-07-06")), member(evening)],
      "2026-07-06",
      "2026-07-06",
      "2026-07-06",
    )[0]!;
    expect(day).toMatchObject({ due: 2, done: 1, met: false });
  });

  it("excludes a day nobody was scheduled on, and bridges the streak across it", () => {
    // Only the Mon/Thu habit, so Tuesday belongs to nobody.
    const m = member(evening, done("2026-07-06", "2026-07-09"));
    const days = habitGroupDays([m], "2026-07-06", "2026-07-09", "2026-07-09");
    expect(days.map((d) => d.excluded)).toEqual([false, true, true, false]);
    expect(habitGroupStreak([m], at(2026, 7, 9))).toBe(2);
  });

  it("excludes a day every scheduled member skipped", () => {
    const skipped = new Map<string, CheckinState>([["2026-07-06", "skip"]]);
    const day = habitGroupDays(
      [member(morning, skipped)],
      "2026-07-06",
      "2026-07-06",
      "2026-07-06",
    )[0]!;
    expect(day).toMatchObject({ due: 0, excluded: true });
  });

  it("counts a day where one member skipped and the other did it", () => {
    const skipped = new Map<string, CheckinState>([["2026-07-06", "skip"]]);
    const day = habitGroupDays(
      [member(morning, skipped), member(evening, done("2026-07-06"))],
      "2026-07-06",
      "2026-07-06",
      "2026-07-06",
    )[0]!;
    expect(day).toMatchObject({ due: 1, done: 1, met: true });
  });

  it("gives today the same grace a habit's own current period gets", () => {
    const m = member(morning, done("2026-07-06"));
    // 2026-07-07 is unfinished, not failed.
    expect(habitGroupStreak([m], at(2026, 7, 7))).toBe(1);
    expect(
      habitGroupStreak([member(morning, done("2026-07-06", "2026-07-07"))], at(2026, 7, 7)),
    ).toBe(2);
  });

  it("ignores an archived member entirely", () => {
    const gone = makeHabit({ id: "gone", archived_at: 1, created_at: at(2026, 7, 1) });
    const day = habitGroupDays(
      [member(morning, done("2026-07-06")), member(gone)],
      "2026-07-06",
      "2026-07-06",
      "2026-07-06",
    )[0]!;
    expect(day).toMatchObject({ due: 1, met: true });
  });

  it("has no streak and nothing due when the group is empty", () => {
    expect(habitGroupStreak([], at(2026, 7, 6))).toBe(0);
    expect(habitGroupToday([], at(2026, 7, 6))).toMatchObject({ due: 0, excluded: true });
  });

  describe("with a flexible member", () => {
    const weekly = makeHabit({
      id: "gym",
      goal_kind: "weekly",
      target: 3,
      created_at: at(2026, 7, 1),
    });

    it("does not fail the routine's Tuesday for a week that is merely still short", () => {
      // 1 of 3 on Tuesday has not failed; it fails on Sunday if it ends short.
      const m = member(weekly, done("2026-07-06"));
      const tuesday = habitGroupDays([m], "2026-07-07", "2026-07-07", "2026-07-07", 1)[0]!;
      expect(tuesday).toMatchObject({ due: 0, excluded: true });
    });

    it("credits the day a flexible member actually acted", () => {
      const m = member(weekly, done("2026-07-06"));
      const monday = habitGroupDays([m], "2026-07-06", "2026-07-06", "2026-07-07", 1)[0]!;
      expect(monday).toMatchObject({ due: 1, done: 1, met: true });
    });

    it("does not leak an earlier check-in into a later single-day window", () => {
      // The member's period spans the whole week even when one day is asked for.
      const m = member(weekly, done("2026-07-06"));
      const friday = habitGroupDays([m], "2026-07-10", "2026-07-10", "2026-07-10", 1)[0]!;
      expect(friday).toMatchObject({ due: 0, excluded: true });
    });

    it("misses on the day a short week runs out", () => {
      // Week of Mon 2026-07-06 closes Sun the 12th with 2 of 3.
      const m = member(weekly, done("2026-07-06", "2026-07-07"));
      const days = habitGroupDays([m], "2026-07-06", "2026-07-13", "2026-07-13", 1);
      const sunday = days.find((d) => d.date === "2026-07-12")!;
      expect(sunday).toMatchObject({ due: 1, done: 0, met: false });
      expect(habitGroupStreak([m], at(2026, 7, 13), 1)).toBe(0);
    });
  });

  describe("the skincare routine", () => {
    // Morning every day, plus exactly one evening habit per night: two members due daily.
    const evenings = [
      makeHabit({ id: "adapalene", days: [1, 4], created_at: at(2026, 7, 1) }),
      makeHabit({ id: "salicylic", days: [2, 6], created_at: at(2026, 7, 1) }),
      makeHabit({ id: "recovery", days: [0, 3, 5], created_at: at(2026, 7, 1) }),
    ];
    const week = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];

    const routine = (kept: string[]): HabitGroupMember[] => [
      member(morning, done(...kept)),
      ...evenings.map((h) => member(h, done(...kept))),
    ];

    it("owes exactly two members every day", () => {
      const days = habitGroupDays(routine(week), "2026-07-06", "2026-07-10", "2026-07-10");
      expect(days.map((d) => d.due)).toEqual([2, 2, 2, 2, 2]);
    });

    it("gives one streak for the whole routine", () => {
      expect(habitGroupStreak(routine(week), at(2026, 7, 10))).toBe(5);
    });

    it("breaks on the night that was missed, and starts again after it", () => {
      // Everything but Wednesday's recovery night.
      const kept = week.filter((d) => d !== "2026-07-08");
      const members = [
        member(morning, done(...week)),
        member(evenings[0]!, done(...week)),
        member(evenings[1]!, done(...week)),
        member(evenings[2]!, done(...kept)),
      ];
      const days = habitGroupDays(members, "2026-07-06", "2026-07-10", "2026-07-10");
      expect(days.map((d) => d.met)).toEqual([true, true, false, true, true]);
      expect(habitGroupStreak(members, at(2026, 7, 10))).toBe(2);
      expect(habitGroupBestStreak(members, at(2026, 7, 10))).toBe(2);
      expect(habitGroupRate(members, at(2026, 7, 6), at(2026, 7, 10))).toMatchObject({
        periods: 5,
        met: 4,
      });
    });
  });
});

describe("a member's own history floor", () => {
  // The routine's window starts at the earliest day *any* member recorded, so a member that did not
  // exist yet must not be judged over all of it; see the comment in `habitGroupDays`.
  const week = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];
  const veteran = makeHabit({ id: "veteran", created_at: at(2026, 7, 1) });

  it("does not rewrite the routine's past when a habit is added today", () => {
    const members = [
      member(veteran, done(...week)),
      // Created today, never checked: it owes today (which is still in progress) and nothing before.
      member(makeHabit({ id: "fresh", created_at: at(2026, 7, 10) })),
    ];
    const days = habitGroupDays(members, "2026-07-06", "2026-07-10", "2026-07-10");
    expect(days.map((d) => d.due)).toEqual([1, 1, 1, 1, 2]);
    expect(days.map((d) => d.met)).toEqual([true, true, true, true, false]);
    // The unmet day is today, which is in progress; so the veteran's run survives the addition.
    expect(habitGroupStreak(members, at(2026, 7, 10))).toBe(4);
    expect(habitGroupBreak(members, at(2026, 7, 10))).toBeNull();
  });

  it("owes nothing before the day the member was created", () => {
    const members = [
      member(veteran, done(...week)),
      member(
        makeHabit({ id: "joined", created_at: at(2026, 7, 9) }),
        done("2026-07-09", "2026-07-10"),
      ),
    ];
    const days = habitGroupDays(members, "2026-07-06", "2026-07-10", "2026-07-10");
    expect(days.map((d) => d.due)).toEqual([1, 1, 1, 2, 2]);
    expect(habitGroupStreak(members, at(2026, 7, 10))).toBe(5);
  });

  it("still counts a check-in backfilled before the habit was created", () => {
    // Recording what happened is allowed to predate the row, so the floor takes the earlier of the
    // two; and the days between the backfill and creation are then judged like any other.
    const backfilled = member(
      makeHabit({ id: "backfilled", created_at: at(2026, 7, 9) }),
      done("2026-07-06"),
    );
    const days = habitGroupDays([backfilled], "2026-07-06", "2026-07-07", "2026-07-10");
    expect(days.map((d) => d.due)).toEqual([1, 1]);
    expect(days.map((d) => d.met)).toEqual([true, false]);
  });

  it("treats a habit stamped into the future by a skewed clock as created today", () => {
    // Clocks are per device, so `created_at` can land ahead of today. Taken at face value the floor
    // would drop the member out of the routine until the date caught up.
    const skewed = member(makeHabit({ id: "skewed", created_at: at(2026, 9, 1) }));
    const days = habitGroupDays([skewed], "2026-07-10", "2026-07-10", "2026-07-10");
    expect(days[0]).toMatchObject({ due: 1, done: 0, met: false, inProgress: true });
  });

  it("skips a member created after the window it is asked about", () => {
    const later = member(makeHabit({ id: "later", created_at: at(2026, 7, 20) }));
    const days = habitGroupDays([later], "2026-07-06", "2026-07-08", "2026-07-20");
    expect(days.map((d) => d.due)).toEqual([0, 0, 0]);
    expect(days.every((d) => d.excluded)).toBe(true);
  });
});

describe("a long window", () => {
  it("keeps a member's most recent days when its history outruns the scan bound", () => {
    // A member created seven years before the window's end, kept every day until the day before
    // yesterday: yesterday's miss is what a scan cut at the recent end would lose.
    const todayKey = "2033-07-06";
    const keys = Array.from({ length: daysBetweenKeys("2026-07-06", "2033-07-04") + 1 }, (_, i) =>
      shiftDateKey("2026-07-06", i),
    );
    const days = habitGroupDays(
      [member(makeHabit(), done(...keys))],
      "2026-07-06",
      todayKey,
      todayKey,
    );
    expect(days.find((d) => d.date === "2033-07-05")).toMatchObject({ due: 1, done: 0 });
    expect(days[days.length - 1]!.date).toBe(todayKey);
  });
});

describe("habitGroupBreak", () => {
  // Morning every day, plus exactly one evening habit per night.
  const morning = makeHabit({ id: "morning", created_at: at(2026, 7, 1) });
  const evenings = [
    makeHabit({ id: "adapalene", days: [1, 4], created_at: at(2026, 7, 1) }),
    makeHabit({ id: "salicylic", days: [2, 6], created_at: at(2026, 7, 1) }),
    makeHabit({ id: "recovery", days: [0, 3, 5], created_at: at(2026, 7, 1) }),
  ];
  const week = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];
  const kept = (skip?: string) => {
    const days = skip === undefined ? week : week.filter((d) => d !== skip);
    return [member(morning, done(...week)), ...evenings.map((h) => member(h, done(...days)))];
  };

  it("names the day the routine broke and who was not done", () => {
    // Wednesday the 8th is recovery's night, and it was missed.
    expect(habitGroupBreak(kept("2026-07-08"), at(2026, 7, 10))).toEqual({
      date: "2026-07-08",
      missing: ["recovery"],
    });
  });

  it("looks past the days that were kept since", () => {
    // Two clean days sit between the miss and today; the break is still the older day.
    const days = habitGroupDays(kept("2026-07-08"), "2026-07-06", "2026-07-10", "2026-07-10");
    expect(days.map((d) => d.met)).toEqual([true, true, false, true, true]);
    expect(habitGroupStreak(kept("2026-07-08"), at(2026, 7, 10))).toBe(2);
  });

  it("is null for a routine that has never been broken", () => {
    expect(habitGroupBreak(kept(), at(2026, 7, 10))).toBeNull();
  });

  it("does not count today, which is still in progress", () => {
    // Kept through yesterday, nothing recorded today: not a break yet.
    const throughYesterday = week.slice(0, 4);
    const members = [
      member(morning, done(...throughYesterday)),
      ...evenings.map((h) => member(h, done(...throughYesterday))),
    ];
    expect(habitGroupBreak(members, at(2026, 7, 10))).toBeNull();
    expect(habitGroupStreak(members, at(2026, 7, 10))).toBe(4);
  });

  it("reports every member that owed the day", () => {
    // Nobody did anything on Wednesday: the morning habit and that night's evening both owed it.
    const members = [
      member(morning, done(...week.filter((d) => d !== "2026-07-08"))),
      ...evenings.map((h) => member(h, done(...week.filter((d) => d !== "2026-07-08")))),
    ];
    expect(habitGroupBreak(members, at(2026, 7, 10))).toEqual({
      date: "2026-07-08",
      missing: ["morning", "recovery"],
    });
  });
});

describe("habitSiblings", () => {
  /** solo(1) / group g(2) / member m1(3) / member m2(4) / solo2(5) */
  const HABITS = [
    makeHabit({ id: "solo", sort_order: 1 }),
    makeHabit({ id: "g", kind: "group", sort_order: 2 }),
    makeHabit({ id: "m1", parent_id: "g", sort_order: 3 }),
    makeHabit({ id: "m2", parent_id: "g", sort_order: 4 }),
    makeHabit({ id: "solo2", sort_order: 5 }),
  ];
  const idsFor = (id: string) =>
    habitSiblings(
      HABITS,
      HABITS.find((h) => h.id === id)!,
    ).map((h) => h.id);

  it("ranks a member against its routine's other habits", () => {
    expect(idsFor("m1")).toEqual(["m1", "m2"]);
  });

  it("ranks a group at the top level, where it takes one place", () => {
    expect(idsFor("g")).toEqual(["solo", "g", "solo2"]);
  });

  it("ranks a standalone habit at the top level too", () => {
    expect(idsFor("solo2")).toEqual(["solo", "g", "solo2"]);
  });

  it("ranks an orphan at the top level, which is where it renders", () => {
    // Its parent was purged on another device, or has not arrived yet.
    const orphaned = [...HABITS, makeHabit({ id: "lost", parent_id: "gone", sort_order: 6 })];
    const lost = orphaned.find((h) => h.id === "lost")!;
    expect(habitSiblings(orphaned, lost).map((h) => h.id)).toEqual(["solo", "g", "solo2", "lost"]);
  });

  it("agrees with what the list draws at the top level", () => {
    const top = flattenHabitGroups(HABITS)
      .filter((row) => row.kind === "group" || row.depth === 0)
      .map((row) => row.key);
    expect(idsFor("solo")).toEqual(top);
  });
});
