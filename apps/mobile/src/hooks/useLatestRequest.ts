import { useCallback, useRef } from "react";

/**
 * Lets only the most recent of several overlapping loads write state. Call the returned `begin` at
 * the start of a load; the check it hands back is true only while no newer load has begun -- so a
 * slow response for an earlier filter or search keystroke can never overwrite a newer one.
 */
export function useLatestRequest(): () => () => boolean {
  const seq = useRef(0);
  return useCallback(() => {
    const mine = ++seq.current;
    return () => mine === seq.current;
  }, []);
}
