import { useEffect } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useHabits } from "../hooks/useHabits";
import { useIsWide } from "../hooks/useIsWide";
import { usePreferences } from "../hooks/usePreferences";
import { useHabitsDialog } from "../data/HabitsDialogContext";
import { useToast } from "../data/ToastProvider";

/**
 * Whether the browser has a precise pointer (a mouse or trackpad): the best sign a page gets of a
 * keyboard, which it cannot detect itself. A touch-only tablet has none. Assumed where it cannot
 * be asked.
 */
function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(any-pointer: fine)").matches;
}

/**
 * Teaches H once, where there is a keyboard layout (wide web, desktop, not a touch-only tablet), as a toast with an Open
 * action. It waits for the first habit, so someone who does not use habits is never told about
 * them, and is recorded as seen (synced) the moment it shows. A phone is taught the add button's
 * press-and-hold by a callout on the button itself (`FloatingAddButton`): a toast there is too
 * narrow for the sentence.
 */
export function HabitsShortcutTip() {
  const { t } = useTranslation();
  const toast = useToast();
  const { habits, habitGroups } = useHabits();
  const { habitsTipSeen, setHabitsTipSeen } = usePreferences();
  const { enabled, openHabits } = useHabitsDialog();
  const isWide = useIsWide();
  const keyboard = Platform.OS === "web" && isWide && hasFinePointer();
  const due =
    keyboard && enabled && habits.length + habitGroups.length > 0 && !habitsTipSeen("key");

  useEffect(() => {
    if (!due) return;
    setHabitsTipSeen("key");
    toast.show(t("habits.tipKey"), { label: t("common.open"), run: openHabits });
  }, [due, setHabitsTipSeen, toast, t, openHabits]);

  return null;
}
