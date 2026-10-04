// Countdown math on absolute Unix-ms instants, so it is a physical duration, timezone- and DST-correct.

import { addDays, makeInstant, zonedParts } from "./zonedTime";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface Countdown {
  remaining: number;
  overdue: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  // The two most-significant units, e.g. "3d 4h"; the UI localizes from this.
  magnitude: string;
  label: string;
}

function components(absMs: number) {
  return {
    days: Math.floor(absMs / DAY),
    hours: Math.floor((absMs % DAY) / HOUR),
    minutes: Math.floor((absMs % HOUR) / MINUTE),
    seconds: Math.floor((absMs % MINUTE) / 1000),
  };
}

function shortMagnitude(c: {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}): string {
  if (c.days > 0) return `${c.days}d ${c.hours}h`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
  if (c.minutes > 0) return `${c.minutes}m ${c.seconds}s`;
  return `${c.seconds}s`;
}

export function countdownTo(target: number, now: number): Countdown {
  const remaining = target - now;
  const overdue = remaining < 0;
  const c = components(Math.abs(remaining));
  const magnitude = shortMagnitude(c);
  let label: string;
  if (remaining === 0) label = "Due now";
  else if (overdue) label = `Overdue by ${magnitude}`;
  else label = magnitude;
  return { remaining, overdue, ...c, magnitude, label };
}

export type CountdownPresetId = "weekend" | "month_end" | "year_end";
export const COUNTDOWN_PRESETS: CountdownPresetId[] = ["weekend", "month_end", "year_end"];

// Strictly future. "weekend" = coming Saturday 00:00, "month_end" = 00:00 on the 1st of next month, "year_end" = next Jan 1.
export function presetTarget(id: CountdownPresetId, now: number, timeZone?: string): number {
  const p = zonedParts(now, timeZone);
  switch (id) {
    case "weekend": {
      // Days until the next Saturday (0 = today is Saturday: jump a full week so it stays future).
      const daysUntilSat = (6 - p.weekday + 7) % 7 || 7;
      return addDays(now, daysUntilSat, timeZone);
    }
    case "month_end":
      return makeInstant(p.year, p.month + 1, 1, 0, 0, 0, timeZone);
    case "year_end":
      return makeInstant(p.year + 1, 0, 1, 0, 0, 0, timeZone);
  }
}
