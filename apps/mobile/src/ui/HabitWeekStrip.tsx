import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  isScheduledOn,
  shiftDateKey,
  weekdayLabels,
  weekdayOfKey,
  type CheckinState,
  type Habit,
} from "@atlas/shared";

/**
 * The seven days ending on the shown one, as labelled circles (weekday and date), the smallest
 * thing you can aim at to correct a day. Older days are edited on the detail screen's month
 * calendar. Tapping a circle cycles that day through `onToggleDay`.
 */
export function HabitWeekStrip({
  habit,
  states,
  isBackfilled,
  dayKey,
  weekStartsOn,
  fullWidth = false,
  onToggleDay,
}: {
  habit: Habit;
  states: ReadonlyMap<string, CheckinState>;
  isBackfilled: (date: string) => boolean;
  dayKey: string;
  /** Not for layout (the strip rolls); resolves which schedule governed each day. */
  weekStartsOn: number;
  fullWidth?: boolean;
  onToggleDay?: (date: string) => void;
}) {
  const { t } = useTranslation();
  // Oldest first, ending on the shown day, so the rightmost circle is the one most likely tapped.
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDateKey(dayKey, i - 6)),
    [dayKey],
  );
  // Sunday-based, indexed by the day's own weekday; a fixed week start is meaningless for a rolling strip.
  const names = weekdayLabels(0);

  return (
    // Sharing a row with the name, a fixed gap keeps the circles one strip; on a row of their own
    // they distribute. `justify-between` also keeps seven 36px circles inside a 320px phone.
    <View
      className={
        fullWidth ? "flex-1 flex-row justify-between" : "shrink-0 flex-row justify-end gap-2"
      }
    >
      {days.map((day) => {
        const state = states.get(day);
        const scheduled = isScheduledOn(habit, day, weekStartsOn);
        const backfilled = state === "done" && isBackfilled(day);
        const current = day === dayKey;
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

        const circle = (
          <View
            className={
              "h-9 w-9 items-center justify-center rounded-full " +
              (state === "done"
                ? backfilled
                  ? "border-2"
                  : ""
                : state === "skip"
                  ? "border border-dashed border-neutral-400 dark:border-neutral-500"
                  : scheduled
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "border border-neutral-100 dark:border-neutral-800")
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
                (state === "done" && !backfilled
                  ? "font-medium text-white"
                  : scheduled
                    ? "text-neutral-700 dark:text-neutral-200"
                    : "text-neutral-300 dark:text-neutral-700")
              }
            >
              {Number(day.slice(8, 10))}
            </Text>
          </View>
        );

        return (
          <View key={day} className="items-center gap-1">
            <Text
              className={
                "text-xs " +
                (current
                  ? "font-semibold text-accent-600 dark:text-accent-400"
                  : "text-neutral-400")
              }
            >
              {names[weekdayOfKey(day)]}
            </Text>
            {onToggleDay ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => onToggleDay(day)}
              >
                {circle}
              </Pressable>
            ) : (
              <View accessible accessibilityLabel={label}>
                {circle}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
