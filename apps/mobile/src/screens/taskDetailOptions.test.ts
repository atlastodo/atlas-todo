import { taskDetailScreenOptions } from "./taskDetailOptions";

/**
 * React Navigation merges option updates, so an option set on one render but omitted on the next lingers.
 * The options must be constant per platform and every branch must declare the same keys.
 */
describe("taskDetailScreenOptions", () => {
  it("declares the identical key set in both branches, so no merged option lingers on resize", () => {
    const web = Object.keys(taskDetailScreenOptions(true)).sort();
    const native = Object.keys(taskDetailScreenOptions(false)).sort();
    expect(web).toEqual(native);
    // Every option that ever gets set must be present in both, so switching platform/layout resets it.
    expect(web).toEqual([
      "animation",
      "contentStyle",
      "headerShown",
      "presentation",
      "sheetGrabberVisible",
    ]);
  });
});
