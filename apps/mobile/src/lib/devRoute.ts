import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Remembers the last route, in development only. Editing a module Fast Refresh cannot hot-swap
 * (anything outside a component, everything in `packages/shared`) triggers a full reload at `/`,
 * which redirects to the synced `default_view`, so in development the landing route returns you to
 * where you were. Production still honours `default_view` on launch.
 */
const KEY = "atlas.devLastRoute";

/** Cached so a reload reads storage once, and a later remember answers without a round trip. */
let cached: Promise<string | null> | null = null;

function loadLastRoute(): Promise<string | null> {
  if (!__DEV__) return Promise.resolve(null);
  cached ??= AsyncStorage.getItem(KEY).catch(() => null);
  return cached;
}

export function rememberRoute(path: string): void {
  // `/` is the landing route itself; remembering it would make the restore a no-op loop.
  if (!__DEV__ || !path || path === "/") return;
  cached = Promise.resolve(path);
  void AsyncStorage.setItem(KEY, path).catch(() => {});
}

/**
 * The route to restore: `undefined` while reading, then a path or null. In production it is `null`
 * from the first render, so the landing route redirects immediately.
 */
export function useRestoredRoute(): string | null | undefined {
  const [route, setRoute] = useState<string | null | undefined>(__DEV__ ? undefined : null);
  useEffect(() => {
    if (!__DEV__) return;
    let alive = true;
    void loadLastRoute().then((path) => {
      if (alive) setRoute(path);
    });
    return () => {
      alive = false;
    };
  }, []);
  return route;
}
