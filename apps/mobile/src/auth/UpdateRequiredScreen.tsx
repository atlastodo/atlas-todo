import { Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw } from "../ui/icons";
import { useAuth } from "./AuthContext";
import { useSignOut } from "./useSignOut";

/**
 * Shown when the server refuses this build's sync protocol (HTTP 426): an older client would push
 * data the server can no longer accept, so the app stops syncing until it is updated. The outbox
 * stays on the device, so nothing typed meanwhile is lost.
 *
 * On web the fix is a reload (the server hands out the new bundle); a phone has to update the app,
 * so Retry only re-checks once the user has. Signing out stays possible meanwhile.
 */
export function UpdateRequiredScreen({
  isWeb = Platform.OS === "web",
  reload = () => void reloadBypassingCache(),
}: {
  isWeb?: boolean;
  reload?: () => void;
}) {
  const { t } = useTranslation();
  const { retryAfterUpgrade, session } = useAuth();
  // Sync is stopped here, so changes made before the refusal may still be waiting to push.
  const { signOut, dialog } = useSignOut();
  const Icon = isWeb ? RefreshCw : Download;

  return (
    <View className="flex-1 items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
      <View className="w-full max-w-sm gap-3 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center gap-2">
          <Icon size={22} className="text-accent-500" />
          <Text
            accessibilityRole="header"
            className="flex-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {isWeb ? t("update.webTitle") : t("update.nativeTitle")}
          </Text>
        </View>
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          {isWeb ? t("update.webBody") : t("update.nativeBody")}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={isWeb ? reload : retryAfterUpgrade}
          className="mt-1 items-center rounded-md bg-accent-600 px-3 py-3 active:bg-accent-500 web:cursor-pointer"
        >
          <Text className="text-sm font-medium text-white">
            {isWeb ? t("update.reload") : t("common.retry")}
          </Text>
        </Pressable>
        {session ? (
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            className="items-center py-1 web:cursor-pointer"
          >
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("common.signOut")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {dialog}
    </View>
  );
}

/**
 * Refetch the page past the HTTP cache before reloading. A plain reload can revalidate into a 304
 * and boot the cached old bundle again, which would land the user right back on this screen.
 */
export async function reloadBypassingCache(
  location: Pick<Location, "href" | "reload"> | undefined = globalThis.location,
  fetchPage: typeof fetch = globalThis.fetch,
): Promise<void> {
  if (!location) return;
  try {
    await fetchPage(location.href, { cache: "reload" });
  } catch {
    // Offline or blocked: the reload below is still the best we can do.
  }
  location.reload();
}
