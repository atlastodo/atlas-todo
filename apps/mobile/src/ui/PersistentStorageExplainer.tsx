import { useEffect, useRef } from "react";
import { isOnlineWeb } from "../auth/serverUrl";
import { useOnboarding } from "../data/OnboardingContext";
import { usePreferences } from "../hooks/usePreferences";
import { explainStorage } from "../lib/permissionExplainer";

/**
 * In a browser, once the store is open and onboarding is out of the way, explain why Atlas wants
 * persistent storage before `navigator.storage.persist()` can prompt (`explainStorage`: only while
 * not yet persisted, and never again after "Not now"). Native and the desktop app render nothing:
 * their storage is not evicted, and Electron grants persist() silently (`persistence.web.ts`).
 */
export function PersistentStorageExplainer() {
  const { isOpen } = useOnboarding();
  const { onboardingCompleted } = usePreferences();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || isOpen || !onboardingCompleted) return;
    if (!isOnlineWeb() || typeof indexedDB === "undefined") return;
    asked.current = true;
    void explainStorage(
      (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage,
    );
  }, [isOpen, onboardingCompleted]);

  return null;
}
