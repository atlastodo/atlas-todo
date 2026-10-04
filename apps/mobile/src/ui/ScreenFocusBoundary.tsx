import type { ReactNode } from "react";
import { useIsFocused } from "expo-router";
import { ScreenFocusContext } from "../data/ScreenFocusContext";

/**
 * Supplies the real navigation focus state to {@link ScreenFocusContext}. Route files only.
 * `useIsFocused` comes from expo-router, not `@react-navigation/native`: expo-router owns the
 * navigation context (the other reads an empty one and throws), and it keeps the navigation
 * runtime out of anything jest renders. Screens are tested against `ScreenFocusContext`'s default.
 */
export function ScreenFocusBoundary({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return <ScreenFocusContext.Provider value={focused}>{children}</ScreenFocusContext.Provider>;
}
