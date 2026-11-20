import { useEffect, useRef } from "react";
import { dispatchHotkey, type HotkeyHandlers } from "@atlastodo/todo-core";
import { isModalOpen } from "../lib/modalOpen";

/**
 * Keyboard shortcuts on web: one `window` `keydown` listener that routes each event through
 * `@atlastodo/todo-core`'s pure {@link dispatchHotkey}, which owns the binding table and its typing/modifier
 * guards. Native uses the no-op `useHotkeys.ts`.
 *
 * Handlers are read through a ref, so the listener subscribes once and callers can pass fresh
 * handlers each render.
 *
 * Nothing fires while a modal is open: the keys belong to the dialog on top, never the list
 * behind it, and Cmd-K would stack a second palette.
 */
export function useHotkeys(handlers: HotkeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function dispatch(e: KeyboardEvent, typing: boolean) {
      if (isModalOpen()) return;
      const handled = dispatchHotkey(
        { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, typing },
        ref.current,
      );
      if (handled) e.preventDefault();
    }
    // Two phases. react-native-web's TextInput stops every keydown from bubbling, so the bindings
    // that work while typing (Cmd/Ctrl-K) are heard in the capture phase, from a text field only;
    // everything else keeps the bubble phase, after the focused element has had its say.
    const onCapture = (e: KeyboardEvent) => {
      if (isTyping(e.target)) dispatch(e, true);
    };
    const onBubble = (e: KeyboardEvent) => {
      if (!isTyping(e.target)) dispatch(e, false);
    };
    window.addEventListener("keydown", onCapture, true);
    window.addEventListener("keydown", onBubble);
    return () => {
      window.removeEventListener("keydown", onCapture, true);
      window.removeEventListener("keydown", onBubble);
    };
  }, []);
}

/** Whether focus is in a text-entry element, where global single-key shortcuts must not fire. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}
