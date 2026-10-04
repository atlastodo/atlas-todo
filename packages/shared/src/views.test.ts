import { describe, it, expect } from "vitest";
import { SMART_VIEWS, isSmartView } from "./views";

describe("isSmartView", () => {
  it("accepts every view in SMART_VIEWS", () => {
    // The guard and the list must not drift: a view in the list that the guard rejects would make
    // its own stored default_view unreadable.
    for (const view of SMART_VIEWS) expect(isSmartView(view)).toBe(true);
  });

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
