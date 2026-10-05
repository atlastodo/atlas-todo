import { useWindowDimensions } from "react-native";

/**
 * The viewport width at/above which the app shows a desktop-style layout: a persistent
 * sidebar instead of the phone's drawer + bottom tabs (`>= 768px`).
 */
const WIDE_BREAKPOINT = 768;

/**
 * True on wide viewports (desktop browser, tablet landscape), false on a phone. Backed by
 * `useWindowDimensions`, so it re-renders on rotation or resize. The branch is in JS, not CSS, so
 * only one shell mounts at a time (keeping role/label queries unambiguous).
 */
export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}

/**
 * The width at/above which the wide layout is a desktop: below it (a tablet, `768-1023px`) the
 * sidebar starts as the collapsed icon rail so the content keeps its room.
 */
const DESKTOP_BREAKPOINT = 1024;

/** True on a tablet-width viewport: wide enough for the sidebar, too narrow to keep it expanded. */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT && width < DESKTOP_BREAKPOINT;
}
