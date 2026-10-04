import { useEffect } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemeScope } from "../theme/ThemeProvider";
import { haptics } from "../lib/haptics";

export interface RecurringEditModalProps {
  visible: boolean;
  onThisTask: () => void;
  onAllTasks: () => void;
  onCancel: () => void;
}

/**
 * A modal dialog prompting whether an edit to a recurring task applies to just this current
 * instance or all future occurrences.
 */
export function RecurringEditModal({
  visible,
  onThisTask,
  onAllTasks,
  onCancel,
}: RecurringEditModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (visible) haptics.selection();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <ThemeScope className="absolute inset-0 items-center justify-center p-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onCancel}
          className="absolute inset-0 bg-black/40"
        />
        <View className="w-full max-w-sm gap-3 rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
          <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {t("recurrence.editRecurringTitle")}
          </Text>
          <Text className="text-sm text-neutral-600 dark:text-neutral-300">
            {t("recurrence.editRecurringPrompt")}
          </Text>
          <View className="mt-2 flex-col gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("recurrence.thisTaskOnly")}
              onPress={onThisTask}
              className="w-full rounded-lg bg-accent-600 py-2.5 items-center web:cursor-pointer"
            >
              <Text className="text-sm font-semibold text-white">
                {t("recurrence.thisTaskOnly")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("recurrence.allTasks")}
              onPress={onAllTasks}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2.5 items-center web:cursor-pointer"
            >
              <Text className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {t("recurrence.allTasks")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              onPress={onCancel}
              className="w-full rounded-lg py-2 items-center web:cursor-pointer"
            >
              <Text className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ThemeScope>
    </Modal>
  );
}
