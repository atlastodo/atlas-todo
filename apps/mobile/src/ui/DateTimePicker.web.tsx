import { useRef } from "react";
import { useColorScheme } from "nativewind";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";

/**
 * Web replacement for `@react-native-community/datetimepicker`, which throws "not supported on:
 * web". Renders the browser's date/time `<input>` and reports through the native module's
 * `onChange(event, date)` contract (`"set"` with a `Date`, or `"dismissed"`), so callers need no
 * platform branch. Only `value`, `mode` and `onChange` are supported.
 *
 * One terminal event per mount. A browser date input fires a change per segment, and mid-edit with
 * an empty value; callers close the picker on any event, so reporting those would unmount it
 * before the month and year could be typed. The value is reported only when the user is done:
 *   - the last digit of a fully typed value (8 digits for `dd/mm/yyyy`) commits it. Counting digits
 *     separates "finished" from "still on the first segment", since the field is prefilled.
 *   - Enter commits, including the prefilled value.
 *   - blur commits only an edited value; an untouched prefill reports a dismissal, so opening a
 *     field and clicking away never stamps a due date. Touch takes this path (iOS Safari's "Done").
 *   - Escape dismisses.
 * The `done` latch stops a commit being followed by the blur that unmounting causes.
 *
 * The `DateTimePickerEvent` import is type-only so the native module stays out of the web bundle;
 * tsc checks against the native `.tsx`, keeping the exported type identical.
 */

type Mode = "date" | "time" | "datetime";

interface Props {
  value?: Date;
  mode?: Mode;
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toInputValue(d: Date, mode: Mode): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return mode === "time" ? time : mode === "datetime" ? `${date}T${time}` : date;
}

/** Digits a value takes when typed out in full: `dd mm yyyy`, `hh mm`, or both. */
const DIGITS: Record<Mode, number> = { date: 8, time: 4, datetime: 12 };

/** A complete value for each mode; a half-typed field is `""`, which matches none of these. */
const COMPLETE: Record<Mode, RegExp> = {
  date: /^(\d{4,})-(\d{2})-(\d{2})$/,
  datetime: /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
  time: /^(\d{2}):(\d{2})/,
};

/**
 * Parse an `<input>` value into a local-time Date, or `null` if empty or incomplete. Built field
 * by field: `new Date("2026-08-17")` is UTC midnight, and `"09:00"` is Invalid Date. `base`
 * supplies the day for `time`. Pure and exported for tests.
 */
export function fromInputValue(raw: string, mode: Mode, base: Date): Date | null {
  const m = COMPLETE[mode].exec(raw);
  if (!m) return null;
  if (mode === "time") {
    const d = new Date(base);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  const [, year, month, day, hours = "0", minutes = "0"] = m;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
}

export default function DateTimePicker({ value, mode = "date", onChange }: Props) {
  const inputType = mode === "time" ? "time" : mode === "datetime" ? "datetime-local" : "date";
  // Dark mode is class-based (NativeWind), not `prefers-color-scheme`, so drive the input's colours
  // and `color-scheme` (which themes the popup calendar) from the applied scheme.
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";

  const initial = value ? toInputValue(value, mode) : "";
  const done = useRef(false);
  const digits = useRef(0);

  const finish = (raw: string, commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const picked = commit ? fromInputValue(raw, mode, value ?? new Date()) : null;
    if (picked) onChange?.({ type: "set" } as unknown as DateTimePickerEvent, picked);
    else onChange?.({ type: "dismissed" } as unknown as DateTimePickerEvent);
  };

  return (
    <input
      type={inputType}
      defaultValue={initial}
      autoFocus
      onKeyDown={(e) => {
        if (/^\d$/.test(e.key)) digits.current += 1;
        if (e.key === "Enter") finish(e.currentTarget.value, true);
        else if (e.key === "Escape") finish(e.currentTarget.value, false);
      }}
      onChange={(e) => {
        // Only the segment that completes a fully typed value ends the edit.
        if (digits.current < DIGITS[mode]) return;
        if (fromInputValue(e.currentTarget.value, mode, value ?? new Date())) {
          finish(e.currentTarget.value, true);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value, e.currentTarget.value !== initial)}
      style={{
        padding: 8,
        fontSize: 14,
        borderRadius: 6,
        color: dark ? "#f4f4f5" : "#18181b",
        backgroundColor: dark ? "#27272a" : "#ffffff",
        border: `1px solid ${dark ? "#3f3f46" : "#d4d4d8"}`,
        colorScheme: dark ? "dark" : "light",
      }}
    />
  );
}
