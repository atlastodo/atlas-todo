import { describe, it, expect } from "vitest";
import { cursorStep } from "./cursor";

const IDS = ["a", "b", "c"];

describe("cursorStep", () => {
  it("starts at the first row going down, the last going up, when there is no cursor", () => {
    expect(cursorStep(IDS, null, 1)).toBe("a");
    expect(cursorStep(IDS, null, -1)).toBe("c");
  });

  it("moves down and up by one", () => {
    expect(cursorStep(IDS, "a", 1)).toBe("b");
    expect(cursorStep(IDS, "b", 1)).toBe("c");
    expect(cursorStep(IDS, "c", -1)).toBe("b");
  });

  it("clamps at the ends (does not wrap)", () => {
    expect(cursorStep(IDS, "c", 1)).toBe("c");
    expect(cursorStep(IDS, "a", -1)).toBe("a");
  });

  it("lands on an end when the current id has left the list", () => {
    expect(cursorStep(IDS, "gone", 1)).toBe("a");
    expect(cursorStep(IDS, "gone", -1)).toBe("c");
  });

  it("is null for an empty list", () => {
    expect(cursorStep([], null, 1)).toBeNull();
    expect(cursorStep([], "a", -1)).toBeNull();
  });
});
