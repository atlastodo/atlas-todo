import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * A wall-clock `now` (Unix ms) that re-renders on an interval, so time-derived UI (overdue,
 * relative timestamps) stays live. It also re-reads the clock when the app returns to the
 * foreground, since a phone suspends timers and a `setInterval` alone could leave a Today view
 * stuck on yesterday.
 *
 * The default tick is a minute: nothing here counts down, and waking the JS thread every second
 * costs battery for no visible gain. Countdowns can ask for a faster tick.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}
