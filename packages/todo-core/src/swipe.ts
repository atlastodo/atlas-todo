/**
 * Horizontal swipe gestures on task rows. {@link classifySwipe} counts a drag only when it travels
 * far enough and is clearly more horizontal than vertical, so it never hijacks a scroll.
 * {@link resolveTaskSwipe} decides what the configured action means for one row.
 */

export interface Point {
  x: number;
  y: number;
}

export type SwipeDirection = "right" | "left" | "none";

export type TaskSwipeAction = "complete" | "schedule" | "indent" | "delete" | "none";
export const TASK_SWIPE_ACTIONS: TaskSwipeAction[] = [
  "complete",
  "schedule",
  "indent",
  "delete",
  "none",
];
export function isTaskSwipeAction(v: unknown): v is TaskSwipeAction {
  return typeof v === "string" && (TASK_SWIPE_ACTIONS as string[]).includes(v);
}

export interface SwipeConfig {
  threshold: number;
  // |dx| must exceed this multiple of |dy| (axis-lock against scrolling).
  axisRatio: number;
}

export const DEFAULT_SWIPE: SwipeConfig = { threshold: 64, axisRatio: 1.5 };

export function classifySwipe(
  start: Point,
  end: Point,
  config: SwipeConfig = DEFAULT_SWIPE,
): SwipeDirection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < config.threshold) return "none";
  if (Math.abs(dx) < config.axisRatio * Math.abs(dy)) return "none"; // predominantly vertical
  return dx > 0 ? "right" : "left";
}

export type TaskSwipeEffect = "complete" | "schedule" | "indent" | "outdent" | "delete";

export interface TaskSwipeRow {
  locked: boolean;
  isSubtask: boolean;
  canIndent: boolean;
  canOutdent: boolean;
}

// "indent" nests a top-level row under the row above and lifts a subtask one level.
export function resolveTaskSwipe(
  action: TaskSwipeAction,
  row: TaskSwipeRow,
): TaskSwipeEffect | null {
  if (row.locked) return null;
  switch (action) {
    case "indent":
      if (row.isSubtask) return row.canOutdent ? "outdent" : null;
      return row.canIndent ? "indent" : null;
    case "complete":
    case "schedule":
    case "delete":
      return action;
    case "none":
      return null;
  }
}

// The axis-lock of {@link classifySwipe} without the distance threshold, so the reveal tracks from the first pixel.
export function isHorizontal(
  start: Point,
  end: Point,
  config: SwipeConfig = DEFAULT_SWIPE,
): boolean {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx > 4 && dx >= config.axisRatio * dy;
}

export function clampOffset(dx: number, max: number): number {
  return Math.max(-max, Math.min(max, dx));
}
