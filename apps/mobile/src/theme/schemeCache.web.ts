/**
 * Record the scheme the app just applied so the next boot can paint it immediately. The theme
 * preference is synced, so it is readable only after the store hydrates from IndexedDB; until then
 * a hard refresh would flash white before going dark.
 *
 * Two things are recorded:
 *
 * - `localStorage`, which `bootScheme.web` reads synchronously on the next boot.
 * - A `light`/`dark` class on `<html>`, which `global.css` keys off. NativeWind toggles only
 *   `dark`, so a switch to Light would leave neither class and the `prefers-color-scheme: dark`
 *   rule would take over, putting a light app on a dark document.
 *
 * It is a cache, never the truth: the synced preference corrects it if they disagree.
 */

export type CachedScheme = "light" | "dark";

/** The key `bootScheme.web` reads on the next boot. */
export const SCHEME_STORAGE_KEY = "atlas.colorScheme";

/** Persist and mark the applied scheme. Best-effort: a full quota must not throw. */
export function cacheScheme(scheme: CachedScheme): void {
  try {
    const root = document.documentElement;
    root.classList.toggle("dark", scheme === "dark");
    root.classList.toggle("light", scheme === "light");
    root.style.colorScheme = scheme;
  } catch {
    // Cosmetic only; the app renders correctly either way.
  }
  try {
    window.localStorage.setItem(SCHEME_STORAGE_KEY, scheme);
  } catch {
    // A boot that cannot read this back falls back to the OS preference.
  }
}

/** Read the cached scheme from localStorage synchronously. */
export function getCachedScheme(): CachedScheme | null {
  try {
    const saved = window.localStorage.getItem(SCHEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      return saved;
    }
  } catch {
    // Storage unavailable: no cached scheme.
  }
  return null;
}
