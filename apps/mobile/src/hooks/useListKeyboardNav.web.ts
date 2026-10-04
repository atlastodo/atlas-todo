import { useEffect, useRef, useState } from "react";
import type { ListKeyboardNav } from "./useListKeyboardNav";

/**
 * Arrow/Enter/Escape navigation for a keyboard-driven list on the RN-web build: the desktop
 * counterpart of tapping a row. Owns the highlighted index, resets it to the top when the list opens
 * or its length changes, and binds a `window` `keydown` listener while `enabled`:
 *   ArrowDown / ArrowUp  move the highlight (clamped to the ends)
 *   Enter                run the highlighted row (`onEnter`)
 *   Escape               dismiss (`onEscape`)
 * Native uses the no-op `useListKeyboardNav.ts`. Returns the highlighted index so the caller can mark
 * that row selected and scroll it into view.
 */
export function useListKeyboardNav({ enabled, count, onEnter, onEscape }: ListKeyboardNav): number {
  const [index, setIndexState] = useState(0);
  // A synchronous mirror of the index so the keydown handler never reads a stale closure, plus latest
  // callbacks/count. The listener then subscribes once per open.
  const indexRef = useRef(0);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const countRef = useRef(count);
  countRef.current = count;

  function moveTo(next: number) {
    indexRef.current = next;
    setIndexState(next);
  }

  // Reset to the top whenever the list opens or its contents change (e.g. the query narrowed it).
  useEffect(() => {
    moveTo(0);
  }, [enabled, count]);

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveTo(Math.min(countRef.current - 1, indexRef.current + 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          moveTo(Math.max(0, indexRef.current - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (countRef.current > 0) onEnterRef.current(indexRef.current);
          break;
        case "Escape":
          e.preventDefault();
          onEscapeRef.current();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return index;
}
