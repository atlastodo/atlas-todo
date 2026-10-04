import { describe, it, expect } from "vitest";
import {
  classifySwipe,
  clampOffset,
  isHorizontal,
  resolveTaskSwipe,
  DEFAULT_SWIPE,
  type TaskSwipeRow,
} from "./swipe";

const origin = { x: 100, y: 100 };

describe("classifySwipe", () => {
  it("classifies a long rightward drag as right", () => {
    expect(classifySwipe(origin, { x: 180, y: 105 })).toBe("right");
  });

  it("classifies a long leftward drag as left", () => {
    expect(classifySwipe(origin, { x: 20, y: 98 })).toBe("left");
  });

  it("returns none below the horizontal distance threshold", () => {
    expect(classifySwipe(origin, { x: 140, y: 100 })).toBe("none"); // 40px < 64px
  });

  it("returns none for a predominantly vertical drag (scroll), even if far", () => {
    // dx = 70 (over threshold) but dy = 120, so |dx| < 1.5*|dy| => scroll, not a swipe.
    expect(classifySwipe(origin, { x: 170, y: 220 })).toBe("none");
  });

  it("honours a custom threshold", () => {
    expect(classifySwipe(origin, { x: 130, y: 100 }, { threshold: 20, axisRatio: 1.5 })).toBe(
      "right",
    );
  });
});

describe("isHorizontal", () => {
  it("is true for a clearly horizontal move", () => {
    expect(isHorizontal(origin, { x: 130, y: 104 })).toBe(true);
  });
  it("is false for a vertical move (scroll)", () => {
    expect(isHorizontal(origin, { x: 108, y: 160 })).toBe(false);
  });
  it("is false for a near-zero move", () => {
    expect(isHorizontal(origin, { x: 102, y: 100 })).toBe(false);
  });
});

describe("clampOffset", () => {
  it("clamps within the bound and passes through small values", () => {
    expect(clampOffset(30, 96)).toBe(30);
    expect(clampOffset(200, 96)).toBe(96);
    expect(clampOffset(-200, 96)).toBe(-96);
  });
});

describe("DEFAULT_SWIPE", () => {
  it("exposes sensible defaults", () => {
    expect(DEFAULT_SWIPE.threshold).toBeGreaterThan(0);
    expect(DEFAULT_SWIPE.axisRatio).toBeGreaterThan(1);
  });
});

describe("resolveTaskSwipe", () => {
  const row = (over: Partial<TaskSwipeRow> = {}): TaskSwipeRow => ({
    locked: false,
    isSubtask: false,
    canIndent: true,
    canOutdent: true,
    ...over,
  });

  it("indents a top-level row and outdents a subtask", () => {
    expect(resolveTaskSwipe("indent", row())).toBe("indent");
    expect(resolveTaskSwipe("indent", row({ isSubtask: true }))).toBe("outdent");
  });

  it("does nothing when the row cannot move a level: it never completes the task instead", () => {
    // The first row has nothing above to nest under.
    expect(resolveTaskSwipe("indent", row({ canIndent: false }))).toBeNull();
    expect(resolveTaskSwipe("indent", row({ isSubtask: true, canOutdent: false }))).toBeNull();
  });

  it("maps the other actions straight through", () => {
    expect(resolveTaskSwipe("complete", row())).toBe("complete");
    expect(resolveTaskSwipe("schedule", row())).toBe("schedule");
    expect(resolveTaskSwipe("delete", row())).toBe("delete");
    expect(resolveTaskSwipe("none", row())).toBeNull();
  });

  it("does nothing at all on a locked row", () => {
    for (const action of ["complete", "schedule", "indent", "delete"] as const) {
      expect(resolveTaskSwipe(action, row({ locked: true }))).toBeNull();
    }
  });
});
