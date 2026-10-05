import { colorScheme } from "nativewind";
import { SCHEME_STORAGE_KEY } from "./schemeCache";

/**
 * Apply the cached light/dark scheme to `<html>` before the app renders. Imported for its side
 * effect, first thing in `app/_layout`, so it runs before React and NativeWind's runtime.
 *
 * `global.css` already paints from `prefers-color-scheme`; this covers someone who chose Dark on a
 * light OS (or the reverse), whose preference no stylesheet can know.
 *
 * It also matters functionally: NativeWind seeds its initial colour scheme from whether `.dark` is
 * on `<html>` when its runtime is imported (`react-native-css-interop`'s `color-scheme.js`). Without
 * the class it starts as "light" and every `dark:` utility in the first render resolves wrong until
 * `SyncedTheme` runs.
 *
 * The cache is a hint; `SyncedTheme` applies the synced preference and overrides it if they differ.
 */
function applyCachedScheme(): void {
  try {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(SCHEME_STORAGE_KEY);
    } catch {
      // localStorage throws outright in some privacy modes; fall through to the OS preference.
    }
    const dark =
      saved === "dark" ||
      (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    // `.light` lets an explicit light choice beat the `prefers-color-scheme: dark` rule in
    // global.css. NativeWind only toggles `.dark`, so the two agree on the class it cares about.
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    root.style.colorScheme = dark ? "dark" : "light";
    // NativeWind's JS scheme (`useColorScheme`) was seeded when its runtime loaded, which can be
    // before this ran, so it may still say "light". Align it with the class, or anything coloured
    // from the JS value (inline styles before sign-in, where SyncedTheme isn't mounted yet)
    // disagrees with the `dark:` classes beside it.
    colorScheme.set(dark ? "dark" : "light");
  } catch {
    // A cosmetic boot step must never take the app down; the worst case is a flash.
  }
}

applyCachedScheme();
