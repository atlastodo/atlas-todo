/**
 * Locale, timezone and format-aware date, time and number formatting: the single place display
 * strings are produced so language, timezone, 12/24h and date-format preferences apply everywhere.
 * Pure; `makeFormatters(config)` builds the `Intl` formatters.
 */

import { isAllDayTask } from "./calendar";

export type TimeFormatPref = "auto" | "12h" | "24h";
export type DateFormatPref = "auto" | "short" | "medium" | "long";

export function isTimeFormat(v: unknown): v is TimeFormatPref {
  return v === "auto" || v === "12h" || v === "24h";
}
export function isDateFormat(v: unknown): v is DateFormatPref {
  return v === "auto" || v === "short" || v === "medium" || v === "long";
}

/**
 * Resolve the BCP-47 formatting locale: the region preference wins (an English UI can format dates
 * as en-GB), then the UI language, then the device default (undefined). Blank means "follow the
 * device".
 */
export function resolveLocale(region?: string, language?: string): string | undefined {
  return region || language || undefined;
}

export interface FormatConfig {
  locale?: string;
  timeZone?: string;
  timeFormat?: TimeFormatPref;
  dateFormat?: DateFormatPref;
}

export interface Formatters {
  dueChip(ms: number): string;
  time(ms: number): string;
  dateTime(ms: number): string;
  date(ms: number): string;
  monthYear(year: number, month: number): string;
  number(n: number): string;
}

function hour12Of(p?: TimeFormatPref): boolean | undefined {
  if (p === "12h") return true;
  if (p === "24h") return false;
  return undefined; // locale default
}

function dateStyleOf(p?: DateFormatPref): "short" | "medium" | "long" {
  if (p === "short") return "short";
  if (p === "long") return "long";
  return "medium"; // auto + medium
}

export function makeFormatters(config: FormatConfig = {}): Formatters {
  const locale = config.locale || undefined;
  const timeZone = config.timeZone || undefined;
  const hour12 = hour12Of(config.timeFormat);
  const dateStyle = dateStyleOf(config.dateFormat);

  const dueChipFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12,
    timeZone,
  });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle: "short",
    hour12,
    timeZone,
  });
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle, timeZone });
  const monthYearFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const numberFmt = new Intl.NumberFormat(locale);

  return {
    dueChip: (ms) => {
      if (isAllDayTask(ms, timeZone)) {
        return dueChipFmt.format(ms);
      }
      return `${dueChipFmt.format(ms)}, ${timeFmt.format(ms)}`;
    },
    time: (ms) => timeFmt.format(ms),
    dateTime: (ms) => dateTimeFmt.format(ms),
    date: (ms) => dateFmt.format(ms),
    monthYear: (year, month) => monthYearFmt.format(new Date(year, month, 1)),
    number: (n) => numberFmt.format(n),
  };
}
