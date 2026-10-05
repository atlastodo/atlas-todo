import { hotkeyHint } from "./hotkeyHint";

/** Menu key hints read from the shared binding table, so they track the real shortcuts. */
describe("hotkeyHint", () => {
  it("shows a single key as bound", () => {
    expect(hotkeyHint("rescheduleCursor")).toBe("T");
  });

  it("picks the requested alternative, else the first", () => {
    expect(hotkeyHint("deleteCursor", "Del")).toBe("Del");
    expect(hotkeyHint("deleteCursor")).toBe("⌫");
  });

  it("spells a Mod combo as Ctrl off the web", () => {
    expect(hotkeyHint("duplicateSelection")).toBe("Ctrl+D");
  });
});
