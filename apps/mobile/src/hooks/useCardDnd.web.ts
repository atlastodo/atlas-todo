import { useEffect, useRef, useState, type RefObject } from "react";
import { useMimeDropTarget } from "./useMimeDropTarget.web";

/**
 * HTML5 drag-and-drop for the board on web: drag a card between columns. react-native-web forwards
 * a `View` ref to its DOM node, so these hooks attach browser drag events and carry the card's id
 * through the `DataTransfer`. Native uses the no-op `useCardDnd.ts`. The caller persists the move
 * through the shared `columnMoveWrites`, so the rank rules match the tap flow.
 *
 * Each hook returns a live boolean for drag feedback: `useDragSource` (this card is being dragged),
 * `useDragLift` (when to take it out of its column) and `useDropTarget` (a card hovers here).
 * Native always returns `false`.
 */

/** The private MIME type carrying a dragged task id, so the board ignores unrelated drags. */
export const CARD_MIME = "application/x-atlas-card";

/** Optional callbacks and switch for `useDragSource`, like the column drag's `ColumnDragCallbacks`. */
export interface CardDragSourceOptions {
  /** `false` leaves the element undraggable (a locked task's card). */
  enabled?: boolean;
  /** The drag started: the board notes the dragged card, so drop targets can preview it. */
  onDragStart?: () => void;
  /** The drag ended on this source, dropped or cancelled. */
  onDragEnd?: () => void;
}

/**
 * Make the ref'd element a draggable card carrying `payload()` (the task id). Returns whether it is
 * mid-drag, so the caller can dim it (see {@link useDragLift}). `options.onDragStart` lets the board
 * track the card in flight. A cross-column drop re-renders the source under its new column, so its
 * own `dragend` can be lost; the board must also reset from the window's capture-phase
 * `drop`/`dragend`, as this hook does.
 */
export function useDragSource<T>(
  ref: RefObject<T | null>,
  payload: () => string,
  { enabled = true, onDragStart, onDragEnd }: CardDragSourceOptions = {},
): boolean {
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const cbRef = useRef({ onDragStart, onDragEnd });
  cbRef.current = { onDragStart, onDragEnd };
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el || !enabled) return;
    el.setAttribute("draggable", "true");
    el.style.cursor = "grab";
    const onStart = (e: DragEvent) => {
      e.dataTransfer?.setData(CARD_MIME, payloadRef.current());
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      setDragging(true);
      cbRef.current.onDragStart?.();
    };
    // Fires whether the drop landed or was cancelled (Esc).
    const onEnd = () => {
      setDragging(false);
      cbRef.current.onDragEnd?.();
    };
    // A drop that moves the card re-renders it, and a source moved or re-mounted mid-drag may never
    // get its own dragend. The window's capture phase sees every drop and drag end first.
    const reset = () => setDragging(false);
    el.addEventListener("dragstart", onStart);
    el.addEventListener("dragend", onEnd);
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    return () => {
      el.removeEventListener("dragstart", onStart);
      el.removeEventListener("dragend", onEnd);
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
      el.removeAttribute("draggable");
      el.style.cursor = "";
    };
  }, [ref, enabled]);

  return dragging;
}

/**
 * Whether a dragged source should be taken out of its list: true from the frame after the drag
 * started until it ends. It waits a frame because Chromium cancels a drag whose source is hidden
 * inside its own `dragstart`. The caller collapses the element rather than unmounting it, so the
 * source can still receive its `dragend`.
 */
export function useDragLift(dragging: boolean): boolean {
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    if (!dragging) {
      setLifted(false);
      return;
    }
    const frame = requestAnimationFrame(() => setLifted(true));
    return () => cancelAnimationFrame(frame);
  }, [dragging]);
  return dragging && lifted;
}

/**
 * Make the ref'd element a drop target that calls `onDrop(taskId)` when a card is dropped on it.
 * Returns whether a card is currently hovering over it, so the caller can highlight the target.
 */
export function useDropTarget<T>(
  ref: RefObject<T | null>,
  onDrop: (payload: string) => void,
): boolean {
  return useMimeDropTarget(ref, CARD_MIME, onDrop);
}
