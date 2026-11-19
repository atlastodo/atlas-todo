import { useEffect } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useHabits } from "../hooks/useHabits";
import { useIsWide } from "../hooks/useIsWide";
import { usePreferences } from "../hooks/usePreferences";
import { useHabitsDialog } from "../data/HabitsDialogContext";
import { useToast } from "../data/ToastProvider";

/**
 * Teaches the habits shortcut once, as a toast with an Open action: "press H" where there is a
 * keyboard layout (wide web, desktop), "press and hold +" on a phone. It waits for the first habit,
 * so someone who does not use habits is never told about them, and each tip is recorded as seen
 * (synced) the moment it shows.
 */
export function HabitsShortcutTip() {
  const { t } = useTranslation();
  const toast = useToast();
  const { habits, habitGroups } = useHabits();
  const { habitsTipSeen, setHabitsTipSeen } = usePreferences();
  const { enabled, openHabits } = useHabitsDialog();
  const isWide = useIsWide();
  const kind = Platform.OS === "web" && isWide ? "key" : "hold";
  const due = enabled && habits.length + habitGroups.length > 0 && !habitsTipSeen(kind);

  useEffect(() => {
    if (!due) return;
    setHabitsTipSeen(kind);
    toast.show(t(kind === "key" ? "habits.tipKey" : "habits.tipHold"), {
      label: t("common.open"),
      run: openHabits,
    });
  }, [due, kind, setHabitsTipSeen, toast, t, openHabits]);

  return null;
}
