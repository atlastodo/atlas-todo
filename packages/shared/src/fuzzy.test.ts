import { describe, it, expect } from "vitest";
import { filterActions, scoreMatch } from "./fuzzy";

describe("scoreMatch", () => {
  it("matches subsequences and rejects non-matches", () => {
    expect(scoreMatch("Today", "tod")).not.toBeNull();
    expect(scoreMatch("Today", "tdy")).not.toBeNull(); // scattered subsequence
    expect(scoreMatch("Today", "xyz")).toBeNull();
  });

  it("scores a contiguous prefix higher than a scattered match", () => {
    const prefix = scoreMatch("calendar", "cal")!;
    const scattered = scoreMatch("critical apple lemon", "cal")!;
    expect(prefix).toBeGreaterThan(scattered);
  });

  it("treats an empty query as a neutral match", () => {
    expect(scoreMatch("anything", "")).toBe(0);
  });
});

describe("filterActions", () => {
  const items = [
    { label: "Today" },
    { label: "Upcoming" },
    { label: "Calendar" },
    { label: "Open board: Work", keywords: "project" },
  ];

  it("returns everything in order for an empty query", () => {
    expect(filterActions("", items)).toEqual(items);
  });

  it("keeps only matching items, best first", () => {
    const out = filterActions("cal", items);
    expect(out[0]!.label).toBe("Calendar");
    expect(out.some((i) => i.label === "Upcoming")).toBe(false);
  });

  it("matches on keywords too", () => {
    const out = filterActions("project", items);
    expect(out.map((i) => i.label)).toContain("Open board: Work");
  });
});
