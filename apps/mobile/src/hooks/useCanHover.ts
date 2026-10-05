import { useEffect, useState } from "react";
import { Platform } from "react-native";

const QUERY = "(hover: hover) and (pointer: fine)";

function matches(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/**
 * True when the primary pointer can hover (a mouse or trackpad), so hover-only affordances such as
 * a task row's info/reschedule actions and drag grip are reachable. False on native and on touch
 * browsers, where a tap leaves the hover state stuck and the hidden controls would only take room.
 * Follows the media query, so attaching a mouse to a tablet switches it on.
 */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(matches);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setCanHover(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return canHover;
}
