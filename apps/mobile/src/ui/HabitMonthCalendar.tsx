import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  dateKeyFromMs,
  isScheduledOn,
  shiftDateKey,
  startOfWeekKey,
  weekdayLabels,
  type CheckinState,
  type Habit,
} from "@atlas/shared";
import { ChevronLeft, ChevronRight } from "./icons";
import { haptics } from "../lib/haptics";

/**
 * A month of a habit's history, scrollable back through all of it, for repairing a mis-recorded
 * day. No depth limit on backfill. Tapping a day cycles it through the same `onToggleDay` as the strip.
 */
export function HabitMonthCalendar({
  habit,
  states,
  isBackfilled,
  todayMs,
  weekStartsOn,
  onToggleDay,
}: {
  habit: Habit;
  states: ReadonlyMap<string, CheckinState>;
  isBackfilled: (date: string) => boolean;
  todayMs: number;
  weekStartsOn: number;
  onToggleDay: (date: string) => void;
}) {
  const { t } = useTranslation();
  const todayKey = dateKeyFromMs(todayMs);
  const [offset, setOffset] = useState(0);

  const { weeks, monthPrefix, title } = useMemo(() => {
    const year = Number(todayKey.slice(0, 4));
    const month = Number(todayKey.slice(5, 7)) - 1 - offset;
    const anchor = new Date(Date.UTC(year, month, 1));
    const prefix = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
    const start = startOfWeekKey(`${prefix}-01`, weekStartsOn);
    const rows: string[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = Array.from({ length: 7 }, (_, d) => shiftDateKey(start, w * 7 + d));
      if (w > 3 && row.every((key) => key.slice(0, 7) !== prefix)) break;
      rows.push(row);
    }
    return {
      weeks: rows,
      monthPrefix: prefix,
      title: `${anchor.toLocaleString("en", { month: "long", timeZone: "UTC" })} ${anchor.getUTCFullYear()}`,
    };
  }, [todayKey, offset, weekStartsOn]);

  const labels = weekdayLabels(weekStartsOn);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("habits.previousMonth")}
          onPress={() => {
            haptics.selection();
            setOffset((value) => value + 1);
          }}
          hitSlop={8}
          className="p-1"
        >
          <ChevronLeft size={18} className="text-neutral-500" />
        </Pressable>
        <Text className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("habits.nextMonth")}
          disabled={offset === 0}
          onPress={() => {
            haptics.selection();
            setOffset((value) => Math.max(0, value - 1));
          }}
          hitSlop={8}
          className={"p-1 " + (offset === 0 ? "opacity-30" : "")}
        >
          <ChevronRight size={18} className="text-neutral-500" />
        </Pressable>
      </View>

      <View className="flex-row">
        {labels.map((label, i) => (
          <Text key={i} className="flex-1 text-center text-xs text-neutral-400">
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={index} className="flex-row">
          {week.map((day) => {
            const outside = day.slice(0, 7) !== monthPrefix;
            const future = day > todayKey;
            const state = states.get(day);
            const scheduled = isScheduledOn(habit, day, weekStartsOn);
            const backfilled = state === "done" && isBackfilled(day);
            const label = t("habits.dayState", {
              date: day,
              state: t(
                state === "done"
                  ? "habits.stateDone"
                  : state === "skip"
                    ? "habits.stateSkipped"
                    : "habits.stateNone",
              ),
            });
            const body = (
              <View
                className={
                  "m-0.5 h-8 items-center justify-center rounded-md " +
                  (state === "done"
                    ? backfilled
                      ? "border-2"
                      : ""
                    : state === "skip"
                      ? "border border-neutral-400 dark:border-neutral-500"
                      : scheduled && !future
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : "")
                }
                style={
                  state === "done"
                    ? backfilled
                      ? { borderColor: habit.color }
                      : { backgroundColor: habit.color }
                    : undefined
                }
              >
                <Text
                  className={
                    "text-xs " +
                    (state === "done"
                      ? backfilled
                        ? "text-neutral-800 dark:text-neutral-100"
                        : "font-medium text-white"
                      : outside || future
                        ? "text-neutral-300 dark:text-neutral-700"
                        : "text-neutral-700 dark:text-neutral-200")
                  }
                >
                  {Number(day.slice(8, 10))}
                </Text>
              </View>
            );
            if (future)
              return (
                <View key={day} className="flex-1">
                  {body}
                </View>
              );
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => onToggleDay(day)}
                className="flex-1"
              >
                {body}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
