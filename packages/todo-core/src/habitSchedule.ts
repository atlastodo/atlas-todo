import {
  dateKeyFromMs,
  evaluatePeriods,
  isScheduledOn,
  periodsBetween,
  shiftDateKey,
  type CheckinStates,
  type Habit,
} from "./habits";
import type { ScheduledReminder } from "./reminderSchedule";

/**
 * Planning the daily nudge for a habit, in the {@link ScheduledReminder} shape task reminders use.
 * A reminder is suppressed once its period's goal is met, and a day already recorded (even
 * skipped) gets none. Only a week is planned ahead (notifications are one-shot), re-reconciled
 * whenever habits or check-ins change.
 */
const DEFAULT_HORIZON_DAYS = 7;

export function habitReminderId(habitId: string, date: string): string {
  return `habit:${habitId}:${date}`;
}

function fireInstant(date: string, time: string): number | null {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours,
    minutes,
  ).getTime();
}

// `statesOf` is injected because rebuilding the check-in index per habit is quadratic.
export function habitReminders(
  habits: Habit[],
  statesOf: (habitId: string) => CheckinStates,
  now: number,
  weekStartsOn = 0,
  horizonDays = DEFAULT_HORIZON_DAYS,
): ScheduledReminder[] {
  const todayKey = dateKeyFromMs(now);
  const out: ScheduledReminder[] = [];

  for (const habit of habits) {
    if (habit.archived_at !== null || !habit.reminder_time) continue;
    const states = statesOf(habit.id);

    // Periods in the horizon already satisfied want no nudges.
    const horizonKey = shiftDateKey(todayKey, horizonDays);
    const results = evaluatePeriods(
      states,
      periodsBetween(habit, todayKey, horizonKey, weekStartsOn),
      todayKey,
    );
    const metDays = new Set<string>();
    for (const result of results) {
      if (result.met || result.target === 0)
        for (const day of result.period.scheduled) metDays.add(day);
    }

    for (let i = 0; i <= horizonDays; i++) {
      const day = shiftDateKey(todayKey, i);
      // Schedule-aware: a change inside the horizon nudges under the outgoing schedule up to it and
      // the new one after.
      if (!isScheduledOn(habit, day, weekStartsOn)) continue;
      if (states.get(day) !== undefined) continue; // already done or deliberately skipped
      if (metDays.has(day)) continue;
      const fireAt = fireInstant(day, habit.reminder_time);
      // The OS cannot schedule into the past: drop today's slot once gone.
      if (fireAt === null || fireAt <= now) continue;
      out.push({ reminderId: habitReminderId(habit.id, day), fireAt, title: habit.name });
    }
  }
  return out;
}
