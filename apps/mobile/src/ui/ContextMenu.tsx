import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "./icons";
import type { MenuPos } from "../hooks/useContextMenu";
import { clampMenuPosition, type Size } from "../lib/menuPosition";
import { useBackdropSwitch } from "../hooks/useBackdropSwitch";

/**
 * A generic right-click context menu at the cursor over a full-screen backdrop (Escape closes too).
 * Opened only by a `contextmenu` event, so effectively desktop-web UI. Drives the data-driven
 * sidebar menus; `TaskContextMenu` is separate.
 *
 * The overlay is a `Modal`: a transformed ancestor turns an inline `position: fixed` into a
 * relative box, so an outside press beside the sidebar missed. A Modal portals to the document root.
 */

export interface ContextMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  pos: MenuPos;
  onClose: () => void;
}

export function ContextMenu({ items, pos, onClose }: ContextMenuProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();

  // Guarded on a real DOM `window`: jest/native may expose a partial one without `addEventListener`.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Positioned against the measured menu size: placed invisibly at the cursor until the first `onLayout`, then revealed clamped.
  const [size, setSize] = useState<Size | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const placed = size ? clampMenuPosition(pos, size, { width, height }) : pos;
  // On web a right-click on the backdrop routes to the element beneath, so another row's menu opens instead of the browser's.
  const backdropRef = useBackdropSwitch(onClose);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        ref={backdropRef}
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        accessibilityLabel={t("context.actions")}
        onLayout={onLayout}
        style={{
          position: "absolute",
          left: placed.x,
          top: placed.y,
          maxHeight: height - 8,
          opacity: size ? 1 : 0,
        }}
        className="w-56 overflow-hidden rounded-md border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            return (
              <View key={item.key}>
                {item.separatorBefore && (
                  <View className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                )}
                <MenuItem
                  icon={item.icon}
                  label={item.label}
                  danger={item.danger}
                  onPress={item.onPress}
                  onClose={onClose}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** One menu row: runs `onPress`, then closes the menu. Shared with `TaskContextMenu`. */
export function MenuItem({
  icon: Icon,
  label,
  danger,
  onPress,
  onClose,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onPress: () => void;
  onClose: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      onPress={() => {
        onPress();
        onClose();
      }}
      className="flex-row items-center gap-2 rounded px-2 py-1.5 web:cursor-pointer"
    >
      <Icon size={16} className={danger ? "text-red-500" : "text-neutral-400"} />
      <Text
        className={
          "text-sm " + (danger ? "text-red-500" : "text-neutral-700 dark:text-neutral-200")
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
