import { useContext, useEffect, useState } from "react";
import type { ApiClient, InstancePolicy } from "@atlastodo/client-core";
import { AuthContext } from "../auth/AuthContext";
import { useStore } from "../data/StoreProvider";

/** One request per signed-in client, shared by every caller. */
const cache = new WeakMap<ApiClient, Promise<InstancePolicy | null>>();

/** The policy, or null when it is unknown (offline, an older server, or no server at all). */
function fetchPolicy(api: ApiClient): Promise<InstancePolicy | null> {
  let pending = cache.get(api);
  if (!pending) {
    // Through a promise chain, so a throw (a client without the call) lands in the catch too.
    pending = Promise.resolve()
      .then(() => api.instancePolicy())
      .catch(() => {
        cache.delete(api); // Try again on the next mount: offline is not an answer.
        return null;
      });
    cache.set(api, pending);
  }
  return pending;
}

/**
 * The server's instance policies the app enforces itself (`GET /instance/policy`): today the
 * activity retention an admin set. Null while unknown, in local-only mode, or against a server
 * that predates the endpoint, all of which impose nothing.
 */
export function useInstancePolicy(): InstancePolicy | null {
  const auth = useContext(AuthContext);
  const { localOnly } = useStore();
  const api = auth?.session && !localOnly ? auth.api : null;
  const [policy, setPolicy] = useState<InstancePolicy | null>(null);
  useEffect(() => {
    if (!api) {
      setPolicy(null);
      return;
    }
    let live = true;
    void fetchPolicy(api).then((p) => {
      if (live) setPolicy(p);
    });
    return () => {
      live = false;
    };
  }, [api]);
  return policy;
}

/**
 * The retention that applies, in days (0: none): the stricter of the user's own setting and the
 * server's limit.
 */
export function effectiveActivityRetention(userDays: number, serverDays: number): number {
  if (userDays <= 0) return Math.max(serverDays, 0);
  if (serverDays <= 0) return userDays;
  return Math.min(userDays, serverDays);
}
