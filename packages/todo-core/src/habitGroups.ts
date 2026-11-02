import {
  dateKeyFromMs,
  evaluatePeriods,
  periodsBetween,
  shiftDateKey,
  type CheckinStates,
  type CompletionRate,
  type Habit,
} from "./habits";
import { hiddenProjectIds } from "./projectTree";
import { rankBetween } from "./rank";

/**
 * Habit groups: a `habit` with `kind: "group"`, whose members carry `parent_id`.
 *
 * Groups never nest, enforced on read: {@link flattenHabitGroups} treats a habit as a member only
 * when its `parent_id` resolves to a live group, so LWW divergence cannot produce a tree. An orphan
 * member renders at the top level.
 *
 * A group has no schedule. Its day is met when every member that owed a check-in that day got one;
 * what a member owes comes from its own periods (`periodsBetween`, `evaluatePeriods`).
 */

// ~5 years, like the engine's own bound.
const MAX_GROUP_SCAN_DAYS = 366 * 5;

export type HabitListRow =
  | { kind: "group"; key: string; group: Habit; memberCount: number; expanded: boolean }
  | { kind: "habit"; key: string; habit: Habit; depth: 0 | 1 };

const bySortOrder = (a: Habit, b: Habit) =>
  a.sort_order - b.sort_order || a.created_at - b.created_at;

// Takes the structural minimum, so raw store rows work (`Habit` has no `deleted_at`).
export const hiddenHabitIds = hiddenProjectIds;

export function habitGroupMembers(habits: Habit[], groupId: string): Habit[] {
  return habits.filter((h) => h.kind !== "group" && h.parent_id === groupId).sort(bySortOrder);
}

// Uses `flattenHabitGroups`' membership test so reordering always matches what is drawn.
export function habitSiblings(habits: Habit[], habit: Habit): Habit[] {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const groupOf = (h: Habit): Habit | undefined => {
    if (h.kind === "group" || h.parent_id === null) return undefined;
    const parent = byId.get(h.parent_id);
    return parent !== undefined && parent.kind === "group" ? parent : undefined;
  };
  const group = groupOf(habit);
  return group !== undefined
    ? habitGroupMembers(habits, group.id)
    : habits.filter((h) => groupOf(h) === undefined).sort(bySortOrder);
}

export function flattenHabitGroups(
  habits: Habit[],
  isExpanded: (groupId: string) => boolean = () => true,
): HabitListRow[] {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const members = new Map<string, Habit[]>();
  const top: Habit[] = [];

  for (const habit of habits) {
    const parent = habit.parent_id !== null ? byId.get(habit.parent_id) : undefined;
    // One-level and orphan rules: a member is a non-group whose parent is a group in this set.
    if (habit.kind !== "group" && parent !== undefined && parent.kind === "group") {
      const siblings = members.get(parent.id);
      if (siblings) siblings.push(habit);
      else members.set(parent.id, [habit]);
    } else {
      top.push(habit);
    }
  }

  const rows: HabitListRow[] = [];
  for (const item of top.sort(bySortOrder)) {
    if (item.kind !== "group") {
      rows.push({ kind: "habit", key: item.id, habit: item, depth: 0 });
      continue;
    }
    const kids = (members.get(item.id) ?? []).sort(bySortOrder);
    const expanded = isExpanded(item.id);
    rows.push({ kind: "group", key: item.id, group: item, memberCount: kids.length, expanded });
    if (expanded) {
      for (const kid of kids) rows.push({ kind: "habit", key: kid.id, habit: kid, depth: 1 });
    }
  }
  return rows;
}

// The write-side of the one-level rule: a group cannot be moved into anything, nothing into a non-group. Null when refused or a no-op.
export function moveHabitTarget(
  habits: Habit[],
  id: string,
  groupId: string | null,
): { id: string; parent_id: string | null; sort_order: number } | null {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const moving = byId.get(id);
  if (!moving || moving.kind === "group") return null;
  if (groupId !== null) {
    const target = byId.get(groupId);
    if (target === undefined || target.kind !== "group" || target.id === id) return null;
  }
  if (moving.parent_id === groupId) return null;

  const siblings =
    groupId === null
      ? habits.filter((h) => h.id !== id && (h.kind === "group" || h.parent_id === null))
      : habitGroupMembers(habits, groupId);
  const last = siblings.sort(bySortOrder)[siblings.length - 1];
  return { id, parent_id: groupId, sort_order: rankBetween(last?.sort_order ?? null, null) };
}

export interface HabitGroupMember {
  habit: Habit;
  states: CheckinStates;
}

export interface HabitGroupDay {
  date: string;
  due: number;
  done: number;
  excluded: boolean;
  met: boolean;
  inProgress: boolean;
  missing: string[];
}

function earliestKey(states: CheckinStates): string | undefined {
  let earliest: string | undefined;
  for (const key of states.keys()) if (earliest === undefined || key < earliest) earliest = key;
  return earliest;
}

// A flexible member (weekly or interval) contributes on the days it acted plus its period's final
// day if that closed unmet, so a 3x-week habit at 1 of 3 on Tuesday does not fail Tuesday.
export function habitGroupDays(
  members: readonly HabitGroupMember[],
  fromKey: string,
  toKey: string,
  todayKey: string,
  weekStartsOn = 0,
): HabitGroupDay[] {
  if (toKey < fromKey) return [];
  const due = new Map<string, number>();
  const got = new Map<string, number>();
  const absent = new Map<string, string[]>();
  const bump = (map: Map<string, number>, day: string) => {
    // Clamped to the window so Monday's check-in does not become Friday's credit.
    if (day < fromKey || day > toKey) return;
    map.set(day, (map.get(day) ?? 0) + 1);
  };
  const miss = (day: string, id: string) => {
    if (day < fromKey || day > toKey) return;
    const already = absent.get(day);
    if (already) already.push(id);
    else absent.set(day, [id]);
  };

  for (const { habit, states } of members) {
    if (habit.kind === "group" || habit.archived_at !== null) continue;
    // A member owes nothing before it existed; otherwise adding a habit to an established routine
    // would mark all earlier days missed and wipe the streak. Backfilled check-ins still count.
    const born = dateKeyFromMs(habit.created_at);
    const first = earliestKey(states);
    const earliest = first !== undefined && first < born ? first : born;
    // Clamped to today too: a device clock running ahead could stamp a habit into the future.
    const floor = earliest > todayKey ? todayKey : earliest;
    const scanFrom = floor > fromKey ? floor : fromKey;
    if (scanFrom > toKey) continue;
    const periods = periodsBetween(habit, scanFrom, toKey, weekStartsOn);
    for (const result of evaluatePeriods(states, periods, todayKey)) {
      if (result.target === 0) continue;
      const { from, to, scheduled } = result.period;
      if (from === to) {
        bump(due, from);
        if (states.get(from) === "done") bump(got, from);
        else miss(from, habit.id);
        continue;
      }
      for (const day of scheduled) {
        if (states.get(day) !== "done") continue;
        bump(due, day);
        bump(got, day);
      }
      // A flexible period that ran out unmet is a miss on its deadline day.
      if (!result.met && !result.inProgress) {
        bump(due, to);
        miss(to, habit.id);
      }
    }
  }

  const days: HabitGroupDay[] = [];
  for (let day = fromKey; day <= toKey; day = shiftDateKey(day, 1)) {
    const owed = due.get(day) ?? 0;
    const done = got.get(day) ?? 0;
    days.push({
      date: day,
      due: owed,
      done,
      excluded: owed === 0,
      met: owed > 0 && done >= owed,
      inProgress: day === todayKey,
      missing: absent.get(day) ?? [],
    });
  }
  return days;
}

// Earliest day any member recorded, clamped. Mirrors the engine's private `historyStart`.
function groupHistoryStart(members: readonly HabitGroupMember[], todayKey: string): string {
  let earliest = todayKey;
  for (const { states } of members) {
    const first = earliestKey(states);
    if (first !== undefined && first < earliest) earliest = first;
  }
  const floor = shiftDateKey(todayKey, -MAX_GROUP_SCAN_DAYS);
  return earliest < floor ? floor : earliest;
}

// Excluded days bridge, and today gets the same grace as a habit's current period.
export function habitGroupStreak(
  members: readonly HabitGroupMember[],
  todayMs: number,
  weekStartsOn = 0,
): number {
  const todayKey = dateKeyFromMs(todayMs);
  const days = habitGroupDays(
    members,
    groupHistoryStart(members, todayKey),
    todayKey,
    todayKey,
    weekStartsOn,
  );
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]!;
    if (day.excluded) continue;
    if (day.met) streak++;
    else if (!day.inProgress) break;
  }
  return streak;
}

export function habitGroupBestStreak(
  members: readonly HabitGroupMember[],
  todayMs: number,
  weekStartsOn = 0,
): number {
  const todayKey = dateKeyFromMs(todayMs);
  const days = habitGroupDays(
    members,
    groupHistoryStart(members, todayKey),
    todayKey,
    todayKey,
    weekStartsOn,
  );
  let best = 0;
  let run = 0;
  for (const day of days) {
    if (day.excluded) continue;
    if (day.met) {
      run++;
      if (run > best) best = run;
    } else if (!day.inProgress) {
      run = 0;
    }
  }
  return best;
}

export interface HabitGroupBreak {
  date: string;
  missing: string[];
}

// The most recent decided day the routine failed, and who failed it, to explain a streak of 0.
// Skips met days, so a twelve-day streak still reports the miss thirteen days back.
export function habitGroupBreak(
  members: readonly HabitGroupMember[],
  todayMs: number,
  weekStartsOn = 0,
): HabitGroupBreak | null {
  const todayKey = dateKeyFromMs(todayMs);
  const days = habitGroupDays(
    members,
    groupHistoryStart(members, todayKey),
    todayKey,
    todayKey,
    weekStartsOn,
  );
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]!;
    if (day.excluded || day.inProgress || day.met) continue;
    return { date: day.date, missing: day.missing };
  }
  return null;
}

export function habitGroupToday(
  members: readonly HabitGroupMember[],
  todayMs: number,
  weekStartsOn = 0,
): HabitGroupDay | null {
  const todayKey = dateKeyFromMs(todayMs);
  return habitGroupDays(members, todayKey, todayKey, todayKey, weekStartsOn)[0] ?? null;
}

export function habitGroupRate(
  members: readonly HabitGroupMember[],
  fromMs: number,
  toMs: number,
  weekStartsOn = 0,
): CompletionRate {
  const todayKey = dateKeyFromMs(toMs);
  const days = habitGroupDays(members, dateKeyFromMs(fromMs), todayKey, todayKey, weekStartsOn);
  let counted = 0;
  let met = 0;
  for (const day of days) {
    if (day.excluded) continue;
    if (day.inProgress && !day.met) continue;
    counted++;
    if (day.met) met++;
  }
  return { periods: counted, met, rate: counted === 0 ? 0 : met / counted };
}
