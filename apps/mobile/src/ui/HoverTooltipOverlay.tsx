import { HoverTooltipBox } from "./HoverTooltipBox";

/**
 * The native/default half of the rail hover tooltip, also what jest renders: the label box inline.
 * Never shown on a device (no hover on touch); it gives the web half an API to mirror and lets jest
 * assert placement. See `HoverTooltipOverlay.web.tsx`.
 */
export function HoverTooltipOverlay(props: { label: string; pos: { x: number; y: number } }) {
  return <HoverTooltipBox {...props} />;
}
