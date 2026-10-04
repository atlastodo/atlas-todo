import { useEffect, useState } from "react";

/**
 * Device connectivity on web: `navigator.onLine` plus the `online`/`offline` events. Defaults to
 * `true` when `navigator` is unavailable (jsdom, SSR). Native resolves `useOnline.ts` (expo-network).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
