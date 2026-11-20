import { useState } from "react";

/**
 * `value` while `visible`, and the last value it had while visible once it is not. A fading Modal
 * keeps rendering through its exit animation (react-native-web's `ModalAnimation` does), so content
 * read from state its caller clears on close would otherwise change while the dialog fades out: a
 * "New group" sheet turning into "New habit", a filtered list snapping back to every row.
 *
 * Pass a value that is stable within a render (a prop, a string): a fresh object each render never
 * matches what is held.
 */
export function useHeldWhileClosing<T>(visible: boolean, value: T): T {
  const [held, setHeld] = useState(value);
  // Adjusting state during render (React's "storing information from previous renders").
  if (visible && held !== value) setHeld(value);
  return visible ? value : held;
}
