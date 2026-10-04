import { useEffect, type RefObject } from "react";
import { Keyboard, Platform } from "react-native";

/** Dismisses after the first, as the opening screen's transition settles. */
const RETRY_MS = [50, 150];

/**
 * Put the soft keyboard away when a screen opens over a list: a quick-add or rename field behind it
 * would otherwise keep the keyboard up over the new screen. One dismiss on mount is not enough on a
 * phone, where the field behind can take focus back while the transition runs, so it is repeated
 * as the transition settles.
 *
 * On web `Keyboard.dismiss()` blurs whichever field has focus, and a click into the opened screen's
 * own fields can land inside that window, sending keystrokes to the page's list hotkeys. So it only
 * blurs a field outside `inside` (the opened screen's root), and without a root it leaves focus alone.
 */
export function useDismissKeyboardOnOpen(inside?: RefObject<unknown>): void {
  useEffect(() => {
    const dismiss = () => {
      if (Platform.OS === "web" && (!inside || focusIsWithin(inside.current))) return;
      Keyboard.dismiss();
    };
    dismiss();
    const timers = RETRY_MS.map((ms) => setTimeout(dismiss, ms));
    return () => timers.forEach(clearTimeout);
  }, [inside]);
}

/** Whether the focused DOM element sits inside `node` (a react-native-web `View`'s DOM node). */
function focusIsWithin(node: unknown): boolean {
  if (typeof document === "undefined") return false;
  const root = node as { contains?: (other: Node | null) => boolean } | null | undefined;
  return typeof root?.contains === "function" && root.contains(document.activeElement);
}
