import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useFeature } from "../hooks/useFeature";
import { useHabits } from "../hooks/useHabits";
import { usePreferences } from "../hooks/usePreferences";

/**
 * Whether the habits dialog is open: the full Habits screen over whatever screen is showing. It is
 * mounted once at the root; H (web/desktop) and the floating add button's press-and-hold (phone)
 * both open it through here.
 */
export interface HabitsDialogControl {
  /** The habits feature is on: while it is off, nothing may offer to open the dialog. */
  enabled: boolean;
  /** Someone with habits has not yet been shown that holding + opens them (the add button's callout). */
  holdTipDue: boolean;
  /** The hold tip has been read (closed, or the hold used): it does not come back, on any device. */
  dismissHoldTip: () => void;
  open: boolean;
  openHabits: () => void;
  closeHabits: () => void;
}

const HabitsDialogContext = createContext<HabitsDialogControl | null>(null);

export function HabitsDialogProvider({ children }: { children: ReactNode }) {
  const enabled = useFeature("habits");
  const { habits, habitGroups } = useHabits();
  const { habitsTipSeen, setHabitsTipSeen } = usePreferences();
  const holdTipDue = enabled && habits.length + habitGroups.length > 0 && !habitsTipSeen("hold");
  const dismissHoldTip = useCallback(() => setHabitsTipSeen("hold"), [setHabitsTipSeen]);
  const [open, setOpen] = useState(false);
  // Closed for good when habits are turned off while it is open, not hidden until they come back on.
  if (!enabled && open) setOpen(false);
  const openHabits = useCallback(() => setOpen(true), []);
  const closeHabits = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({
      enabled,
      holdTipDue,
      dismissHoldTip,
      open: enabled && open,
      openHabits,
      closeHabits,
    }),
    [enabled, holdTipDue, dismissHoldTip, open, openHabits, closeHabits],
  );
  return <HabitsDialogContext.Provider value={value}>{children}</HabitsDialogContext.Provider>;
}

export function useHabitsDialog(): HabitsDialogControl {
  const ctx = useContext(HabitsDialogContext);
  if (!ctx) throw new Error("useHabitsDialog must be used within a HabitsDialogProvider");
  return ctx;
}

/** The dialog's control where it may be absent (a list rendered outside the app shell, a test). */
export function useOptionalHabitsDialog(): HabitsDialogControl | null {
  return useContext(HabitsDialogContext);
}
