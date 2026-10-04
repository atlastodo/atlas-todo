import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useStore } from "../data/StoreProvider";
import { useOnline } from "../hooks/useOnline";
import { effectiveSyncStatus } from "../lib/syncStatus";
import { SyncDetails } from "./SyncDetails";
import { SpinningSyncIcon } from "./SpinningSyncIcon";

/**
 * A compact sync-status indicator for the sidebar. Reads the live `status` from the store and device
 * connectivity from {@link useOnline}: `syncing` shows a custom spinning icon, `offline` a red dot,
 * `unreachable` an amber dot ("Server unreachable"), `error` an amber dot ("Sync error"), `live-ws`
 * a green dot ("Live" — realtime delivery over the server's WebSocket), and `idle` a quiet green
 * dot ("Synced"). The offline/unreachable/error split comes from the pure `effectiveSyncStatus`.
 */
export function SyncStatusBadge() {
  const { t } = useTranslation();
  const { status, diagnostics } = useStore();
  const online = useOnline();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const effective = effectiveSyncStatus(status, online, diagnostics.lastError?.kind);
  const isSyncing = effective === "syncing";
  const amber = effective === "unreachable" || effective === "error" || effective === "throttled";
  const dot = effective === "offline" ? "bg-red-500" : amber ? "bg-amber-500" : "bg-green-500";
  const label =
    effective === "offline"
      ? t("sync.offline")
      : effective === "unreachable"
        ? t("sync.serverUnreachable")
        : effective === "error"
          ? t("sync.error")
          : effective === "throttled"
            ? t("sync.throttled")
            : effective === "live-ws"
              ? t("sync.live")
              : t("sync.synced");

  return (
    <>
      {/* Tap to open the details panel (status, last sync, pending, last error, quarantined ops). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} - ${t("sync.detailsTitle")}`}
        onPress={() => setDetailsOpen(true)}
        {...(Platform.OS === "web" ? ({ title: label } as object) : {})}
        className="flex-row items-center gap-1.5 web:cursor-pointer shrink min-w-0 max-w-[120px]"
      >
        {isSyncing ? (
          <>
            <SpinningSyncIcon />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-xs text-neutral-400 shrink min-w-0"
            >
              {t("sync.syncing")}
            </Text>
          </>
        ) : (
          <>
            <View className={"h-2 w-2 rounded-full shrink-0 " + dot} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-xs text-neutral-400 shrink min-w-0"
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
      {/* Mounted only when open, so its hooks (formatters, store reads) don't run behind the badge. */}
      {detailsOpen && <SyncDetails open onClose={() => setDetailsOpen(false)} />}
    </>
  );
}
