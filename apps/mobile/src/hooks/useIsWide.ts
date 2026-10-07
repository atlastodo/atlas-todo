import { Platform, useWindowDimensions } from "react-native";

/**
 * The viewport width at/above which the app shows a desktop-style layout: a persistent
 * sidebar instead of the phone's drawer + bottom tabs (`>= 768px`).
 */
const WIDE_BREAKPOINT = 768;

/**
 * A browser driven by a mouse or trackpad (`pointer: fine`): a desktop or laptop, including the
 * desktop app. Read once; the primary pointer does not change in a session.
 */
const DESKTOP_POINTER =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: fine)").matches;

/**
 * True on wide viewports (desktop browser, tablet landscape), false on a phone. Backed by
 * `useWindowDimensions`, so it re-renders on rotation or resize. The branch is in JS, not CSS, so
 * only one shell mounts at a time (keeping role/label queries unambiguous).
 *
 * A desktop browser is always wide: a half-screen laptop window keeps the sidebar (as the icon
 * rail, see {@link useIsTablet}) and dialogs instead of turning into the phone's bottom tabs and
 * sheets.
 */
export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT || DESKTOP_POINTER;
}

/**
 * The width at/above which the wide layout is a desktop: below it (a tablet, `768-1023px`, or a
 * narrow desktop window) the sidebar starts as the collapsed icon rail so the content keeps its room.
 */
const DESKTOP_BREAKPOINT = 1024;

/** True when the layout is wide but too narrow to keep the sidebar expanded. */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return (width >= WIDE_BREAKPOINT || DESKTOP_POINTER) && width < DESKTOP_BREAKPOINT;
}
