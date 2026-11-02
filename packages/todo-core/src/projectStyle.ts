/**
 * Per-project icon and colour: the portable half. Each app maps names to its own icon components;
 * keep both keyed by {@link PROJECT_ICON_NAMES}.
 */

export const DEFAULT_PROJECT_ICON = "hash";

export const DEFAULT_FILTER_ICON = "filter";

export const DEFAULT_FOLDER_ICON = "folder";

export const PROJECT_ICON_NAMES: string[] = [
  "hash",
  "briefcase",
  "home",
  "heart",
  "star",
  "book",
  "code",
  "music",
  "cart",
  "plane",
  "dumbbell",
  "school",
  "palette",
  "rocket",
  "coffee",
  "leaf",
  "filter",
  "folder",
];

export const PROJECT_COLORS: string[] = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#84cc16", // lime
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#a855f7", // purple
];

export function defaultColorForIndex(n: number): string {
  const len = PROJECT_COLORS.length;
  return PROJECT_COLORS[((n % len) + len) % len] ?? PROJECT_COLORS[0]!;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// A blank colour falls back to a stable per-id colour so projects stay distinct.
export function resolveProjectColor(project: { id: string; color: string }): string {
  return project.color || defaultColorForIndex(hashId(project.id));
}
