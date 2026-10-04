import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNotifyPermission } from "../hooks/useReminders";

/**
 * Says when reminders can't reach the user because notification permission is missing, with the
 * one action that can fix it: ask again, or on a phone where it was denied for good, open system
 * settings. Renders nothing once granted (or unknowable).
 */
export function NotifyPermissionHint() {
  const { t } = useTranslation();
  const { permission, request } = useNotifyPermission();
  if (permission !== "default" && permission !== "denied") return null;

  const isWeb = Platform.OS === "web";
  const settingsOnly = !isWeb && permission === "denied";
  const message = isWeb
    ? t(permission === "denied" ? "reminder.permissionDenied" : "reminder.permissionDefault")
    : t(settingsOnly ? "reminder.permissionDeniedNative" : "reminder.permissionDefaultNative");
  const action = settingsOnly ? t("reminder.openSettings") : t("reminder.enableNotifications");

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="flex-1 text-xs text-neutral-500 dark:text-neutral-400">{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action}
        onPress={() => {
          if (settingsOnly) void Linking.openSettings().catch(() => {});
          else void request();
        }}
        className="rounded border border-neutral-200 px-2.5 py-1.5 web:cursor-pointer dark:border-neutral-700"
      >
        <Text className="text-xs font-medium text-accent-700 dark:text-accent-300">{action}</Text>
      </Pressable>
    </View>
  );
}
