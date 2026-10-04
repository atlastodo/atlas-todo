import { createPortal } from "react-dom";
import { HoverTooltipBox } from "./HoverTooltipBox";

/**
 * The web half of the rail hover tooltip: the label portals to `document.body`. Inside the drawer
 * a `position: fixed` label is re-contained by the animated (transformed) wrapper and painted over
 * once the drawer settles; a body-level element has no such ancestor.
 */
export function HoverTooltipOverlay(props: { label: string; pos: { x: number; y: number } }) {
  return createPortal(<HoverTooltipBox {...props} />, document.body);
}
