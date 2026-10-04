import { useEffect, type ReactNode } from "react";
import { useColorScheme as useDeviceColorScheme } from "react-native";
import { useColorScheme } from "nativewind";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "expo-router";
import { usePreferences } from "../hooks/usePreferences";
import { cacheScheme } from "./schemeCache";
import { ThemeProvider } from "./ThemeProvider";
import { withAccent } from "./navTheme";

/**
 * Applies the user's synced `theme` and `accent` preferences to the tree. Mount it inside
 * `StoreProvider`, since it reads the store.
 *
 * The app root wraps everything in a `ThemeProvider` on the default accent (what the login screen
 * renders against); this nests a second one with the real accent, and the inner CSS variables win.
 * The navigator theme is re-provided the same way, since React Navigation takes hex props.
 *
 * `"system"` is resolved to a concrete scheme here before reaching NativeWind: on web,
 * `setColorScheme("system")` does not consult `prefers-color-scheme`, it just removes `.dark`
 * (`react-native-css-interop`), so "system" always rendered light. react-native's `useColorScheme`
 * (the media query on react-native-web) re-renders on change, so the class re-resolves live.
 *
 * `tailwind.config.js` sets `darkMode: "class"` so this call is allowed; under `"media"` NativeWind
 * throws when the scheme is set by hand.
 */
export function SyncedTheme({ children }: { children: ReactNode }) {
  const { theme, accent } = usePreferences();
  const { setColorScheme } = useColorScheme();
  const deviceScheme = useDeviceColorScheme();

  // RN's useColorScheme can report null/"unspecified"; NativeWind only gets "light" | "dark".
  const resolved = theme === "system" ? (deviceScheme === "dark" ? "dark" : "light") : theme;

  useEffect(() => {
    setColorScheme(resolved);
    // Cache it where the next boot can read it synchronously (`schemeCache.web`), so web paints
    // the right scheme before the store has hydrated.
    cacheScheme(resolved);
  }, [resolved, setColorScheme]);

  return (
    <NavigationThemeProvider
      value={withAccent(
        resolved === "dark" ? DarkTheme : DefaultTheme,
        resolved === "dark",
        accent,
      )}
    >
      <ThemeProvider accent={accent}>{children}</ThemeProvider>
    </NavigationThemeProvider>
  );
}
