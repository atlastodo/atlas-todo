/**
 * Habits and streaks: pure, date-based logic with an injected `now`.
 *
 * Check-ins are keyed by local calendar date, ignoring the `timezone` preference (re-keying would
 * rewrite streaks). Date arithmetic uses the UTC calendar helpers, which are DST-safe.
 *
 * Every goal kind reduces to periods wanting `target` check-ins: `daily` (one per day, `days` picks
 * weekdays), `weekly` (aligned to `week_starts_on`, so changing it redraws past weeks), `interval`
 * (`target`-day blocks tiled from creation).
 *
 * A short in-progress period neither counts nor breaks a streak. Skipped days shrink the target;
 * a period whose target falls to 0 is dropped and bridged.
 */

export type HabitGoalKind = "daily" | "weekly" | "interval";

// A "group" is a routine: a container habit that records nothing itself. Groups never nest.
export type HabitKind = "habit" | "group";

export type CheckinState = "done" | "skip";

// One schedule version, in force from `from` until the next. Without versions, editing the weekdays would re-judge the past.
export interface HabitSchedule {
  from: string;
  goal_kind: HabitGoalKind;
  days: number[];
  target: number;
}

export interface Habit {
  id: string;
  name: string;
  kind: HabitKind;
  parent_id: string | null;
  goal_kind: HabitGoalKind;
  days: number[];
  target: number;
  color: string;
  icon: string;
  notes: string;
  steps: string[];
  unit: string;
  reminder_time: string | null;
  schedule_history: HabitSchedule[];
  archived_at: number | null;
  created_at: number;
  sort_order: number;
}

export interface HabitCheckin {
  id: string;
  habit_id: string;
  date: string;
  state: CheckinState;
  value: number;
  note: string;
  created_at: number;
}

export type CheckinStates = ReadonlyMap<string, CheckinState>;

// Scan bound (~5 years) so malformed input cannot loop forever; a longer span keeps its recent days.
export const MAX_SCAN_DAYS = 366 * 5;
const DAY_MS = 86_400_000;

// `steps` and `schedule_history` sync as one op each; the server rejects a push batch when a value passes 64 KiB (`MAX_OP_VALUE_BYTES`).
export const MAX_STEPS = 50;
export const MAX_SCHEDULE_HISTORY = 200;

export function dateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function dateKeyFromMs(ms: number): string {
  return dateKey(new Date(ms));
}

function keyToUtc(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

function utcToKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function shiftDateKey(key: string, days: number): string {
  return utcToKey(keyToUtc(key) + days * DAY_MS);
}

export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / DAY_MS);
}

// Local noon survives DST shifts; the local `Date` constructor is used because `Date.parse` differs between Hermes and V8.
export function dateKeyToMs(key: string): number {
  return new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
    12,
  ).getTime();
}

export function weekdayOfKey(key: string): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

export function startOfWeekKey(key: string, weekStartsOn: number): string {
  return shiftDateKey(key, -(((weekdayOfKey(key) - weekStartsOn) % 7) + 7) % 7);
}

function goalKindOf(raw: unknown): HabitGoalKind {
  return raw === "weekly" || raw === "interval" ? raw : "daily";
}

function weekdaysOf(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6)
    : [];
}

function targetOf(raw: unknown): number {
  return typeof raw === "number" && raw >= 1 ? Math.floor(raw) : 1;
}

function isDateKey(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

// Sorted here because the array is one LWW field and a merge can return any order.
function scheduleHistoryOf(raw: unknown): HabitSchedule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
    )
    .filter((entry) => isDateKey(entry.from))
    .map((entry) => ({
      from: entry.from as string,
      goal_kind: goalKindOf(entry.goal_kind),
      days: weekdaysOf(entry.days),
      target: targetOf(entry.target),
    }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .slice(-MAX_SCHEDULE_HISTORY);
}

export function toHabit(id: string, fields: Record<string, unknown>): Habit {
  return {
    id,
    name: typeof fields.name === "string" ? fields.name : "",
    kind: fields.kind === "group" ? "group" : "habit",
    parent_id: typeof fields.parent_id === "string" ? fields.parent_id : null,
    goal_kind: goalKindOf(fields.goal_kind),
    days: weekdaysOf(fields.days),
    target: targetOf(fields.target),
    color: typeof fields.color === "string" ? fields.color : "#6366f1",
    icon: typeof fields.icon === "string" ? fields.icon : "hash",
    notes: typeof fields.notes === "string" ? fields.notes : "",
    steps: Array.isArray(fields.steps)
      ? fields.steps
          .filter((s): s is string => typeof s === "string" && s !== "")
          .slice(0, MAX_STEPS)
      : [],
    unit: typeof fields.unit === "string" ? fields.unit : "",
    reminder_time: typeof fields.reminder_time === "string" ? fields.reminder_time : null,
    schedule_history: scheduleHistoryOf(fields.schedule_history),
    archived_at: typeof fields.archived_at === "number" ? fields.archived_at : null,
    created_at: typeof fields.created_at === "number" ? fields.created_at : 0,
    sort_order: typeof fields.sort_order === "number" ? fields.sort_order : 0,
  };
}

export function toHabitCheckin(id: string, fields: Record<string, unknown>): HabitCheckin {
  return {
    id,
    habit_id: typeof fields.habit_id === "string" ? fields.habit_id : "",
    date: typeof fields.date === "string" ? fields.date : "",
    // Rows from before skip days carry no `state` and were all completions.
    state: fields.state === "skip" ? "skip" : "done",
    value: typeof fields.value === "number" ? fields.value : 1,
    note: typeof fields.note === "string" ? fields.note : "",
    created_at: typeof fields.created_at === "number" ? fields.created_at : 0,
  };
}

export function isBackfilled(checkin: HabitCheckin): boolean {
  return checkin.created_at > 0 && dateKeyFromMs(checkin.created_at) !== checkin.date;
}

type GoalShape = Pick<Habit, "goal_kind" | "days" | "target">;

function scheduledUnder(schedule: Pick<GoalShape, "goal_kind" | "days">, key: string): boolean {
  if (schedule.goal_kind !== "daily") return true;
  return schedule.days.length === 0 || schedule.days.includes(weekdayOfKey(key));
}

export function isScheduledOn(habit: Habit, key: string, weekStartsOn = 0): boolean {
  return scheduledUnder(effectiveSchedule(habit, key, weekStartsOn), key);
}

function periodLengthDays(habit: GoalShape): number {
  if (habit.goal_kind === "weekly") return 7;
  if (habit.goal_kind === "interval") return Math.max(1, Math.floor(habit.target));
  return 1;
}

function goalTarget(habit: GoalShape): number {
  return habit.goal_kind === "weekly" ? Math.max(1, Math.floor(habit.target)) : 1;
}

// Required check-ins per day: the `frequency` the strength curve is tuned against.
export function goalFrequency(habit: GoalShape): number {
  if (habit.goal_kind === "weekly") return goalTarget(habit) / 7;
  if (habit.goal_kind === "interval") return 1 / periodLengthDays(habit);
  return (habit.days.length === 0 ? 7 : habit.days.length) / 7;
}

// `from` is `""` for the oldest segment so it extends backwards and backfills are judged by plausible rules.
export interface ScheduleSegment {
  schedule: HabitSchedule;
  from: string;
  until: string | null;
}

function currentSchedule(habit: Habit): HabitSchedule {
  return {
    from: dateKeyFromMs(habit.created_at),
    goal_kind: habit.goal_kind,
    days: habit.days,
    target: habit.target,
  };
}

// A version takes effect at the first period start on its grid; `weekly` waits for the next week start to keep weeks aligned.
function alignForward(key: string, schedule: HabitSchedule, weekStartsOn: number): string {
  if (schedule.goal_kind !== "weekly") return key;
  const start = startOfWeekKey(key, weekStartsOn);
  return start === key ? key : shiftDateKey(start, 7);
}

export function scheduleSegments(habit: Habit, weekStartsOn = 0): ScheduleSegment[] {
  const current = currentSchedule(habit);
  const history = habit.schedule_history;
  if (history.length === 0) return [{ schedule: current, from: "", until: null }];

  const segments: ScheduleSegment[] = [];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i]!;
    // The habit's own fields are the newest version.
    const schedule = i === history.length - 1 ? { ...current, from: entry.from } : entry;
    const from = i === 0 ? "" : alignForward(entry.from, schedule, weekStartsOn);
    // A version aligning no later than its predecessor replaces it (two weekly changes in one week).
    while (segments.length > 0 && from <= segments[segments.length - 1]!.from) segments.pop();
    segments.push({ schedule, from, until: null });
  }
  for (let i = 0; i < segments.length - 1; i++) segments[i]!.until = segments[i + 1]!.from;
  return segments;
}

function segmentAt(segments: ScheduleSegment[], key: string): ScheduleSegment {
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i]!.from <= key) return segments[i]!;
  return segments[0]!;
}

// The one resolver, so the calendar never shades a day differently from how the engine counts it.
export function effectiveSchedule(habit: Habit, key: string, weekStartsOn = 0): HabitSchedule {
  return segmentAt(scheduleSegments(habit, weekStartsOn), key).schedule;
}

function sameSchedule(a: GoalShape, b: GoalShape): boolean {
  if (a.goal_kind !== b.goal_kind) return false;
  // Compared through the derived pair, because `daily` ignores `target`.
  if (goalTarget(a) !== goalTarget(b) || periodLengthDays(a) !== periodLengthDays(b)) return false;
  const x = [...a.days].sort((m, n) => m - n);
  const y = [...b.days].sort((m, n) => m - n);
  return x.length === y.length && x.every((d, i) => d === y[i]);
}

// The `schedule_history` an edit should write, or null when no schedule field changes. A second change on the same day replaces that day's entry (the goal editor writes in several calls).
export function appendScheduleChange(
  habit: Habit,
  patch: Partial<GoalShape>,
  nowMs: number,
): HabitSchedule[] | null {
  const current = currentSchedule(habit);
  const proposed: HabitSchedule = {
    from: dateKeyFromMs(nowMs),
    goal_kind: patch.goal_kind ?? current.goal_kind,
    days: patch.days ?? current.days,
    target: patch.target ?? current.target,
  };
  if (sameSchedule(proposed, current)) return null;

  const history =
    habit.schedule_history.length > 0 ? [...habit.schedule_history] : [{ ...current }];
  const last = history[history.length - 1]!;
  if (last.from === proposed.from) history[history.length - 1] = proposed;
  else history.push(proposed);
  // Flipping to weekly and back on the same day is a no-op, not two versions.
  const n = history.length;
  if (n > 1 && sameSchedule(history[n - 1]!, history[n - 2]!)) history.pop();
  return history.slice(-MAX_SCHEDULE_HISTORY);
}

export interface HabitPeriod {
  from: string;
  to: string;
  scheduled: string[];
  // Check-ins wanted before the skip adjustment. 0 means excluded (cut short by a schedule change).
  goal: number;
}

export interface PeriodResult {
  period: HabitPeriod;
  done: number;
  skipped: number;
  target: number;
  met: boolean;
  inProgress: boolean;
}

function periodStartFor(
  habit: Habit,
  segment: ScheduleSegment,
  key: string,
  weekStartsOn: number,
): string {
  const schedule = segment.schedule;
  if (schedule.goal_kind === "weekly") return startOfWeekKey(key, weekStartsOn);
  if (schedule.goal_kind === "interval") {
    // A later segment re-anchors at its own start.
    const anchor = segment.from === "" ? dateKeyFromMs(habit.created_at) : segment.from;
    const length = periodLengthDays(schedule);
    return shiftDateKey(anchor, Math.floor(daysBetweenKeys(anchor, key) / length) * length);
  }
  return key;
}

// Periods covering `[fromKey, toKey]`, oldest first; the first may start before `fromKey` and the last end after `toKey`. Segmented at schedule changes so the tiling has no gaps.
export function periodsBetween(
  habit: Habit,
  fromKey: string,
  toKey: string,
  weekStartsOn = 0,
): HabitPeriod[] {
  if (toKey < fromKey) return [];
  const floor = shiftDateKey(toKey, -MAX_SCAN_DAYS);
  if (fromKey < floor) fromKey = floor;
  const segments = scheduleSegments(habit, weekStartsOn);
  const periods: HabitPeriod[] = [];
  let start = periodStartFor(habit, segmentAt(segments, fromKey), fromKey, weekStartsOn);

  for (let guard = 0; guard <= MAX_SCAN_DAYS && start <= toKey; guard++) {
    const segment = segmentAt(segments, start);
    const gridEnd = shiftDateKey(start, periodLengthDays(segment.schedule) - 1);
    const cut = segment.until !== null && gridEnd >= segment.until;
    const end = cut ? shiftDateKey(segment.until!, -1) : gridEnd;
    const scheduled: string[] = [];
    for (let day = start; day <= end; day = shiftDateKey(day, 1)) {
      if (scheduledUnder(segment.schedule, day)) scheduled.push(day);
    }
    periods.push({
      from: start,
      to: end,
      scheduled,
      // A half-lived period is excluded rather than judged.
      goal: cut ? 0 : goalTarget(segment.schedule),
    });
    start = shiftDateKey(end, 1);
  }
  return periods;
}

export function evaluatePeriods(
  states: CheckinStates,
  periods: HabitPeriod[],
  todayKey: string,
): PeriodResult[] {
  return periods.map((period) => {
    let done = 0;
    let skipped = 0;
    for (const day of period.scheduled) {
      const state = states.get(day);
      if (state === "done") done++;
      else if (state === "skip") skipped++;
    }
    const target = Math.max(0, Math.min(period.goal, period.scheduled.length - skipped));
    return {
      period,
      done,
      skipped,
      target,
      met: target > 0 && done >= target,
      inProgress: todayKey >= period.from && todayKey <= period.to,
    };
  });
}

function historyStart(states: CheckinStates, anchorKey: string): string {
  let earliest = anchorKey;
  for (const key of states.keys()) if (key < earliest) earliest = key;
  const floor = shiftDateKey(anchorKey, -MAX_SCAN_DAYS);
  return earliest < floor ? floor : earliest;
}

function evaluateHistory(
  habit: Habit,
  states: CheckinStates,
  todayKey: string,
  weekStartsOn: number,
): PeriodResult[] {
  const from = historyStart(states, todayKey);
  return evaluatePeriods(states, periodsBetween(habit, from, todayKey, weekStartsOn), todayKey);
}

// Excluded periods bridge rather than break, and a short in-progress period is passed over.
export function currentStreak(
  habit: Habit,
  states: CheckinStates,
  todayMs: number,
  weekStartsOn = 0,
): number {
  const results = evaluateHistory(habit, states, dateKeyFromMs(todayMs), weekStartsOn);
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i]!;
    if (result.target === 0) continue;
    if (result.met) streak++;
    else if (!result.inProgress) break;
  }
  return streak;
}

export function currentPeriod(
  habit: Habit,
  states: CheckinStates,
  todayMs: number,
  weekStartsOn = 0,
): PeriodResult | null {
  const todayKey = dateKeyFromMs(todayMs);
  const periods = periodsBetween(habit, todayKey, todayKey, weekStartsOn);
  return evaluatePeriods(states, periods, todayKey)[0] ?? null;
}

// Also true once recorded today, otherwise ticking a habit would make it vanish along with its undo.
export function isActiveToday(
  habit: Habit,
  states: CheckinStates,
  todayMs: number,
  weekStartsOn = 0,
): boolean {
  if (habit.archived_at !== null) return false;
  if (states.get(dateKeyFromMs(todayMs)) !== undefined) return true;
  const period = currentPeriod(habit, states, todayMs, weekStartsOn);
  return period !== null && period.target > 0 && !period.met;
}

export function bestStreak(
  habit: Habit,
  states: CheckinStates,
  todayMs: number,
  weekStartsOn = 0,
): number {
  const results = evaluateHistory(habit, states, dateKeyFromMs(todayMs), weekStartsOn);
  let best = 0;
  let run = 0;
  for (const result of results) {
    if (result.target === 0) continue;
    if (result.met) {
      run++;
      if (run > best) best = run;
    } else if (!result.inProgress) {
      run = 0;
    }
  }
  return best;
}

export interface CompletionRate {
  periods: number;
  met: number;
  rate: number;
}

// Excluded periods and an unfinished final one are left out, not counted as failures.
export function completionRate(
  habit: Habit,
  states: CheckinStates,
  fromMs: number,
  toMs: number,
  weekStartsOn = 0,
): CompletionRate {
  const todayKey = dateKeyFromMs(toMs);
  const periods = periodsBetween(habit, dateKeyFromMs(fromMs), todayKey, weekStartsOn);
  let counted = 0;
  let met = 0;
  for (const result of evaluatePeriods(states, periods, todayKey)) {
    if (result.target === 0) continue;
    if (result.inProgress && !result.met) continue;
    counted++;
    if (result.met) met++;
  }
  return { periods: counted, met, rate: counted === 0 ? 0 : met / counted };
}

export function totalCheckins(states: CheckinStates): number {
  let total = 0;
  for (const state of states.values()) if (state === "done") total++;
  return total;
}

export function nextDue(
  habit: Habit,
  states: CheckinStates,
  todayMs: number,
  weekStartsOn = 0,
): string | null {
  const todayKey = dateKeyFromMs(todayMs);
  const periods = periodsBetween(habit, todayKey, shiftDateKey(todayKey, 366), weekStartsOn);
  for (const result of evaluatePeriods(states, periods, todayKey)) {
    if (result.target === 0 || result.met) continue;
    for (const day of result.period.scheduled) {
      if (day >= todayKey && states.get(day) === undefined) return day;
    }
  }
  return null;
}

export interface StrengthPoint {
  date: string;
  score: number;
}

/**
 * Loop Habit Tracker's strength curve: an exponential moving average that dips on a miss but never
 * resets. `multiplier = 0.5 ** (sqrt(frequency) / 13)` per day, raised to the period length.
 * Skipped, off-schedule and short in-progress periods carry the score forward.
 */
export function strengthSeries(
  habit: Habit,
  states: CheckinStates,
  fromMs: number,
  toMs: number,
  weekStartsOn = 0,
): StrengthPoint[] {
  const fromKey = dateKeyFromMs(fromMs);
  const toKey = dateKeyFromMs(toMs);
  const periods = periodsBetween(habit, historyStart(states, fromKey), toKey, weekStartsOn);
  const segments = scheduleSegments(habit, weekStartsOn);

  const points: StrengthPoint[] = [];
  let score = 0;
  for (const result of evaluatePeriods(states, periods, toKey)) {
    const settled = result.target > 0 && !(result.inProgress && !result.met);
    if (settled) {
      // Resolved per period so history decays at the rate that applied then.
      const schedule = segmentAt(segments, result.period.from).schedule;
      const span = daysBetweenKeys(result.period.from, result.period.to) + 1;
      const decay = (0.5 ** (Math.sqrt(goalFrequency(schedule)) / 13)) ** span;
      score = score * decay + (result.met ? 1 - decay : 0);
    }
    if (result.period.to >= fromKey) points.push({ date: result.period.to, score });
  }
  return points;
}

export function currentStrength(
  habit: Habit,
  states: CheckinStates,
  todayMs: number,
  weekStartsOn = 0,
): number {
  const series = strengthSeries(habit, states, todayMs, todayMs, weekStartsOn);
  return series.length === 0 ? 0 : series[series.length - 1]!.score;
}
