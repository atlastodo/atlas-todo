import { useEffect, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Row } from "./Section";
import { RefreshCw } from "./icons";

/**
 * Settings → Data's web-only row reporting whether the browser promised not to evict the local
 * database (`navigator.storage.persist()`, asked once through `PersistentStorageExplainer`).
 *
 * Web storage is best-effort: eviction under pressure (Safari after seven days) destroys unsynced
 * changes, and the server only holds ciphertext. The row reports where that stands. "Ask again" re-runs it, disabled while in
 * flight (Firefox settles only after the user answers its prompt). Native, Electron and a private
 * mode with no IndexedDB render nothing.
 */

type Protection =
  | "checking" // hidden for that first beat
  | "protected" // the browser promised not to evict
  | "at-risk" // eviction could still destroy unsynced changes
  | "guidance"; // API missing (Safari): advice only

function storageManager(): StorageManager | null {
  const manager = (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage;
  return manager && typeof manager.persisted === "function" ? manager : null;
}

function isElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location?.protocol === "app:" ||
      Boolean(
        (window as unknown as { atlasDesktop?: { isElectron?: boolean } }).atlasDesktop?.isElectron,
      ))
  );
}

export function PersistentStorageRow() {
  const { t } = useTranslation();
  const [protection, setProtection] = useState<Protection>("checking");
  const [canAsk, setCanAsk] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof indexedDB === "undefined" || isElectron()) return;
    const manager = storageManager();
    if (!manager) {
      setProtection("guidance");
      return;
    }
    setCanAsk(typeof manager.persist === "function");
    let live = true;
    void manager
      .persisted()
      .then((persisted) => {
        if (live) setProtection(persisted ? "protected" : "at-risk");
      })
      .catch(() => {
        if (live) setProtection("guidance");
      });
    return () => {
      live = false;
    };
  }, []);

  const askAgain = () => {
    const manager = storageManager();
    if (!manager || asking || typeof manager.persist !== "function") return;
    setAsking(true);
    void manager
      .persist()
      .then((granted) => {
        setAsking(false);
        setProtection(granted ? "protected" : "at-risk");
      })
      .catch(() => setAsking(false));
  };

  if (protection === "checking") return null;

  if (protection === "protected") {
    return <Row label={t("settings.storage")} description={t("settings.storageProtectedDesc")} />;
  }

  return (
    <Row label={t("settings.storage")} description={t("settings.storageAtRiskDesc")}>
      {canAsk && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.storageAskAgain")}
          onPress={askAgain}
          disabled={asking}
          className={
            "flex-row items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 web:cursor-pointer dark:border-neutral-800 " +
            (asking ? "opacity-50" : "")
          }
        >
          <RefreshCw size={18} className="text-neutral-600 dark:text-neutral-300" />
          <Text className="text-sm text-neutral-600 dark:text-neutral-300">
            {t("settings.storageAskAgain")}
          </Text>
        </Pressable>
      )}
    </Row>
  );
}
