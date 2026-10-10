import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemeScope } from "../theme/ThemeProvider";
import { haptics } from "../lib/haptics";
import { registerExplainerHost, type ExplainerRequest } from "../lib/permissionExplainer";
import { Bell, Database } from "./icons";
import { ELEVATED_SURFACE_CLASS, SCRIM_CLASS } from "./useSheetDismiss";

/**
 * Shows the explainer `lib/permissionExplainer` asks for: why Atlas wants the permission, then the
 * real browser/OS prompt from "Allow". A refusal turns the dialog into guidance on how to change
 * it later. Requests that arrive while one is showing wait their turn. Mounted once, at the root.
 */
export function PermissionExplainerHost() {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<ExplainerRequest[]>([]);
  const [phase, setPhase] = useState<"explain" | "asking" | "refused">("explain");
  const request = queue[0] ?? null;

  useEffect(() => registerExplainerHost((next) => setQueue((q) => [...q, next])), []);

  useEffect(() => {
    if (request) haptics.selection();
  }, [request]);

  if (!request) return null;

  const finish = (result: "granted" | "refused" | "dismissed") => {
    request.settle(result);
    setPhase("explain");
    setQueue((q) => q.slice(1));
  };

  const allow = () => {
    setPhase("asking");
    // Called straight from the press, so a browser still sees the gesture it needs to prompt.
    void request
      .allow()
      .catch(() => false)
      .then((granted) => {
        if (granted) finish("granted");
        else setPhase("refused");
      });
  };

  const web = Platform.OS === "web";
  const k =
    request.kind === "storage" ? "storage" : web ? "notificationsWeb" : "notificationsNative";
  const Icon = request.kind === "storage" ? Database : Bell;
  const refused = phase === "refused";
  const dismiss = () => finish(refused ? "refused" : "dismissed");
  const title = t(
    refused ? `permissionExplainer.${k}.refusedTitle` : `permissionExplainer.${k}.title`,
  );
  const body = t(refused ? `permissionExplainer.${k}.refused` : `permissionExplainer.${k}.body`);
  const allowLabel = t(`permissionExplainer.${k}.allow`);
  const laterLabel = refused ? t("permissionExplainer.gotIt") : t("permissionExplainer.notNow");

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <ThemeScope className="absolute inset-0 items-center justify-center p-6">
        <View className={`absolute inset-0 ${SCRIM_CLASS}`} />
        <View
          accessibilityViewIsModal
          className={`w-full max-w-sm gap-3 rounded-2xl p-5 ${ELEVATED_SURFACE_CLASS}`}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-950/70">
            <Icon size={20} className="text-accent-700 dark:text-accent-300" />
          </View>
          <Text
            accessibilityRole="header"
            className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {title}
          </Text>
          <Text className="text-sm leading-5 text-neutral-600 dark:text-neutral-300">{body}</Text>
          <View className="mt-2 flex-row flex-wrap justify-end gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={laterLabel}
              onPress={dismiss}
              disabled={phase === "asking"}
              className="rounded-md px-4 py-2 web:cursor-pointer"
            >
              <Text className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                {laterLabel}
              </Text>
            </Pressable>
            {!refused && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={allowLabel}
                onPress={allow}
                disabled={phase === "asking"}
                className={
                  "rounded-md bg-accent-600 px-4 py-2 web:cursor-pointer " +
                  (phase === "asking" ? "opacity-50" : "")
                }
              >
                <Text className="text-sm font-semibold text-white">{allowLabel}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ThemeScope>
    </Modal>
  );
}
