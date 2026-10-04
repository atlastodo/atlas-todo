import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Make the ref'd element a drop target for drags carrying `mime`, calling `onDrop(payload)` on a
 * drop. Returns whether such a drag is hovering over it, so the caller can highlight the target.
 */
export function useMimeDropTarget<T>(
  ref: RefObject<T | null>,
  mime: string,
  onDrop: (payload: string) => void,
): boolean {
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    const carriesMime = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes(mime);
    // dragenter/dragleave fire once per descendant crossed, so a boolean would flicker; count enters
    // minus leaves instead.
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!carriesMime(e)) return;
      depth += 1;
      setOver(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesMime(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onOver = (e: DragEvent) => {
      if (carriesMime(e)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }
    };
    const onDropEvt = (e: DragEvent) => {
      const data = e.dataTransfer?.getData(mime);
      depth = 0;
      setOver(false);
      if (data) {
        e.preventDefault();
        // Keep the innermost target (a card) from bubbling to its column, which would repeat the move.
        e.stopPropagation();
        onDropRef.current(data);
      }
    };
    // Every target must clear its hover when the drag ends, but a card dropped on another card
    // stops propagation, and a cross-column drop unmounts the source so its `dragend` is lost.
    // A window listener in the capture phase runs before any target's handler, so it sees every
    // drop and drag-end regardless of stopPropagation or which node is unmounted.
    const reset = () => {
      depth = 0;
      setOver(false);
    };
    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("dragover", onOver);
    el.addEventListener("drop", onDropEvt);
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    return () => {
      el.removeEventListener("dragenter", onEnter);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("drop", onDropEvt);
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
    };
  }, [ref, mime]);

  return over;
}
