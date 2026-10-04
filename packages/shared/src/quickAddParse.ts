import type { CreateTaskInput, Priority } from "@atlas/client-core";
import {
  DEFAULT_DUE_HOUR,
  DEFAULT_DUE_MINUTE,
  addDays,
  endOfDay,
  makeInstant,
  resolveTimeZone,
  startOfDay,
  zonedParts,
} from "./zonedTime";
import {
  anchorMonthDay,
  formatRule,
  parseRule,
  ruleToString,
  type Freq,
  type Rule,
} from "./recurrence";

/**
 * Natural-language quick-add parsing ("Buy milk tomorrow 5pm #groceries p1") into a
 * {@link CreateTaskInput} plus preview chips. `every!` or a trailing `from completion` schedules
 * from the completion date. Never throws: unrecognized input stays in the title.
 */

export { DEFAULT_DUE_HOUR, DEFAULT_DUE_MINUTE };

const EN_WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// Read as weekdays only in Danish: "man", "tor", "fre" are ordinary English words.
const DA_WEEKDAYS: Record<string, number> = {
  søndag: 0,
  mandag: 1,
  tirsdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lørdag: 6,
  soendag: 0,
  loerdag: 6,
  søn: 0,
  man: 1,
  tir: 2,
  ons: 3,
  tor: 4,
  fre: 5,
  lør: 6,
  soen: 0,
  loer: 6,
};

const MONTH_MAP: Record<string, number> = {
  // English
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
  // Danish
  januar: 0,
  februar: 1,
  marts: 2,
  maj: 4,
  juni: 5,
  juli: 6,
  oktober: 9,
  okt: 9,
};

export type ChipKind = "due" | "project" | "label" | "priority" | "recurrence";

export interface ParsedChip {
  kind: ChipKind;
  label: string;
}

export interface TokenSpan {
  start: number;
  end: number;
  text: string;
  value: string;
}

export interface QuickAddContext {
  projectIdByName?: (name: string) => string | null;
  isKnownLabel?: (name: string) => boolean;
  timeZone?: string;
  language?: string;
  // Phrases (lowercase) the user unlinked: kept as title text, so "call fri" can mean the person.
  ignoreDates?: string[];
  ignoreProjects?: string[];
  ignoreLabels?: string[];
  // "Disable smart dates": date/time phrases stay in the title.
  disableDates?: boolean;
}

export interface DateMatchSpan {
  start: number;
  end: number;
  text: string;
}

export interface QuickAddResult {
  input: CreateTaskInput;
  title: string;
  chips: ParsedChip[];
  dateMatch?: DateMatchSpan;
  projectMatch?: TokenSpan;
  labelMatches?: TokenSpan[];
  labels: string[];
}

function weekdayIndex(word: string, danish: boolean): number | null {
  const clean = word.replace(/[.,]+$/, "");
  const own = (map: Record<string, number>) =>
    Object.prototype.hasOwnProperty.call(map, clean) ? map[clean]! : null;
  return own(EN_WEEKDAYS) ?? (danish ? own(DA_WEEKDAYS) : null);
}

function monthIndex(word: string): number | null {
  const clean = word.replace(/[.,]+$/, "");
  return MONTH_MAP[clean] ?? null;
}

function daysUntilWeekday(weekday: number, now: number, timeZone?: string): number {
  const today = zonedParts(now, timeZone).weekday;
  return (weekday - today + 7) % 7;
}

function unitToFreq(unit: string): Freq | null {
  const clean = unit.replace(/[.,]$/, "");
  if (clean === "day" || clean === "days" || clean === "dag" || clean === "dage") return "daily";
  if (clean === "week" || clean === "weeks" || clean === "uge" || clean === "uger") return "weekly";
  if (
    clean === "month" ||
    clean === "months" ||
    clean === "måned" ||
    clean === "måneder" ||
    clean === "maaned" ||
    clean === "maaneder"
  )
    return "monthly";
  if (clean === "year" || clean === "years" || clean === "år" || clean === "aar") return "yearly";
  return null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// This year, or next once passed; `null` for a nonexistent date ("feb 30").
function monthDayDay(month: number, day: number, now: number, timeZone?: string): number | null {
  const today = startOfDay(now, timeZone);
  if (day < 1) return null;
  const year = zonedParts(now, timeZone).year;
  for (const y of [year, year + 1]) {
    if (day > daysInMonth(y, month)) continue;
    const dt = makeInstant(y, month, day, 0, 0, 0, timeZone);
    if (dt >= today) return dt;
  }
  return null;
}

function atMinutes(dayMs: number, minutes: number, timeZone?: string): number {
  const p = zonedParts(dayMs, timeZone);
  return makeInstant(p.year, p.month, p.day, Math.floor(minutes / 60), minutes % 60, 0, timeZone);
}

// A rule with no typed date starts on the next of its BYDAY weekdays (today counts); others start today.
function firstRuleDay(rule: string, now: number, timeZone?: string): number {
  const today = startOfDay(now, timeZone);
  const parsed = parseRule(rule);
  if (!parsed || parsed.freq !== "weekly" || parsed.byday.length === 0) return today;
  const todayMon0 = (zonedParts(now, timeZone).weekday + 6) % 7;
  const delta = Math.min(...parsed.byday.map((d) => (d - todayMon0 + 7) % 7));
  return addDays(today, delta, timeZone);
}

function addMonthsZoned(dayStart: number, n: number, timeZone?: string): number {
  const p = zonedParts(dayStart, timeZone);
  const targetMonth = p.month + n;
  const lastDay = new Date(Date.UTC(p.year, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(p.day, lastDay);
  return makeInstant(p.year, targetMonth, day, 0, 0, 0, timeZone);
}

interface Match {
  consumed: number;
}
interface RecurrenceMatch extends Match {
  rule: string;
}
interface DateMatch extends Match {
  day: number;
}

function matchRecurrence(words: string[], i: number, danish: boolean): RecurrenceMatch | null {
  let head = words[i]!;
  const afterCompletion = head.endsWith("!");
  if (afterCompletion) head = head.slice(0, -1);

  // Single-word forms: daily / weekly / monthly / yearly, and Danish dagligt / ugentligt etc.
  const single: Record<string, Freq> = {
    daily: "daily",
    weekly: "weekly",
    monthly: "monthly",
    yearly: "yearly",
    dagligt: "daily",
    ugentligt: "weekly",
    månedligt: "monthly",
    maanedligt: "monthly",
    årligt: "yearly",
    aarligt: "yearly",
  };

  let rule: Rule | null = null;
  let consumed = 0;

  if (!afterCompletion && head in single) {
    rule = { freq: single[head]!, interval: 1, byday: [], bymonthday: null, mode: "on_schedule" };
    consumed = 1;
  } else if (head === "every" || head === "hver" || head === "hvert") {
    // English "every", Danish "hver" / "hvert"
    const mode = afterCompletion ? "after_completion" : "on_schedule";
    const a = words[i + 1];
    if (!a) return null;

    // "every monday" / "hver mandag"
    const wd = weekdayIndex(a, danish);
    if (wd !== null) {
      rule = {
        freq: "weekly",
        interval: 1,
        byday: [wd === 0 ? 6 : wd - 1],
        bymonthday: null,
        mode,
      };
      consumed = 2;
    } else {
      // "every day" / "hver dag" ...
      const unit1 = unitToFreq(a);
      if (unit1) {
        rule = { freq: unit1, interval: 1, byday: [], bymonthday: null, mode };
        consumed = 2;
      } else {
        // "every 2 weeks" / "hver 2. uge" / "hver 2 uger"
        const numMatch = /^(\d+)\.?$/.exec(a);
        if (numMatch && words[i + 2]) {
          const unit2 = unitToFreq(words[i + 2]!);
          if (unit2) {
            rule = {
              freq: unit2,
              interval: Math.max(1, Number(numMatch[1])),
              byday: [],
              bymonthday: null,
              mode,
            };
            consumed = 3;
          }
        }
      }
    }
  }
  if (!rule) return null;

  // A trailing "from completion" (Danish "fra fuldførelse") is the plain-words `every!`.
  if (
    (words[i + consumed] === "from" || words[i + consumed] === "fra") &&
    (words[i + consumed + 1] === "completion" ||
      words[i + consumed + 1] === "fuldførelse" ||
      words[i + consumed + 1] === "fulfoerelse")
  ) {
    rule = { ...rule, mode: "after_completion" };
    consumed += 2;
  }

  return { rule: ruleToString(rule), consumed };
}

function matchDate(
  words: string[],
  i: number,
  now: number,
  timeZone: string | undefined,
  danish: boolean,
): DateMatch | null {
  const w = words[i]!;
  const today = startOfDay(now, timeZone);

  if (w === "today" || w === "tonight") return { day: today, consumed: 1 };
  if (w === "i" && (words[i + 1] === "dag" || words[i + 1] === "aften")) {
    return { day: today, consumed: 2 };
  }

  if (w === "tomorrow") return { day: addDays(today, 1, timeZone), consumed: 1 };
  if (w === "i" && words[i + 1] === "morgen") {
    return { day: addDays(today, 1, timeZone), consumed: 2 };
  }

  if (w === "overmorrow" || w === "overmorgen") {
    return { day: addDays(today, 2, timeZone), consumed: 1 };
  }
  if (w === "i" && words[i + 1] === "overmorgen") {
    return { day: addDays(today, 2, timeZone), consumed: 2 };
  }

  // "in 3 days" / "om 3 dage"
  if ((w === "in" || w === "om") && /^\d+$/.test(words[i + 1] ?? "") && words[i + 2]) {
    const n = Number(words[i + 1]);
    const freq = unitToFreq(words[i + 2]!);
    if (freq === "daily") return { day: addDays(today, n, timeZone), consumed: 3 };
    if (freq === "weekly") return { day: addDays(today, n * 7, timeZone), consumed: 3 };
    if (freq === "monthly") return { day: addMonthsZoned(today, n, timeZone), consumed: 3 };
    if (freq === "yearly") return { day: addMonthsZoned(today, n * 12, timeZone), consumed: 3 };
  }

  // "next monday" / "næste mandag" / "this friday" / "denne fredag"
  const isNext = w === "next" || w === "næste" || w === "naeste";
  const isThis = w === "this" || w === "denne" || w === "dette";
  if ((isNext || isThis) && words[i + 1]) {
    const wd = weekdayIndex(words[i + 1]!, danish);
    if (wd !== null) {
      let delta = daysUntilWeekday(wd, now, timeZone);
      if (isNext && delta === 0) delta = 7; // "next <today's weekday>" = a week out
      return { day: addDays(today, delta, timeZone), consumed: 2 };
    }
    const unit = unitToFreq(words[i + 1]!);
    if (unit === "weekly") return { day: addDays(today, 7, timeZone), consumed: 2 };
    if (unit === "monthly") return { day: addMonthsZoned(today, 1, timeZone), consumed: 2 };
    if (unit === "yearly") return { day: addMonthsZoned(today, 12, timeZone), consumed: 2 };
  }

  // Bare weekday: "monday" / "tirsdag" / "fre" → the next such day (today counts).
  const bareWd = weekdayIndex(w, danish);
  if (bareWd !== null) {
    return { day: addDays(today, daysUntilWeekday(bareWd, now, timeZone), timeZone), consumed: 1 };
  }

  // Month then day: "jun 3" / "june 3rd" / "marts 15." / "oct 9."
  const mon = monthIndex(w);
  if (mon !== null && words[i + 1]) {
    const dm = /^(\d{1,2})(?:st|nd|rd|th|\.)*$/.exec(words[i + 1]!);
    if (dm) {
      const dt = monthDayDay(mon, Number(dm[1]), now, timeZone);
      if (dt !== null) return { day: dt, consumed: 2 };
    }
  }

  // Day then month (common European/Danish style): "3. juni" / "15 marts" / "3rd june" / "9. okt"
  const dayNumMatch = /^(\d{1,2})(?:st|nd|rd|th|\.)*$/.exec(w);
  if (dayNumMatch && words[i + 1]) {
    const nextMon = monthIndex(words[i + 1]!);
    if (nextMon !== null) {
      const dt = monthDayDay(nextMon, Number(dayNumMatch[1]), now, timeZone);
      if (dt !== null) return { day: dt, consumed: 2 };
    }
  }

  return null;
}

interface TimeMatch {
  time: number;
  consumed: number;
}

function matchTime(words: string[], i: number): TimeMatch | null {
  const word = words[i]!;
  if (word === "noon") return { time: 12 * 60, consumed: 1 };
  if (word === "midnight") return { time: 0, consumed: 1 };

  // English "at 13:00", "at 5pm", "at noon", "at 9.30"
  if (word === "at" && words[i + 1]) {
    const sub = matchTime(words, i + 1);
    if (sub !== null) {
      return { time: sub.time, consumed: 1 + sub.consumed };
    }
  }

  // Danish "kl 17", "kl. 17:00", "kl 9.30", "kl. 9"
  if ((word === "kl" || word === "kl.") && words[i + 1]) {
    const next = words[i + 1]!;
    const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(next);
    if (m) {
      const h = Number(m[1]);
      const min = m[2] ? Number(m[2]) : 0;
      if (h <= 23 && min <= 59) {
        return { time: h * 60 + min, consumed: 2 };
      }
    }
  }

  // Danish prefixed "kl17", "kl.17:00"
  const klPrefixed = /^kl\.?(\d{1,2})(?:[:.](\d{2}))?$/.exec(word);
  if (klPrefixed) {
    const h = Number(klPrefixed[1]);
    const min = klPrefixed[2] ? Number(klPrefixed[2]) : 0;
    if (h <= 23 && min <= 59) {
      return { time: h * 60 + min, consumed: 1 };
    }
  }

  const ampm = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)$/.exec(word);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2] ? Number(ampm[2]) : 0;
    if (h > 12 || m > 59) return null;
    if (ampm[3] === "pm" && h !== 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return { time: h * 60 + m, consumed: 1 };
  }
  const h24 = /^(\d{1,2})[:.](\d{2})$/.exec(word);
  if (h24) {
    const h = Number(h24[1]);
    const m = Number(h24[2]);
    if (h > 23 || m > 59) return null;
    return { time: h * 60 + m, consumed: 1 };
  }
  return null;
}

function formatDueChip(
  dueAt: number,
  withTime: boolean,
  timeZone?: string,
  language?: string,
): string {
  const d = new Date(dueAt);
  // Resolve "" (the "device" preference) to a real zone: `Intl` throws a RangeError on "".
  const tz = resolveTimeZone(timeZone);
  const locale = language && language.length >= 2 ? language : undefined;
  const date = d.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: tz });
  if (!withTime) return date;
  const time = d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  return `${date}, ${time}`;
}

export function parseQuickAdd(
  text: string,
  now: number,
  ctx: QuickAddContext = {},
): QuickAddResult {
  const tz = ctx.timeZone;
  const danish = /^da(?:[-_]|$)/i.test(ctx.language ?? "");
  const tokens = [...text.matchAll(/\S+/g)];
  const words = tokens.map((m) => m[0]);
  const wordStarts = tokens.map((m) => m.index ?? 0);
  const lower = words.map((w) => w.toLowerCase());

  let priority: Priority | undefined;
  let projectName: string | undefined;
  let resolvedProjectId: string | undefined;
  let projectTokenSpan: TokenSpan | undefined;
  let projectMatch: TokenSpan | undefined;
  const labels: string[] = [];
  const labelTokenSpans: TokenSpan[] = [];
  const labelMatches: TokenSpan[] = [];
  let recurrence: string | undefined;
  let dueDay: number | undefined;
  let dueTime: number | null = null;
  // Whether the user typed a time (vs. the 23:59 default); an all-day due shows the date only.
  let explicitTime = false;
  let dateMatch: DateMatchSpan | undefined;
  const titleWords: string[] = [];

  interface MatchedDateInfo {
    startWord: number;
    consumed: number;
    day: number;
    phrase: string;
    span: { start: number; end: number };
  }
  interface MatchedTimeInfo {
    startWord: number;
    consumed: number;
    time: number;
    phrase: string;
    span: { start: number; end: number };
  }

  let matchedDate: MatchedDateInfo | undefined;
  let matchedTime: MatchedTimeInfo | undefined;
  const consumedWords = new Set<number>();

  for (let i = 0; i < words.length;) {
    const w = words[i]!;
    const lw = lower[i]!;

    if (/^p[1-4]$/.test(lw)) {
      priority = Number(lw[1]) as Priority;
      consumedWords.add(i);
      i += 1;
      continue;
    }
    if (w.startsWith("#") && w.length > 1) {
      const name = w.slice(1);
      const isUnlinked =
        ctx.ignoreProjects?.includes(w.toLowerCase()) ||
        ctx.ignoreProjects?.includes(name.toLowerCase()) ||
        ctx.ignoreProjects?.includes(w) ||
        ctx.ignoreProjects?.includes(name);
      if (!isUnlinked) {
        const resolvedId = ctx.projectIdByName ? ctx.projectIdByName(name) : undefined;
        if (ctx.projectIdByName === undefined || resolvedId) {
          projectName = name;
          projectTokenSpan = {
            start: wordStarts[i]!,
            end: wordStarts[i]! + w.length,
            text: w,
            value: projectName,
          };
          consumedWords.add(i);
          if (resolvedId) {
            resolvedProjectId = resolvedId;
            projectMatch = projectTokenSpan;
          } else if (ctx.projectIdByName === undefined) {
            projectMatch = projectTokenSpan;
          }
        }
      }
      i += 1;
      continue;
    }
    if (w.startsWith("@") && w.length > 1) {
      const labelName = w.slice(1);
      const isUnlinked =
        ctx.ignoreLabels?.includes(w.toLowerCase()) ||
        ctx.ignoreLabels?.includes(labelName.toLowerCase()) ||
        ctx.ignoreLabels?.includes(w) ||
        ctx.ignoreLabels?.includes(labelName);
      if (!isUnlinked) {
        const isKnown = ctx.isKnownLabel ? ctx.isKnownLabel(labelName) : true;
        if (isKnown) {
          labels.push(labelName);
          const span: TokenSpan = {
            start: wordStarts[i]!,
            end: wordStarts[i]! + w.length,
            text: w,
            value: labelName,
          };
          labelTokenSpans.push(span);
          labelMatches.push(span);
          consumedWords.add(i);
        }
      }
      i += 1;
      continue;
    }

    const rec = matchRecurrence(lower, i, danish);
    if (rec) {
      recurrence = rec.rule;
      for (let k = 0; k < rec.consumed; k++) consumedWords.add(i + k);
      i += rec.consumed;
      continue;
    }
    const date = ctx.disableDates ? null : matchDate(lower, i, now, tz, danish);
    if (date && !matchedDate) {
      const phrase = lower.slice(i, i + date.consumed).join(" ");
      const last = i + date.consumed - 1;
      const span = { start: wordStarts[i]!, end: wordStarts[last]! + words[last]!.length };
      matchedDate = {
        startWord: i,
        consumed: date.consumed,
        day: date.day,
        phrase,
        span,
      };
      i += date.consumed;
      continue;
    }
    const time = ctx.disableDates ? null : matchTime(lower, i);
    if (time !== null && !matchedTime) {
      const phrase = lower.slice(i, i + time.consumed).join(" ");
      const last = i + time.consumed - 1;
      const span = { start: wordStarts[i]!, end: wordStarts[last]! + words[last]!.length };
      matchedTime = {
        startWord: i,
        consumed: time.consumed,
        time: time.time,
        phrase,
        span,
      };
      i += time.consumed;
      continue;
    }

    i += 1;
  }

  if (matchedDate && matchedTime) {
    const isAdjacent =
      matchedDate.startWord + matchedDate.consumed === matchedTime.startWord ||
      matchedTime.startWord + matchedTime.consumed === matchedDate.startWord;

    if (isAdjacent) {
      const compStart = Math.min(matchedDate.span.start, matchedTime.span.start);
      const compEnd = Math.max(matchedDate.span.end, matchedTime.span.end);
      const compPhrase = text.slice(compStart, compEnd).toLowerCase().trim();
      const isUnlinked =
        ctx.ignoreDates?.includes(compPhrase) ||
        ctx.ignoreDates?.includes(matchedDate.phrase) ||
        ctx.ignoreDates?.includes(matchedTime.phrase);

      if (!isUnlinked) {
        dueDay = matchedDate.day;
        dueTime = matchedTime.time;
        explicitTime = true;
        dateMatch = { start: compStart, end: compEnd, text: compPhrase };
        for (let k = 0; k < matchedDate.consumed; k++) consumedWords.add(matchedDate.startWord + k);
        for (let k = 0; k < matchedTime.consumed; k++) consumedWords.add(matchedTime.startWord + k);
      }
    } else {
      const dateUnlinked = ctx.ignoreDates?.includes(matchedDate.phrase);
      const timeUnlinked = ctx.ignoreDates?.includes(matchedTime.phrase);

      if (!dateUnlinked) {
        dueDay = matchedDate.day;
        for (let k = 0; k < matchedDate.consumed; k++) consumedWords.add(matchedDate.startWord + k);
      }
      if (!timeUnlinked) {
        dueTime = matchedTime.time;
        explicitTime = true;
        for (let k = 0; k < matchedTime.consumed; k++) consumedWords.add(matchedTime.startWord + k);
      }
      if (!dateUnlinked) {
        dateMatch = {
          start: matchedDate.span.start,
          end: matchedDate.span.end,
          text: matchedDate.phrase,
        };
      } else if (!timeUnlinked) {
        dateMatch = {
          start: matchedTime.span.start,
          end: matchedTime.span.end,
          text: matchedTime.phrase,
        };
      }
    }
  } else if (matchedDate) {
    const isUnlinked = ctx.ignoreDates?.includes(matchedDate.phrase);
    if (!isUnlinked) {
      // Date without an explicit time = an all-day (23:59) due; the instant is built below.
      dueDay = matchedDate.day;
      dateMatch = {
        start: matchedDate.span.start,
        end: matchedDate.span.end,
        text: matchedDate.phrase,
      };
      for (let k = 0; k < matchedDate.consumed; k++) consumedWords.add(matchedDate.startWord + k);
    }
  } else if (matchedTime) {
    const isUnlinked = ctx.ignoreDates?.includes(matchedTime.phrase);
    if (!isUnlinked) {
      dueTime = matchedTime.time;
      explicitTime = true;
      dateMatch = {
        start: matchedTime.span.start,
        end: matchedTime.span.end,
        text: matchedTime.phrase,
      };
      for (let k = 0; k < matchedTime.consumed; k++) consumedWords.add(matchedTime.startWord + k);
    }
  }

  for (let i = 0; i < words.length; i++) {
    if (!consumedWords.has(i)) {
      titleWords.push(words[i]!);
    }
  }

  // Wall-clock time in the zone (adding minutes to midnight lands an hour off on a DST day).
  const day = dueDay ?? (recurrence !== undefined ? firstRuleDay(recurrence, now, tz) : undefined);
  let dueAt: number | undefined;
  if (day !== undefined) {
    dueAt = dueTime !== null ? atMinutes(day, dueTime, tz) : endOfDay(day, tz);
  } else if (dueTime !== null) {
    dueAt = atMinutes(now, dueTime, tz);
  }
  if (recurrence && dueAt !== undefined) recurrence = anchorMonthDay(recurrence, dueAt, tz);

  const title = titleWords.join(" ").trim();

  const chips: ParsedChip[] = [];
  if (dueAt !== undefined) {
    chips.push({ kind: "due", label: formatDueChip(dueAt, explicitTime, tz, ctx.language) });
  }
  if (recurrence) chips.push({ kind: "recurrence", label: formatRule(recurrence) ?? recurrence });
  if (projectName) chips.push({ kind: "project", label: `#${projectName}` });
  for (const l of labels) chips.push({ kind: "label", label: `@${l}` });
  if (priority) chips.push({ kind: "priority", label: `P${priority}` });

  const input: CreateTaskInput = { title };
  if (priority) input.priority = priority;
  if (dueAt !== undefined) input.due_at = dueAt;
  if (recurrence) input.recurrence = recurrence;
  if (resolvedProjectId) input.project_id = resolvedProjectId;

  return {
    input,
    title,
    chips,
    dateMatch,
    projectMatch,
    labelMatches: labelMatches.length > 0 ? labelMatches : undefined,
    labels,
  };
}
