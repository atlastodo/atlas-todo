import { useEffect } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { HOTKEY_BINDINGS, HOTKEY_GROUPS, type HotkeyGroup } from "@atlas/shared";
import { ThemeScope } from "../theme/ThemeProvider";
import { X } from "./icons";

/**
 * The keyboard-shortcuts help, rendered from `@atlas/shared`'s `HOTKEY_BINDINGS` (the table
 * `dispatchHotkey` fires). `ShortcutsModal` is the `?` overlay (web/desktop), `ShortcutsTable` the
 * bare cards About embeds.
 */

const GROUP_LABEL_KEYS: Record<HotkeyGroup, string> = {
  global: "about.sectionGlobal",
  navigation: "about.sectionNavigation",
  taskActions: "about.sectionTaskActions",
  selection: "about.sectionSelection",
};

function cmdKey(): string {
  const isMac =
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.userAgent);
  return isMac ? "⌘" : "Ctrl";
}

function Keycap({ label }: { label: string }) {
  return (
    <View className="items-center justify-center rounded-md border border-neutral-300 bg-neutral-100 px-2 py-1 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <Text className="font-mono text-xs font-semibold text-neutral-800 dark:text-neutral-200">
        {label}
      </Text>
    </View>
  );
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-100 py-2.5 last:border-b-0 dark:border-neutral-800/60">
      <Text className="flex-1 pr-3 text-sm text-neutral-700 dark:text-neutral-300">
        {description}
      </Text>
      <View className="flex-row items-center gap-1">
        {keys.map((k, idx) => (
          <Keycap key={idx} label={k} />
        ))}
      </View>
    </View>
  );
}

export function ShortcutsTable() {
  const { t } = useTranslation();
  const modKey = cmdKey();
  return (
    <View className="gap-5">
      {HOTKEY_GROUPS.map((group) => (
        <View
          key={group}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-accent-600 dark:text-accent-400">
            {t(GROUP_LABEL_KEYS[group])}
          </Text>
          {HOTKEY_BINDINGS.filter((binding) => binding.group === group).map((binding) => (
            <ShortcutRow
              key={binding.action}
              keys={binding.displayKeys.map((k) => (k === "Mod" ? modKey : k))}
              description={t(binding.descriptionKey)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** The `?` shortcuts modal: the table over a backdrop, closed by Escape, the close button or a tap beside it. */
export function ShortcutsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  // Web: Escape closes, on a capture-phase listener so it wins over handlers mounted earlier (the
  // global hotkey layer reports Escape unhandled so a dialog can take it). Native uses `onRequestClose`.
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible, onClose]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <ThemeScope className="flex-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          className="flex-1 bg-black/30"
        />
        <View className="absolute inset-x-3 top-24 flex max-h-[75%] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
            <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {t("about.shortcutsTitle")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              onPress={onClose}
              className="rounded-md p-1 active:opacity-70 web:cursor-pointer"
            >
              <X size={18} className="text-neutral-500" />
            </Pressable>
          </View>
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 py-4"
            keyboardShouldPersistTaps="handled"
          >
            <ShortcutsTable />
          </ScrollView>
        </View>
      </ThemeScope>
    </Modal>
  );
}
