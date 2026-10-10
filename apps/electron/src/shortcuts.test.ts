import { describe, expect, it } from "vitest";
import { isQuitShortcut, type KeyInput } from "./shortcuts";

const key = (overrides: Partial<KeyInput> = {}): KeyInput => ({
  type: "keyDown",
  key: "q",
  control: true,
  shift: false,
  alt: false,
  meta: false,
  ...overrides,
});

describe("isQuitShortcut", () => {
  it("is Ctrl+Q on Windows and Linux, either case", () => {
    expect(isQuitShortcut(key(), "linux")).toBe(true);
    expect(isQuitShortcut(key({ key: "Q" }), "win32")).toBe(true);
  });

  it("leaves macOS to its app menu's Cmd+Q", () => {
    expect(isQuitShortcut(key(), "darwin")).toBe(false);
  });

  it("ignores key-up, other keys and extra modifiers", () => {
    expect(isQuitShortcut(key({ type: "keyUp" }), "linux")).toBe(false);
    expect(isQuitShortcut(key({ key: "w" }), "linux")).toBe(false);
    expect(isQuitShortcut(key({ control: false }), "linux")).toBe(false);
    expect(isQuitShortcut(key({ shift: true }), "linux")).toBe(false);
    expect(isQuitShortcut(key({ alt: true }), "linux")).toBe(false);
  });
});
