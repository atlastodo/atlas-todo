import { describe, it, expect } from "vitest";
import { avatarColor, avatarColorFor, SELF_AVATAR_COLOR } from "./avatarColor";

describe("avatarColor", () => {
  it("is deterministic for the same id", () => {
    expect(avatarColor("user-1")).toEqual(avatarColor("user-1"));
  });

  it("differs for different ids", () => {
    expect(avatarColor("user-1")).not.toEqual(avatarColor("user-2"));
  });

  it("returns a white foreground on an hsl background", () => {
    const c = avatarColor("abc");
    expect(c.color).toBe("#fff");
    expect(c.background).toMatch(/^hsl\(/);
  });
});

describe("avatarColorFor", () => {
  it("gives the current user the fixed self color for stability", () => {
    expect(avatarColorFor("me", "me")).toEqual(SELF_AVATAR_COLOR);
  });

  it("gives everyone else their hashed color", () => {
    expect(avatarColorFor("other", "me")).toEqual(avatarColor("other"));
  });

  it("falls back to the hashed color when there is no current user", () => {
    expect(avatarColorFor("me")).toEqual(avatarColor("me"));
  });
});
