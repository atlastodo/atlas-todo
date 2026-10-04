import { useEffect, useState } from "react";
import * as Network from "expo-network";

/**
 * Device connectivity, via expo-network. Used to tell a genuine device-offline state apart from a
 * sync request that merely failed while the device is online (so the sync badge can show a muted
 * "sync error" instead of crying "offline"). The RN-web build resolves `useOnline.web.ts`
 * (`navigator.onLine`) instead.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const apply = (state: Network.NetworkState) => {
      // `isInternetReachable` is undefined until the first probe resolves; fall back to `isConnected`,
      // and to online if neither is known yet (so a slow probe never flashes a false "offline").
      const up = state.isInternetReachable ?? state.isConnected ?? true;
      if (active) setOnline(up);
    };
    void Network.getNetworkStateAsync()
      .then(apply)
      .catch(() => {});
    const sub = Network.addNetworkStateListener(apply);
    return () => {
      active = false;
      // Guard the shape: the real subscription has `.remove()`, but a stubbed/older one may not.
      sub?.remove?.();
    };
  }, []);

  return online;
}
