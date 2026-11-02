/**
 * The app's smart lists: the always-present views that are not a project, filter or feature. Shared
 * because the stored `default_view` preference is validated against it on every client; routing
 * stays per app.
 */

export type SmartView = "today" | "upcoming" | "inbox" | "all" | "assigned" | "completed";

export const SMART_VIEWS: SmartView[] = [
  "today",
  "upcoming",
  "inbox",
  "all",
  "assigned",
  "completed",
];

export function isSmartView(value: unknown): value is SmartView {
  return typeof value === "string" && (SMART_VIEWS as string[]).includes(value);
}
