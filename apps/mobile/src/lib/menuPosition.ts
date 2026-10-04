/**
 * Position a cursor-anchored popup (a right-click context menu) so the viewport edges never clip
 * it. It clamps against the measured menu size: the menu opens downward from the cursor when it
 * fits, flips upward when the bottom would overflow, and pins to the top margin (the caller caps
 * and scrolls it) when taller than the viewport. Pure, so it is testable without mounting a menu.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  // A degenerate range (menu larger than the space) collapses to `min`, the safe margin.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * The top-left the menu should render at to stay fully on screen, given the cursor `point`, the
 * measured `menu` size, the `viewport` and a `margin` at the edges. A menu taller than the viewport
 * pins to the top margin; the caller should cap its height and let it scroll.
 */
export function clampMenuPosition(point: Point, menu: Size, viewport: Size, margin = 4): Point {
  const left = clamp(point.x, margin, viewport.width - menu.width - margin);

  // Prefer downward; if the bottom would overflow, flip upward (bottom edge at the cursor); if it
  // fits neither way, sit as low as it can. The final clamp keeps it off both edges.
  const fitsBelow = point.y + menu.height <= viewport.height - margin;
  const flippedUp = point.y - menu.height;
  const rawTop = fitsBelow
    ? point.y
    : flippedUp >= margin
      ? flippedUp
      : viewport.height - menu.height - margin;
  const top = clamp(rawTop, margin, viewport.height - menu.height - margin);

  return { x: left, y: top };
}
