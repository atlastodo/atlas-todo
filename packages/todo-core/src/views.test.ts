import { describe, it, expect } from "vitest";
import { isSmartView } from "./views";

describe("isSmartView", () => {
  it("rejects a view that is not a smart list", () => {
    // "settings" and "board" are real views, but not ones default_view may point at.
    expect(isSmartView("settings")).toBe(false);
    expect(isSmartView("board")).toBe(false);
  });

  it("rejects non-strings from a synced preference", () => {
    // default_view arrives over sync from another client, so it can be anything at all.
    expect(isSmartView(undefined)).toBe(false);
    expect(isSmartView(null)).toBe(false);
    expect(isSmartView(3)).toBe(false);
    expect(isSmartView({ kind: "today" })).toBe(false);
  });
});
