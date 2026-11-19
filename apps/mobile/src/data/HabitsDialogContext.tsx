import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useFeature } from "../hooks/useFeature";

/**
 * Whether the habits dialog is open: the full Habits screen over whatever screen is showing. It is
 * mounted once at the root; H (web/desktop) and the floating add button's press-and-hold (phone)
 * both open it through here.
 */
export interface HabitsDialogControl {
  /** The habits feature is on: while it is off, nothing may offer to open the dialog. */
  enabled: boolean;
  open: boolean;
  openHabits: () => void;
  closeHabits: () => void;
}

const HabitsDialogContext = createContext<HabitsDialogControl | null>(null);

export function HabitsDialogProvider({ children }: { children: ReactNode }) {
  const enabled = useFeature("habits");
  const [open, setOpen] = useState(false);
  const openHabits = useCallback(() => setOpen(true), []);
  const closeHabits = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ enabled, open: enabled && open, openHabits, closeHabits }),
    [enabled, open, openHabits, closeHabits],
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
