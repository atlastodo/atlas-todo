/**
 * The navigation options for the task-detail route. Constant, not a function of window width:
 * React Navigation cannot change a mounted screen's `presentation` and merges option updates, so
 * flipping them across the wide/narrow breakpoint left the header or the card presentation stuck.
 * Only the body layout varies by width (`TaskDetailWebFrame`). Every platform gets a
 * `transparentModal` so the list stays mounted behind the panel; the panel draws its own back/close.
 */

export interface TaskDetailScreenOptions {
  headerShown: boolean;
  presentation: "card" | "transparentModal" | "formSheet";
  animation: "fade" | "default" | "slide_from_bottom";
  sheetGrabberVisible: boolean;
  contentStyle: { backgroundColor: string } | undefined;
}

export function taskDetailScreenOptions(_isWeb: boolean): TaskDetailScreenOptions {
  return {
    headerShown: false,
    presentation: "transparentModal",
    animation: "fade",
    sheetGrabberVisible: false,
    contentStyle: { backgroundColor: "transparent" },
  };
}
