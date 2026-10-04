import type { ReactNode } from "react";
import { useReorderableDrag } from "react-native-reorderable-list";

/**
 * Hands a row inside a `ReorderableList` the callback that lifts it for dragging.
 *
 * `useReorderableDrag()` is the only way a drag can start. `panActivateAfterLongPress` only gates
 * when the pan may activate; `state = DRAGGED` is set in the library's `startDrag`, called only by
 * that hook. Without it in the subtree the list could not reorder, never fired `onDragEnd`, and its
 * pan still stole the touch from the row's swipe. The hook must run inside a cell, so each row
 * needs a component; a render prop keeps each list's `TaskRow` props where they live.
 */
export function DragToReorder({
  enabled,
  children,
}: {
  /** False while multi-selecting: a long-press there picks rows. */
  enabled: boolean;
  /** Rendered with the lift callback, or `undefined` when dragging is off. */
  children: (startDrag: (() => void) | undefined) => ReactNode;
}) {
  const drag = useReorderableDrag();
  return <>{children(enabled ? drag : undefined)}</>;
}
