/**
 * Whether a React Native `Modal` is open on web (react-native-web marks each with
 * `aria-modal="true"`). Window-level key handlers use it to leave keys to the dialog on top: a
 * shortcut must not act on the list behind a menu, and Escape closes the dialog. Always false off
 * web (no DOM).
 */
export function isModalOpen(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.querySelector === "function" &&
    document.querySelector('[aria-modal="true"]') !== null
  );
}
