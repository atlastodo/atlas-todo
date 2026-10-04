import { describe, it, expect } from "vitest";
import { rankBetween } from "./rank";

describe("rankBetween", () => {
  it("returns 0 for an empty list (both neighbours absent)", () => {
    expect(rankBetween(null, null)).toBe(0);
  });

  it("ranks before the first item", () => {
    expect(rankBetween(null, 5)).toBe(4);
  });

  it("ranks after the last item", () => {
    expect(rankBetween(5, null)).toBe(6);
  });

  it("returns the midpoint between two neighbours", () => {
    expect(rankBetween(2, 4)).toBe(3);
    expect(rankBetween(0, 1)).toBe(0.5);
  });

  it("always yields a value strictly between two distinct neighbours", () => {
    const before = 1.25;
    const after = 1.5;
    const mid = rankBetween(before, after);
    expect(mid).toBeGreaterThan(before);
    expect(mid).toBeLessThan(after);
  });
});
