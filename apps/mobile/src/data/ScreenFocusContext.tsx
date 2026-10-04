import { createContext, useContext } from "react";

/**
 * Whether the screen hosting this subtree is currently focused.
 *
 * A plain context (no React Navigation import), so any module, including ones under jest that
 * render a screen outside a navigator, can read focus without pulling navigation into its module
 * graph. The default is `true`: a screen rendered on its own is always "focused".
 *
 * {@link ScreenFocusBoundary}, which route files wrap their screen in, supplies the real value.
 * Focus, not mount, is the signal that matters because the drawer/tabs keep visited screens mounted
 * in the background (see `useSelectionSource`).
 */
export const ScreenFocusContext = createContext<boolean>(true);

export function useScreenFocused(): boolean {
  return useContext(ScreenFocusContext);
}
