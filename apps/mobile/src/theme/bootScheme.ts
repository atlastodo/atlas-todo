import { Appearance } from "react-native";
import { colorScheme } from "nativewind";
import { getCachedScheme } from "./schemeCache";

/**
 * Apply the initial light/dark scheme before the app renders.
 *
 * Checks cached scheme first (persisted synchronously in the local SQLite kv store),
 * falling back to system Appearance. Seeding NativeWind here ensures the very first
 * frame paints with dark: styles active if the user or system is in dark mode,
 * avoiding any initial light flash on cold launch.
 */
const cached = getCachedScheme();
if (cached === "dark" || cached === "light") {
  colorScheme.set(cached);
} else {
  const initial = Appearance.getColorScheme();
  if (initial === "dark" || initial === "light") {
    colorScheme.set(initial);
  }
}
