import { Pressable } from "react-native";
import { useColorScheme } from "nativewind";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { NAV, PRIMARY_TABS } from "../../../src/nav/navModel";
import { useCommandPalette } from "../../../src/data/CommandPaletteContext";
import { headerThemeOptions, isDark } from "../../../src/theme/navTheme";
import { Search } from "../../../src/ui/icons";

export const unstable_settings = {
  initialRouteName: "today",
};

/**
 * The primary smart lists as a `Tabs` group whose tab bar is hidden: a phone (native or web) reaches
 * them through the shell's `MobileBottomNav`, a wide viewport through the permanent sidebar, so the
 * header has no hamburger.
 *
 * The header also carries the command palette trigger, since a phone has no Cmd-K. It opens the
 * root layout's palette, the same one Cmd/Ctrl-K opens.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colorScheme: scheme } = useColorScheme();
  const { openPalette } = useCommandPalette();
  const tabs = PRIMARY_TABS.map((view) => NAV.find((item) => item.view === view)).filter(
    (item) => item !== undefined,
  );

  return (
    <Tabs
      // As the drawer: Back returns to the previous list, not the first tab (see `(drawer)/_layout.tsx`).
      backBehavior="fullHistory"
      screenOptions={{
        // The drawer/sidebar is the sole navigation.
        tabBarStyle: { display: "none" },
        sceneStyle: { backgroundColor: isDark(scheme) ? "#09090b" : "#ffffff" },
        ...headerThemeOptions(scheme),
        headerTitleAlign: "left",
        headerLeft: () => null,
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("palette.title")}
            onPress={openPalette}
            hitSlop={8}
            className="px-4"
          >
            <Search size={20} className="text-neutral-500" />
          </Pressable>
        ),
      }}
    >
      {tabs.map((item) => (
        <Tabs.Screen
          key={item.view}
          name={item.view}
          options={{ title: t(item.labelKey, item.label) }}
        />
      ))}
    </Tabs>
  );
}
