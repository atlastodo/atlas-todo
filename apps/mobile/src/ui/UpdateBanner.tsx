import { Linking, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, X } from "./icons";
import { useDesktopUpdates } from "../hooks/useDesktopUpdates";

export function UpdateBanner() {
  const { t } = useTranslation();
  const { state, isDesktop, dismissed, dismiss, downloadUpdate, installUpdate } =
    useDesktopUpdates();

  if (!isDesktop || !state || state.disabled || dismissed) {
    return null;
  }

  // Only show banner when an actionable update state is present
  if (
    state.status !== "available" &&
    state.status !== "downloading" &&
    state.status !== "downloaded"
  ) {
    return null;
  }

  const openReleaseNotes = () => {
    if (state.releaseUrl) {
      void Linking.openURL(state.releaseUrl);
    }
  };

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={t("desktopUpdate.title")}
      className="z-50 w-full border-b border-accent-200 bg-accent-50 px-4 py-2.5 backdrop-blur-sm dark:border-accent-900 dark:bg-accent-950"
    >
      <View className="mx-auto flex-row items-center justify-between gap-3 web:max-w-5xl">
        <View className="flex-1 flex-row items-center gap-2.5">
          {state.status === "downloading" ? (
            <RefreshCw size={18} className="animate-spin text-accent-600 dark:text-accent-400" />
          ) : (
            <Download size={18} className="text-accent-600 dark:text-accent-400" />
          )}

          <View className="flex-1 flex-row flex-wrap items-center gap-x-2">
            <Text className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {state.status === "downloading"
                ? t("desktopUpdate.downloading", { percent: state.downloadProgress })
                : state.status === "downloaded"
                  ? t("desktopUpdate.readyToInstall", { version: state.availableVersion })
                  : t("desktopUpdate.available", { version: state.availableVersion })}
            </Text>

            {state.status === "available" && state.releaseUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("desktopUpdate.whatsNew")}
                onPress={openReleaseNotes}
                className="web:cursor-pointer"
              >
                <Text className="text-xs text-accent-600 underline dark:text-accent-400">
                  {t("desktopUpdate.whatsNew")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          {state.status === "available" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("desktopUpdate.download")}
              onPress={state.canSelfUpdate ? () => void downloadUpdate() : openReleaseNotes}
              className="rounded-md bg-accent-600 px-3 py-1 active:bg-accent-700 web:cursor-pointer"
            >
              <Text className="text-xs font-medium text-white">{t("desktopUpdate.download")}</Text>
            </Pressable>
          )}

          {state.status === "downloaded" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("desktopUpdate.restart")}
              onPress={installUpdate}
              className="rounded-md bg-accent-600 px-3 py-1 active:bg-accent-700 web:cursor-pointer"
            >
              <Text className="text-xs font-medium text-white">{t("desktopUpdate.restart")}</Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("desktopUpdate.dismiss")}
            onPress={dismiss}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50 web:cursor-pointer"
          >
            <X size={16} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
