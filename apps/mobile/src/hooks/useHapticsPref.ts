import { useEffect } from "react";
import { setHapticsEnabled } from "../lib/haptics";
import { usePreferences } from "./usePreferences";

/**
 * Keeps the `lib/haptics` module gate in step with the synced `haptics_enabled` preference.
 *
 * The gate is a module flag (not a per-call `usePreferences` read) so haptic call sites stay
 * one-liners in gesture handlers; this hook is its single writer. Mount it once inside
 * `StoreProvider`. On web `setHapticsEnabled` is `haptics.web.ts`'s no-op, so this is inert.
 */
export function useHapticsPref(): void {
  const { hapticsEnabled } = usePreferences();
  useEffect(() => {
    setHapticsEnabled(hapticsEnabled);
  }, [hapticsEnabled]);
}
