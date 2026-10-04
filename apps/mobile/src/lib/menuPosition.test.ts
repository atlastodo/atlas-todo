import { clampMenuPosition } from "./menuPosition";

const VIEWPORT = { width: 400, height: 800 };
const MENU = { width: 224, height: 300 };

describe("clampMenuPosition", () => {
  it("flips upward when the menu would overflow the bottom", () => {
    // Cursor near the bottom: 700 + 300 = 1000 > 800, so it opens upward from the cursor instead.
    const pos = clampMenuPosition({ x: 50, y: 700 }, MENU, VIEWPORT);
    expect(pos.y).toBe(700 - 300); // 400 -- the menu's bottom edge lands at the cursor
    expect(pos.y + MENU.height).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("keeps the menu fully on screen at the extreme bottom-right corner", () => {
    const pos = clampMenuPosition({ x: 399, y: 799 }, MENU, VIEWPORT, 4);
    expect(pos.x + MENU.width).toBeLessThanOrEqual(VIEWPORT.width - 4);
    expect(pos.y + MENU.height).toBeLessThanOrEqual(VIEWPORT.height - 4);
    expect(pos.x).toBeGreaterThanOrEqual(4);
    expect(pos.y).toBeGreaterThanOrEqual(4);
  });

  it("clamps the left edge so a cursor near the right does not push the menu off-screen", () => {
    const pos = clampMenuPosition({ x: 390, y: 100 }, MENU, VIEWPORT, 4);
    expect(pos.x).toBe(VIEWPORT.width - MENU.width - 4); // 172
  });

  it("pins a menu taller than the viewport to the top margin (to be scrolled)", () => {
    const tall = { width: 224, height: 1000 };
    const pos = clampMenuPosition({ x: 50, y: 400 }, tall, VIEWPORT, 4);
    expect(pos.y).toBe(4);
  });
});
