import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useSidebar } from "../data/SidebarContext";
import { PanelLeftClose, PanelLeftOpen } from "./icons";
import { useHoverTooltip } from "./HoverTooltip";

/**
 * The wide-screen sidebar collapse/expand button for the header's right side; on a wide viewport
 * the phone drawer's hamburger is inert. `tintColor` is the header's tint.
 */
export function SidebarToggle({ tintColor }: { tintColor?: string }) {
  const { t } = useTranslation();
  const { collapsed, toggle } = useSidebar();
  // In the collapsed rail the toggle is icon-only, so web gets a hover tooltip; the expanded header already shows the brand.
  const tip = useHoverTooltip(collapsed ? t("nav.showSidebar") : t("nav.hideSidebar"));
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collapsed ? t("nav.showSidebar") : t("nav.hideSidebar")}
      onPress={toggle}
      onHoverIn={collapsed ? tip.onHoverIn : undefined}
      onHoverOut={collapsed ? tip.onHoverOut : undefined}
      hitSlop={8}
      className="p-1 web:cursor-pointer"
    >
      {/* In the sidebar (no header tint) fall back to a themed neutral; in a nav header match its tint. */}
      <Icon
        size={20}
        color={tintColor}
        className={tintColor ? undefined : "text-neutral-500 dark:text-neutral-400"}
      />
      {collapsed && tip.tooltip}
    </Pressable>
  );
}
