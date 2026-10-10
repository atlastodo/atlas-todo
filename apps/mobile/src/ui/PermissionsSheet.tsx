import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../data/OnboardingContext";
import { usePreferences } from "../hooks/usePreferences";
import { useExactAlarms, useNotifyPermission } from "../hooks/useReminders";
import { haptics } from "../lib/haptics";
import {
  permissionsSheetSeen,
  registerPermissionsSheet,
  rememberPermissionsSheetSeen,
} from "../lib/permissionsSheet";
import { BottomSheet } from "./BottomSheet";
import { AlarmClock, Bell, CircleCheckBig, ShieldCheck, type LucideIcon } from "./icons";

/**
 * The permissions drawer: everything this device must allow for reminders to arrive on time, each
 * with where it stands and the one action that fixes it, re-read live as the user grants them.
 *
 * Opens by itself once per device (native only: a browser has nothing beyond the notification
 * prompt, which the reminder explainer covers) as soon as onboarding is out of the way, whether the
 * wizard just finished or was skipped because an existing account signed in, and only while
 * something is missing. Settings → Notifications opens it on demand. Mounted once, at the root.
 */
export function PermissionsSheetHost() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { isOpen: onboardingOpen } = useOnboarding();
  const { onboardingCompleted, remindersEnabled } = usePreferences();
  const { permission, request } = useNotifyPermission();
  const { exactAlarms, openSettings: openExactAlarmSettings } = useExactAlarms();
  const autoChecked = useRef(false);
  const native = Platform.OS !== "web";

  useEffect(() => registerPermissionsSheet(() => setOpen(true)), []);

  const notificationsMissing = permission === "default" || permission === "denied";
  const exactMissing = exactAlarms === "denied";

  useEffect(() => {
    if (autoChecked.current || !native || permission === null) return;
    if (onboardingOpen || !onboardingCompleted || !remindersEnabled) return;
    autoChecked.current = true;
    if (!notificationsMissing && !exactMissing) return;
    void permissionsSheetSeen().then((seen) => {
      if (!seen) setOpen(true);
    });
  }, [
    native,
    permission,
    onboardingOpen,
    onboardingCompleted,
    remindersEnabled,
    notificationsMissing,
    exactMissing,
  ]);

  useEffect(() => {
    if (open) haptics.selection();
  }, [open]);

  const close = () => {
    rememberPermissionsSheetSeen();
    setOpen(false);
  };

  const allSet = !notificationsMissing && !exactMissing;
  const openAppSettings = () => void Linking.openSettings().catch(() => {});

  return (
    <BottomSheet
      visible={open}
      onClose={close}
      title={t("permissions.title")}
      icon={<ShieldCheck size={20} className="text-accent-600 dark:text-accent-400" />}
    >
      <View className="gap-3 pb-2">
        <Text className="text-sm leading-5 text-neutral-600 dark:text-neutral-300">
          {t("permissions.intro")}
        </Text>
        {permission !== null && permission !== "unsupported" && (
          <PermissionItem
            icon={Bell}
            title={t("permissions.notificationsTitle")}
            description={t(
              permission === "granted"
                ? "permissions.notificationsGranted"
                : permission === "default"
                  ? "permissions.notificationsDefault"
                  : native
                    ? "permissions.notificationsDeniedNative"
                    : "permissions.notificationsDeniedWeb",
            )}
            done={permission === "granted"}
            doneLabel={t("permissions.allowed")}
            action={
              permission === "default"
                ? { label: t("permissions.allow"), onPress: () => void request() }
                : permission === "denied" && native
                  ? { label: t("reminder.openSettings"), onPress: openAppSettings }
                  : undefined
            }
          />
        )}
        {exactAlarms !== "unsupported" && (
          <PermissionItem
            icon={AlarmClock}
            title={t("permissions.exactAlarmsTitle")}
            description={t(
              exactMissing ? "permissions.exactAlarmsDenied" : "permissions.exactAlarmsGranted",
            )}
            done={!exactMissing}
            doneLabel={t("permissions.on")}
            action={
              exactMissing
                ? {
                    label: t("reminder.openSettings"),
                    onPress: () => void openExactAlarmSettings(),
                  }
                : undefined
            }
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allSet ? t("common.done") : t("permissionExplainer.notNow")}
          onPress={close}
          className={
            "mt-1 items-center rounded-xl py-3 web:cursor-pointer " +
            (allSet ? "bg-accent-600" : "bg-neutral-100 dark:bg-neutral-800")
          }
        >
          <Text
            className={
              "text-sm font-semibold " +
              (allSet ? "text-white" : "text-neutral-700 dark:text-neutral-200")
            }
          >
            {allSet ? t("common.done") : t("permissionExplainer.notNow")}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function PermissionItem({
  icon: Icon,
  title,
  description,
  done,
  doneLabel,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  done: boolean;
  doneLabel: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-950/70">
        <Icon size={18} className="text-accent-700 dark:text-accent-300" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </Text>
        <Text className="text-xs leading-4 text-neutral-500 dark:text-neutral-400">
          {description}
        </Text>
        {done ? (
          <View className="mt-1 flex-row items-center gap-1">
            <CircleCheckBig size={14} className="text-emerald-600 dark:text-emerald-400" />
            <Text className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {doneLabel}
            </Text>
          </View>
        ) : action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            className="mt-1 self-start rounded-md bg-accent-600 px-3 py-1.5 web:cursor-pointer"
          >
            <Text className="text-xs font-semibold text-white">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
