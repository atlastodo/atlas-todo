import { useEffect } from "react";
import type { ViewProps } from "react-native";
import { useSelectionOptional } from "../data/SelectionProvider";

export type OutsidePressProps = Pick<ViewProps, "onStartShouldSetResponder" | "onResponderRelease">;

/**
 * Where a click keeps select mode: a task row (`data-atlas-row`, set in select mode), anything
 * marked `data-selection-keep` (the selection toolbar, board cards), and any open Modal (the
 * context menu, pickers and sheets the bulk actions open).
 */
const KEEP_SELECTOR = "[data-atlas-row], [data-selection-keep], [aria-modal]";

/** A press on an element's own scrollbar, not its content. */
function onScrollbar(e: PointerEvent, el: Element): boolean {
  const html = el as HTMLElement;
  return e.offsetX > html.clientWidth || e.offsetY > html.clientHeight;
}

/**
 * Web: leave select mode on a pointer press anywhere outside the tasks (empty list space, headers,
 * the sidebar, the page background), even with tasks selected. Listens on the document in the
 * capture phase, so a press is seen before any handler stops it. Returns no props.
 */
export function useOutsidePressExit(): OutsidePressProps {
  const sel = useSelectionOptional();
  const mode = sel?.mode ?? false;
  const clear = sel?.clear;
  useEffect(() => {
    if (!mode || !clear || typeof document === "undefined") return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || target.closest(KEEP_SELECTOR)) return;
      if (onScrollbar(e, target)) return;
      clear();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [mode, clear]);
  return {};
}
