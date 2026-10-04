import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRequest } from "./useLatestRequest";

/**
 * The load/loading/failed skeleton the admin panel hooks share. `fetch` must be stable (wrap it in
 * `useCallback`); a new identity reloads. A failed load resets the data to `initial`.
 */
export function useAdminResource<T>(fetch: () => Promise<T>, initial: T) {
  const beginRequest = useLatestRequest();
  const initialRef = useRef(initial);
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const isLatest = beginRequest();
    setLoading(true);
    setFailed(false);
    try {
      const next = await fetch();
      if (isLatest()) setData(next);
    } catch {
      if (isLatest()) {
        setFailed(true);
        setData(initialRef.current);
      }
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [fetch, beginRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, loading, failed, load };
}
