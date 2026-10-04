import { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CalendarClock, Inbox, Menu, Sun } from "./icons";
import { useBottomChrome } from "../data/BottomChromeContext";
import { haptics } from "../lib/haptics";

export interface MobileBottomNavProps {
  /** Active path (e.g. /today, /inbox, /upcoming) */
  activePath: string;
  /** Navigation callback */
  onNavigate: (href: string) => void;
  /** Callback to open the mobile menu modal */
  onOpenMenu: () => void;
  /** Whether the menu modal is currently open */
  isMenuOpen?: boolean;
  /** Accent color hex override */
  accentColor?: string;
}

/**
 * Bottom navigation bar on mobile phones with 4 destinations:
 * 1. Inbox (/inbox)
 * 2. Today (/today)
 * 3. Upcoming (/upcoming)
 * 4. Menu (opens the phone menu modal)
 */
export function MobileBottomNav({
  activePath,
  onNavigate,
  onOpenMenu,
  isMenuOpen = false,
  accentColor = "#4f46e5",
}: MobileBottomNavProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Publish the bar's real height so root-level overlays (the focus bar) can clear it; hand the
  // space back on unmount, or a rotation to a wide layout would leave them floating above nothing.
  const { setNavHeight } = useBottomChrome();
  useEffect(() => () => setNavHeight(0), [setNavHeight]);

  const isWeb = Platform.OS === "web";

  // Check which tab is active
  const isInbox = activePath === "/inbox" && !isMenuOpen;
  const isToday = (activePath === "/today" || activePath === "/") && !isMenuOpen;
  const isUpcoming = activePath === "/upcoming" && !isMenuOpen;
  const isMenu = isMenuOpen;

  const handleTabPress = (href: string) => {
    haptics.selection();
    onNavigate(href);
  };

  const handleMenuPress = () => {
    haptics.impact("light");
    onOpenMenu();
  };

  return (
    <View
      onLayout={(e) => setNavHeight(e.nativeEvent.layout.height)}
      style={
        isWeb
          ? ({
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 40,
            } as object)
          : undefined
      }
      className="border-t border-neutral-200 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 6) }}
        className="flex-row items-center justify-around pt-2.5"
      >
        {/* 1. Inbox */}
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: isInbox }}
          accessibilityLabel={t("nav.inbox", "Inbox")}
          onPress={() => handleTabPress("/inbox")}
          hitSlop={8}
          className="flex-1 items-center justify-center py-1.5 web:cursor-pointer"
        >
          <Inbox
            size={24}
            color={isInbox ? accentColor : undefined}
            className={isInbox ? undefined : "text-neutral-500 dark:text-neutral-400"}
          />
          <Text
            style={isInbox ? { color: accentColor } : undefined}
            className={
              "mt-1 text-xs font-medium " +
              (isInbox ? "font-semibold" : "text-neutral-500 dark:text-neutral-400")
            }
          >
            {t("nav.inbox", "Inbox")}
          </Text>
        </Pressable>

        {/* 2. Today */}
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: isToday }}
          accessibilityLabel={t("nav.today", "Today")}
          onPress={() => handleTabPress("/today")}
          hitSlop={8}
          className="flex-1 items-center justify-center py-1.5 web:cursor-pointer"
        >
          <Sun
            size={24}
            color={isToday ? accentColor : undefined}
            className={isToday ? undefined : "text-neutral-500 dark:text-neutral-400"}
          />
          <Text
            style={isToday ? { color: accentColor } : undefined}
            className={
              "mt-1 text-xs font-medium " +
              (isToday ? "font-semibold" : "text-neutral-500 dark:text-neutral-400")
            }
          >
            {t("nav.today", "Today")}
          </Text>
        </Pressable>

        {/* 3. Upcoming */}
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: isUpcoming }}
          accessibilityLabel={t("nav.upcoming", "Upcoming")}
          onPress={() => handleTabPress("/upcoming")}
          hitSlop={8}
          className="flex-1 items-center justify-center py-1.5 web:cursor-pointer"
        >
          <CalendarClock
            size={24}
            color={isUpcoming ? accentColor : undefined}
            className={isUpcoming ? undefined : "text-neutral-500 dark:text-neutral-400"}
          />
          <Text
            style={isUpcoming ? { color: accentColor } : undefined}
            className={
              "mt-1 text-xs font-medium " +
              (isUpcoming ? "font-semibold" : "text-neutral-500 dark:text-neutral-400")
            }
          >
            {t("nav.upcoming", "Upcoming")}
          </Text>
        </Pressable>

        {/* 4. Menu */}
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: isMenu }}
          accessibilityLabel={t("nav.menu", "Menu")}
          onPress={handleMenuPress}
          hitSlop={8}
          className="flex-1 items-center justify-center py-1.5 web:cursor-pointer"
        >
          <Menu
            size={24}
            color={isMenu ? accentColor : undefined}
            className={isMenu ? undefined : "text-neutral-500 dark:text-neutral-400"}
          />
          <Text
            style={isMenu ? { color: accentColor } : undefined}
            className={
              "mt-1 text-xs font-medium " +
              (isMenu ? "font-semibold" : "text-neutral-500 dark:text-neutral-400")
            }
          >
            {t("nav.menu", "Menu")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
