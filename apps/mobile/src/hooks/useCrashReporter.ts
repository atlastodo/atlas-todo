import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { APP_VERSION } from "../lib/appVersion";
import { randomUUID } from "expo-crypto";
import { useAuth } from "../auth/AuthContext";
import { configureReporter, flushQueue, setReporter } from "../lib/crashReporter";

/**
 * Binds the API client into the crash reporter and drains the offline queue.
 *
 * Mounted inside `AuthProvider` but above the session gate: the client exists whether or not anyone
 * is signed in, and `POST /reports` accepts an anonymous caller, so a report queued by a crash on
 * the login screen is delivered without a sign-in. Flushes on mount and on every return to the
 * foreground, when a phone is most likely to have regained connectivity.
 */
export function useCrashReporter(): void {
  const { api, session } = useAuth();

  useEffect(() => {
    configureReporter({
      // Hermes has no global `crypto`, and a non-UUID id would be rejected by the server.
      newId: randomUUID,
      appVersion: APP_VERSION,
      platform: Platform.OS,
      osVersion: typeof Platform.Version === "string" ? Platform.Version : String(Platform.Version),
    });
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    setReporter({ api, deviceId: session?.deviceId, userId });
    void flushQueue();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void flushQueue();
    });
    return () => sub.remove();
  }, [api, session?.deviceId, userId]);
}
