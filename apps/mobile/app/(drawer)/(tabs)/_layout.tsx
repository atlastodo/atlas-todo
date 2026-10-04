import { Platform, Pressable } from "react-native";
import { useColorScheme } from "nativewind";
import { Tabs, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { NAV, PRIMARY_TABS } from "../../../src/nav/navModel";
import { useIsWide } from "../../../src/hooks/useIsWide";
import { useCommandPalette } from "../../../src/data/CommandPaletteContext";
import { headerThemeOptions, isDark } from "../../../src/theme/navTheme";
import { Menu, Search } from "../../../src/ui/icons";

export const unstable_settings = {
  initialRouteName: "today",
};

/**
 * The primary smart lists as a `Tabs` group whose tab bar is hidden; the drawer in the root layout
 * carries the rest. The header carries a hamburger (`headerLeft`) to open the drawer at any width,
 * since this group suppresses the drawer's own header. A wide viewport shows the permanent sidebar.
 *
 * The header also carries the command palette trigger, since a phone has no Cmd-K. It opens the
 * root layout's palette, the same one Cmd/Ctrl-K opens.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const isWide = useIsWide();
  const isWeb = Platform.OS === "web";
  const navigation = useNavigation();
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
        headerLeft:
          isWeb && !isWide
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("nav.openMenu", "Open menu")}
                  onPress={() => navigation.dispatch({ type: "TOGGLE_DRAWER" })}
                  hitSlop={8}
                  className="pl-3 pr-1 web:cursor-pointer"
                >
                  <Menu size={22} className="text-neutral-600 dark:text-neutral-300" />
                </Pressable>
              )
            : () => null,
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
