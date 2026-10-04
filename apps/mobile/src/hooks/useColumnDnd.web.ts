import { useEffect, useRef, useState, type RefObject } from "react";
import { useMimeDropTarget } from "./useMimeDropTarget.web";

/**
 * HTML5 drag-and-drop for reordering board columns on web: drag a column's header onto another. A
 * sibling of `useCardDnd.web.ts` with its own MIME, so card and column drags never trigger each
 * other's targets. Native uses the no-op `useColumnDnd.ts`; the caller persists the reorder through
 * the shared `reorderRank`, so a drag and the menu's Move left/right converge.
 *
 * `useColumnDragSource` returns whether this header is mid-drag (the caller lifts it);
 * `useColumnDropTarget` whether a column hovers over this one (the caller shows a drop bar). Both
 * are always `false` on native.
 */

/** The private MIME carrying a dragged section id, distinct from a card drag's. */
export const COLUMN_MIME = "application/x-atlas-column";

export interface ColumnDragCallbacks {
  /** The drag started (so the board can note which section is being dragged, to pick the drop side). */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function useColumnDragSource<T>(
  ref: RefObject<T | null>,
  payload: () => string,
  callbacks?: ColumnDragCallbacks,
): boolean {
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    el.setAttribute("draggable", "true");
    el.style.cursor = "grab";
    const onStart = (e: DragEvent) => {
      // Leave the event alone if a nested card drag already claimed it.
      e.dataTransfer?.setData(COLUMN_MIME, payloadRef.current());
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      setDragging(true);
      cbRef.current?.onDragStart?.();
    };
    const onEnd = () => {
      setDragging(false);
      cbRef.current?.onDragEnd?.();
    };
    el.addEventListener("dragstart", onStart);
    el.addEventListener("dragend", onEnd);
    return () => {
      el.removeEventListener("dragstart", onStart);
      el.removeEventListener("dragend", onEnd);
      el.removeAttribute("draggable");
      el.style.cursor = "";
    };
  }, [ref]);

  return dragging;
}

export function useColumnDropTarget<T>(
  ref: RefObject<T | null>,
  onDrop: (sectionId: string) => void,
): boolean {
  return useMimeDropTarget(ref, COLUMN_MIME, onDrop);
}
