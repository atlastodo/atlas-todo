import { dragReleaseAction } from "./dragRelease";

/** `ReorderableList` is mocked in jest-setup, so no test can lift a row; this covers the release rule itself. */

const release = (over: Partial<Parameters<typeof dragReleaseAction>[0]> = {}) =>
  dragReleaseAction({ from: 2, to: 2, selectMode: false, isWeb: false, ...over });

describe("dragReleaseAction", () => {
  it("opens the action menu when a lifted row is released where it started, on the phone", () => {
    expect(release()).toBe("menu");
  });

  it("does nothing at all in the browser: menus there are right-click only", () => {
    expect(release({ isWeb: true })).toBe("none");
    expect(release({ isWeb: true, to: 5 })).toBe("none");
  });

  it("does nothing when the row actually moved: that release was the reorder", () => {
    expect(release({ to: 5 })).toBe("none");
    expect(release({ from: 5, to: 2 })).toBe("none");
  });

  it("stays out of the way while multi-selecting", () => {
    expect(release({ selectMode: true })).toBe("none");
    expect(release({ selectMode: true, isWeb: true })).toBe("none");
  });
});
