import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appendScheduleChange,
  bestStreak,
  completionRate,
  currentPeriod,
  currentStrength,
  currentStreak,
  dateKeyToMs,
  evaluatePeriods,
  isActiveToday,
  isScheduledOn,
  nextDue,
  periodsBetween,
  shiftDateKey,
  toHabit,
  toHabitCheckin,
  totalCheckins,
  type CheckinState,
  type Habit,
  type PeriodResult,
} from "./habits";
import {
  habitGroupDays,
  habitGroupStreak,
  habitGroupToday,
  type HabitGroupDay,
} from "./habitGroups";
import { derivedUuidV2 } from "./ids";

/**
 * The shared habit fixtures in `test-vectors/habit_vectors.json`, which the Rust rules
 * (`crates/atlas-todo-rules/src/rules/habits.rs`) assert as well. Days are date keys; a habit's
 * `created` is its `created_at` at local noon, so the cases hold in any time zone. To add a case,
 * add its inputs and copy the value this test reports into `expected`.
 */

type Fields = Record<string, unknown>;

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../test-vectors/habit_vectors.json", import.meta.url)),
    "utf8",
  ),
) as {
  habits: {
    name: string;
    habit: Fields;
    checkins: Record<string, CheckinState>;
    today: string;
    week_starts_on: number;
    rate_from: string;
    expected: unknown;
  }[];
  to_habit: { name: string; fields: Fields; expected: unknown }[];
  checkins: { name: string; fields: Fields; expected: unknown }[];
  schedule_changes: {
    name: string;
    habit: Fields;
    patch: Fields;
    today: string;
    expected: unknown;
  }[];
  groups: {
    name: string;
    members: { habit: Fields; checkins: Record<string, CheckinState> }[];
    today: string;
    week_starts_on: number;
    expected: unknown;
  }[];
  derived_ids: { namespace: string; key: string; expected: string }[];
};

function habitOf(id: string, raw: Fields): Habit {
  const { created, ...fields } = raw;
  return toHabit(id, { ...fields, created_at: dateKeyToMs(created as string) });
}

const statesOf = (checkins: Record<string, CheckinState>) => new Map(Object.entries(checkins));

function period(r: PeriodResult) {
  return {
    from: r.period.from,
    to: r.period.to,
    scheduled: r.period.scheduled,
    goal: r.period.goal,
    done: r.done,
    skipped: r.skipped,
    target: r.target,
    met: r.met,
    in_progress: r.inProgress,
  };
}

function day(d: HabitGroupDay) {
  return {
    date: d.date,
    due: d.due,
    done: d.done,
    excluded: d.excluded,
    met: d.met,
    in_progress: d.inProgress,
    missing: d.missing,
  };
}

function withoutStrength(value: unknown): unknown {
  const { strength: _, ...rest } = value as Record<string, unknown>;
  return rest;
}

describe("habit vectors", () => {
  for (const c of fixture.habits) {
    it(c.name, () => {
      const habit = habitOf("h1", c.habit);
      const states = statesOf(c.checkins);
      const today = dateKeyToMs(c.today);
      const ws = c.week_starts_on;
      const rate = completionRate(habit, states, dateKeyToMs(c.rate_from), today, ws);
      const scheduled: string[] = [];
      for (let i = -13; i <= 7; i++) {
        const key = shiftDateKey(c.today, i);
        if (isScheduledOn(habit, key, ws)) scheduled.push(key);
      }
      const current = currentPeriod(habit, states, today, ws);
      const actual = {
        current_streak: currentStreak(habit, states, today, ws),
        best_streak: bestStreak(habit, states, today, ws),
        total_checkins: totalCheckins(states),
        completion_rate: { periods: rate.periods, met: rate.met },
        next_due: nextDue(habit, states, today, ws),
        is_active_today: isActiveToday(habit, states, today, ws),
        current_period: current === null ? null : period(current),
        periods: evaluatePeriods(
          states,
          periodsBetween(habit, c.rate_from, c.today, ws),
          c.today,
        ).map(period),
        scheduled,
        strength: currentStrength(habit, states, today, ws),
      };
      expect(withoutStrength(actual)).toEqual(withoutStrength(c.expected));
      expect(actual.strength).toBeCloseTo((c.expected as { strength: number }).strength, 9);
    });
  }
});

describe("habit field reading vectors", () => {
  for (const c of fixture.to_habit) {
    it(c.name, () => expect(toHabit("h1", c.fields)).toEqual(c.expected));
  }
  for (const c of fixture.checkins) {
    it(c.name, () => expect(toHabitCheckin("c1", c.fields)).toEqual(c.expected));
  }
});

describe("habit schedule change vectors", () => {
  for (const c of fixture.schedule_changes) {
    it(c.name, () => {
      const habit = habitOf("h1", c.habit);
      expect(appendScheduleChange(habit, c.patch, dateKeyToMs(c.today))).toEqual(c.expected);
    });
  }
});

describe("habit group vectors", () => {
  for (const c of fixture.groups) {
    it(c.name, () => {
      const members = c.members.map((m, i) => ({
        habit: habitOf(`m${i}`, m.habit),
        states: statesOf(m.checkins),
      }));
      const today = dateKeyToMs(c.today);
      const ws = c.week_starts_on;
      const from = c.members.map((m) => m.habit.created as string).sort()[0]!;
      const todayDay = habitGroupToday(members, today, ws);
      expect({
        streak: habitGroupStreak(members, today, ws),
        today: todayDay === null ? null : day(todayDay),
        days: habitGroupDays(members, from, c.today, c.today, ws).map(day),
      }).toEqual(c.expected);
    });
  }
});

describe("derived id vectors", () => {
  for (const c of fixture.derived_ids) {
    it(JSON.stringify(c.key), () => expect(derivedUuidV2(c.namespace, c.key)).toBe(c.expected));
  }
});
