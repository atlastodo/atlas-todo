import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Smartphone } from "../ui/icons";
import { AppSkeleton } from "../ui/AppSkeleton";
import { SkeletonGate } from "../ui/Skeleton";
import {
  discardLocalData,
  moveLocalDataInto,
  readLocalData,
  withoutSettings,
  type LocalSnapshot,
} from "../data/localUpgrade";
import { useLocalMode, type AuthScreen } from "./localMode";

type Phase =
  | { kind: "checking" }
  | { kind: "ask"; snapshot: LocalSnapshot }
  | { kind: "confirmDiscard"; snapshot: LocalSnapshot }
  | { kind: "working" }
  | { kind: "done" };

/**
 * Moves local-only data into the account that just signed in, before the account's store mounts
 * (it must hydrate with the moved ops). A new account takes all of it, settings included. An
 * existing account is asked "merge or discard?" when there are items to lose, and never takes this
 * device's settings, so its own on other devices stay as they are. With only settings to lose, they
 * are dropped without asking.
 *
 * A failure leaves the local data in place and opens the account anyway: the next sign-in asks
 * again, and nothing is lost.
 */
export function LocalUpgradeGate({
  userId,
  accountLabel,
  children,
  intentOverride,
}: {
  userId: string;
  /** How the account is named in the question: its email. */
  accountLabel: string;
  children: ReactNode;
  /** For tests: the intent, in place of the one the sign-in form recorded. */
  intentOverride?: AuthScreen | null;
}) {
  const { t } = useTranslation();
  const local = useLocalMode();
  const intent = intentOverride !== undefined ? intentOverride : (local?.upgradeIntent ?? null);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  // Read once per account, then forgotten: a later sign-in (another tab's, say) is asked afresh.
  const intentRef = useRef(intent);
  const clearIntent = local?.clearUpgradeIntent;
  useEffect(() => {
    clearIntent?.();
  }, [clearIntent]);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setPhase({ kind: "done" });
    };
    setPhase({ kind: "checking" });
    void (async () => {
      const snapshot = await readLocalData();
      if (!snapshot) return finish();
      if (intentRef.current === "signup") {
        await moveLocalDataInto(userId, snapshot.ops);
        return finish();
      }
      if (snapshot.itemCount === 0) {
        await discardLocalData();
        return finish();
      }
      if (!cancelled) setPhase({ kind: "ask", snapshot });
    })().catch((err) => {
      console.warn("[atlas] could not move the local data into the account:", err);
      finish();
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const run = (work: () => Promise<void>) => {
    setPhase({ kind: "working" });
    void work()
      .catch((err) => console.warn("[atlas] could not move the local data into the account:", err))
      .finally(() => setPhase({ kind: "done" }));
  };

  if (phase.kind === "done") return <>{children}</>;
  if (phase.kind === "checking") {
    return (
      <SkeletonGate active>
        <AppSkeleton />
      </SkeletonGate>
    );
  }
  if (phase.kind === "working") {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <ActivityIndicator />
      </View>
    );
  }

  const { snapshot } = phase;
  return (
    <View className="flex-1 items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
      <View className="w-full gap-4 rounded-xl border border-neutral-200 bg-white p-6 sm:max-w-sm dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center gap-2">
          <Smartphone size={22} className="text-accent-600 dark:text-accent-400" />
          <Text className="flex-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t("localMode.mergeTitle")}
          </Text>
        </View>
        <Text className="text-sm text-neutral-600 dark:text-neutral-300">
          {t("localMode.mergeMessage", { count: snapshot.itemCount, account: accountLabel })}
        </Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("localMode.mergeSettingsNote")}
        </Text>
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("localMode.merge")}
            onPress={() => run(() => moveLocalDataInto(userId, withoutSettings(snapshot.ops)))}
            className="items-center rounded-md bg-accent-600 px-4 py-2.5 web:cursor-pointer"
          >
            <Text className="text-sm font-semibold text-white">{t("localMode.merge")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("localMode.discard")}
            onPress={() => setPhase({ kind: "confirmDiscard", snapshot })}
            className="items-center rounded-md border border-neutral-200 px-4 py-2.5 web:cursor-pointer dark:border-neutral-800"
          >
            <Text className="text-sm font-medium text-red-600 dark:text-red-400">
              {t("localMode.discard")}
            </Text>
          </Pressable>
        </View>
      </View>
      <ConfirmDialog
        visible={phase.kind === "confirmDiscard"}
        title={t("localMode.discardConfirmTitle")}
        message={t("localMode.discardConfirmMessage", { count: snapshot.itemCount })}
        confirmLabel={t("localMode.discard")}
        danger
        onConfirm={() => run(discardLocalData)}
        onCancel={() => setPhase({ kind: "ask", snapshot })}
      />
    </View>
  );
}
