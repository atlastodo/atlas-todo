import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * How much of the bottom edge is taken, so floating pieces stack instead of overlapping. Three
 * share it and none can see the others: the phone's `MobileBottomNav` (in the drawer shell), the
 * `FocusBar` (a root-level overlay that survives routes pushed over the shell) and the
 * `FloatingAddButton` (inside a task list). Each measures itself into here and reads what it must
 * clear: nav, then focus bar, then add button.
 *
 * Measured, not constants, because heights move with the safe-area inset and text size. A value is
 * zero when its owner is absent (no bottom nav on a wide viewport, no focus bar when idle).
 */
export interface BottomChromeApi {
  /** Height of the phone's bottom navigation bar, or 0 when none is mounted. */
  navHeight: number;
  setNavHeight: (height: number) => void;
  /**
   * Height the focus bar takes along the bottom edge: its own while parked in a bottom corner, 0
   * while idle or parked at the top.
   */
  focusBarBottom: number;
  setFocusBarBottom: (height: number) => void;
}

const EMPTY: BottomChromeApi = {
  navHeight: 0,
  setNavHeight: () => {},
  focusBarBottom: 0,
  setFocusBarBottom: () => {},
};

const BottomChromeContext = createContext<BottomChromeApi | null>(null);

export function BottomChromeProvider({ children }: { children: ReactNode }) {
  const [navHeight, setNavHeight] = useState(0);
  const [focusBarBottom, setFocusBarBottom] = useState(0);
  const value = useMemo<BottomChromeApi>(
    () => ({ navHeight, setNavHeight, focusBarBottom, setFocusBarBottom }),
    [navHeight, focusBarBottom],
  );
  return <BottomChromeContext.Provider value={value}>{children}</BottomChromeContext.Provider>;
}

/** Read the bottom chrome. Returns all-zero no-ops when no provider is mounted (e.g. in tests). */
export function useBottomChrome(): BottomChromeApi {
  return useContext(BottomChromeContext) ?? EMPTY;
}

/** The gap left between two stacked pieces of bottom chrome. */
export const BOTTOM_CHROME_GAP = 8;
