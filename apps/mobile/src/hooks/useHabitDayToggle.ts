import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Habit } from "@atlastodo/todo-core";
import { useHabitCheckins } from "./useHabitCheckins";
import { useToast } from "../data/ToastProvider";
import { haptics } from "../lib/haptics";

/**
 * Tapping a habit's day, wherever it is drawn (the Habits list, Today): cycles the day (clear ->
 * done -> skip -> clear) and raises a toast that undoes exactly that tap.
 */
export function useHabitDayToggle(): (habit: Habit, date: string) => void {
  const { t } = useTranslation();
  const toast = useToast();
  const { cycle } = useHabitCheckins();

  return useCallback(
    (habit: Habit, date: string) => {
      const { next, undo } = cycle(habit.id, date);
      if (next === "done") haptics.success();
      else haptics.selection();
      toast.show(
        t(
          next === "done"
            ? "toast.habitChecked"
            : next === "skip"
              ? "toast.habitSkipped"
              : "toast.habitCleared",
          { name: habit.name },
        ),
        { label: t("common.undo"), run: undo },
      );
    },
    [cycle, t, toast],
  );
}
