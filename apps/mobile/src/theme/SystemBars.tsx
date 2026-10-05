import { useEffect } from "react";
import { Platform, type ColorSchemeName } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { isDark, sceneBackground } from "./navTheme";

/**
 * Points the OS chrome at the applied scheme (the one `SyncedTheme` set, not the device's), so a
 * forced Light on a dark phone, or the reverse, still gets readable bars. "auto" styles would track
 * the OS instead of the app.
 *
 * Android draws edge to edge: the status and navigation bars are transparent and only their icon
 * colour is ours to pick. What shows through them is the root view, so its background follows the
 * scheme too; left alone it is the window's default, a white gesture strip under a dark app.
 */
export function SystemBars({ scheme }: { scheme: ColorSchemeName | undefined }) {
  const dark = isDark(scheme);
  const background = sceneBackground(scheme);

  useEffect(() => {
    // Web paints its own document background (`global.css`, `schemeCache.web`).
    if (Platform.OS === "web") return;
    SystemUI.setBackgroundColorAsync(background).catch(() => {
      // Cosmetic: a build without the native module must not take the app down.
    });
  }, [background]);

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <NavigationBar style={dark ? "light" : "dark"} />
    </>
  );
}
