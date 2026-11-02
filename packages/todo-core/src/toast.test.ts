import { describe, it, expect } from "vitest";
import { toastReducer, type ToastState } from "./toast";

describe("toastReducer", () => {
  it("appends a toast on add", () => {
    const next = toastReducer([], { type: "add", toast: { id: "a", message: "Done" } });
    expect(next).toEqual([{ id: "a", message: "Done" }]);
  });

  it("removes a toast on dismiss", () => {
    const state: ToastState = [
      { id: "a", message: "one" },
      { id: "b", message: "two" },
    ];
    expect(toastReducer(state, { type: "dismiss", id: "a" })).toEqual([
      { id: "b", message: "two" },
    ]);
  });

  it("replaces (does not stack) a toast re-added with the same id", () => {
    const state: ToastState = [{ id: "a", message: "old" }];
    const next = toastReducer(state, { type: "add", toast: { id: "a", message: "new" } });
    expect(next).toEqual([{ id: "a", message: "new" }]);
  });

  it("is a no-op dismissing an unknown id", () => {
    const state: ToastState = [{ id: "a", message: "one" }];
    expect(toastReducer(state, { type: "dismiss", id: "z" })).toEqual(state);
  });
});
