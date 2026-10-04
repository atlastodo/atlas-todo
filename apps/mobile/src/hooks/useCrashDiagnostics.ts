import { useEffect } from "react";
import { useStore } from "../data/StoreProvider";
import { useOnline } from "./useOnline";
import { setDiagnosticsSnapshot } from "../lib/crashReporter";

/**
 * Publishes the live sync diagnostics into the crash-reporter module. The root `ErrorBoundary`
 * renders above `StoreProvider`, so when it fires `useStore()` would throw; the diagnostics are
 * copied out continuously and the crash handler reads the last snapshot. Mounted as a null-render
 * component inside `StoreProvider`.
 */
export function useCrashDiagnostics(): void {
  const { status, diagnostics } = useStore();
  const online = useOnline();
  const { lastError, lastSyncAt, quarantined, pending } = diagnostics;

  useEffect(() => {
    setDiagnosticsSnapshot({
      syncStatus: status,
      lastSyncAt,
      pending,
      quarantined: quarantined.length,
      lastErrorKind: lastError?.kind ?? null,
      lastErrorStatus: lastError?.status ?? null,
      lastErrorMessage: lastError?.message ?? null,
      online,
    });
  }, [status, lastSyncAt, pending, quarantined, lastError, online]);
}
