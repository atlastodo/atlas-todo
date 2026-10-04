import { usePreferences } from "./usePreferences";

/**
 * The optional, user-toggleable features. Each maps to a `*_enabled` field on the synced preference
 * entity. Disabling one must hide it everywhere (nav entry, route, every entry point), not grey it out.
 */
export type FeatureFlag = "focus" | "habits" | "countdowns" | "stats" | "reminders";

/**
 * Single source of truth for whether an optional feature is enabled, so the drawer, the routes and
 * Settings all gate on the same value. All features default on.
 */
export function useFeature(flag: FeatureFlag): boolean {
  const prefs = usePreferences();
  switch (flag) {
    case "focus":
      return prefs.focusEnabled;
    case "habits":
      return prefs.habitsEnabled;
    case "countdowns":
      return prefs.countdownsEnabled;
    case "stats":
      return prefs.statsEnabled;
    case "reminders":
      return prefs.remindersEnabled;
  }
}
