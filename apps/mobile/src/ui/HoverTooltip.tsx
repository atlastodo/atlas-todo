import { useCallback, useEffect, useState } from "react";
import { HoverTooltipOverlay } from "./HoverTooltipOverlay";

/**
 * A hover tooltip for icon-only controls, used by the collapsed sidebar rail (nav rows, logo,
 * collapse toggle).
 *
 * It cannot be an inline absolute view: the rail is a vertical `ScrollView` (react-native-web pins
 * `overflowX: hidden`), and a `position: fixed` label inside the drawer is re-contained by its
 * animated wrapper and vanishes once the drawer settles. So the label renders through
 * {@link HoverTooltipOverlay}, which on web portals to `document.body`. A `Modal` was rejected: its
 * web focus trap steals focus from whatever the user is editing.
 *
 * `onHoverIn`/`onHoverOut` never fire on touch. On web the event is the raw `pointerenter`, whose
 * `currentTarget` is the hovered DOM node; jest uses a stub of the same shape.
 */

const GAP = 12;

type HoverTarget = { getBoundingClientRect?: () => { right: number; top: number; height: number } };

export function useHoverTooltip(label: string) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onHoverIn = useCallback((event?: { currentTarget?: unknown }) => {
    const el = event?.currentTarget as HoverTarget | null | undefined;
    const rect =
      typeof el?.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
    if (rect) setPos({ x: rect.right + GAP, y: rect.top + rect.height / 2 });
  }, []);

  const onHoverOut = useCallback(() => setPos(null), []);

  // Any scroll or resize moves the anchor out from under the label; drop it, as platform tooltips do.
  useEffect(() => {
    if (!pos || typeof window === "undefined" || typeof window.addEventListener !== "function")
      return;
    const hide = () => setPos(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return {
    onHoverIn,
    onHoverOut,
    tooltip: pos ? <HoverTooltipOverlay label={label} pos={pos} /> : null,
  };
}
