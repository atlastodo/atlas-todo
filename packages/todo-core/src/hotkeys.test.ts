import { describe, it, expect, vi } from "vitest";
import en from "./locales/en.json";
import {
  dispatchHotkey,
  HOTKEY_BINDINGS,
  HOTKEY_GROUPS,
  type HotkeyHandlers,
  type HotkeyInput,
} from "./hotkeys";

function input(over: Partial<HotkeyInput> & { key: string }): HotkeyInput {
  return { metaKey: false, ctrlKey: false, altKey: false, typing: false, ...over };
}

/** A handlers bag where every action is a spy, so a test can see exactly which one fired. */
function spies(): Required<HotkeyHandlers> {
  return {
    openPalette: vi.fn(),
    focusSearch: vi.fn(),
    openHelp: vi.fn(),
    openHabits: vi.fn(),
    focusQuickAdd: vi.fn(),
    cursorNext: vi.fn(),
    cursorPrev: vi.fn(),
    openCursor: vi.fn(),
    completeCursor: vi.fn(),
    rescheduleCursor: vi.fn(),
    deleteCursor: vi.fn(),
    clearSelection: vi.fn(),
    selectAll: vi.fn(),
    copySelection: vi.fn(),
    duplicateSelection: vi.fn(),
    cutSelection: vi.fn(),
  };
}

describe("dispatchHotkey", () => {
  it("opens the palette on Cmd/Ctrl-K, even while typing, and reports handled", () => {
    for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
      const h = spies();
      expect(dispatchHotkey(input({ key: "k", typing: true, ...mod }), h)).toBe(true);
      expect(h.openPalette).toHaveBeenCalledTimes(1);
    }
  });

  it("maps each single-key binding to its handler outside a text field", () => {
    const cases: [string, keyof HotkeyHandlers][] = [
      ["?", "openHelp"],
      ["h", "openHabits"],
      ["/", "focusSearch"],
      ["a", "focusQuickAdd"],
      ["q", "focusQuickAdd"],
      ["j", "cursorNext"],
      ["k", "cursorPrev"],
      ["o", "openCursor"],
      ["Enter", "openCursor"],
      ["c", "completeCursor"],
      ["x", "completeCursor"],
      ["t", "rescheduleCursor"],
      ["#", "deleteCursor"],
      ["Backspace", "deleteCursor"],
      ["Delete", "deleteCursor"],
    ];
    for (const [key, handler] of cases) {
      const h = spies();
      expect(dispatchHotkey(input({ key }), h)).toBe(true);
      expect(h[handler]).toHaveBeenCalledTimes(1);
    }
  });

  it("is inert while typing (except Cmd/Ctrl-K)", () => {
    const h = spies();
    for (const key of ["a", "j", "c", "t", "Delete", "?", "/"]) {
      expect(dispatchHotkey(input({ key, typing: true }), h)).toBe(false);
    }
    expect(h.focusQuickAdd).not.toHaveBeenCalled();
    expect(h.cursorNext).not.toHaveBeenCalled();
  });

  it("ignores single-key bindings when another modifier is held", () => {
    const h = spies();
    expect(dispatchHotkey(input({ key: "j", ctrlKey: true }), h)).toBe(false);
    expect(dispatchHotkey(input({ key: "a", altKey: true }), h)).toBe(false);
    expect(h.cursorNext).not.toHaveBeenCalled();
    expect(h.focusQuickAdd).not.toHaveBeenCalled();
  });

  it("selects all on Cmd/Ctrl-A outside a field, but leaves text-select while typing", () => {
    for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
      const h = spies();
      expect(dispatchHotkey(input({ key: "a", ...mod }), h)).toBe(true);
      expect(h.selectAll).toHaveBeenCalledTimes(1);
      // While typing, Cmd/Ctrl-A must stay the browser's select-all-text and not fire selectAll.
      const typingH = spies();
      expect(dispatchHotkey(input({ key: "a", typing: true, ...mod }), typingH)).toBe(false);
      expect(typingH.selectAll).not.toHaveBeenCalled();
    }
  });

  it("maps Cmd/Ctrl-C / X / D to the selection copy / cut / duplicate handlers", () => {
    const cases: [string, keyof HotkeyHandlers][] = [
      ["c", "copySelection"],
      ["x", "cutSelection"],
      ["d", "duplicateSelection"],
    ];
    for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
      for (const [key, handler] of cases) {
        const h = spies();
        expect(dispatchHotkey(input({ key, ...mod }), h)).toBe(true);
        expect(h[handler]).toHaveBeenCalledTimes(1);
      }
    }
  });

  it("leaves Cmd/Ctrl-C / X / D to the browser while typing or when unwired", () => {
    for (const key of ["c", "x", "d"]) {
      // Typing in a field: the selection handler must not fire, and the event is not preventDefaulted.
      const typingH = spies();
      expect(dispatchHotkey(input({ key, metaKey: true, typing: true }), typingH)).toBe(false);
      // Unwired (no selection -> caller passes no handler): falls through to the browser default.
      expect(dispatchHotkey(input({ key, metaKey: true }), {})).toBe(false);
    }
  });

  it("clears a selection on Escape but does not preventDefault (returns false)", () => {
    const h = spies();
    expect(dispatchHotkey(input({ key: "Escape" }), h)).toBe(false);
    expect(h.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("leaves Cmd/Ctrl-A to the browser when no list is there to select from", () => {
    // The handler declines (returns false) so the page's own select-all runs.
    const selectAll = vi.fn(() => false);
    expect(dispatchHotkey(input({ key: "a", metaKey: true }), { selectAll })).toBe(false);
    expect(selectAll).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an unwired binding", () => {
    // No handlers: every key is inert and reports unhandled.
    for (const key of ["k", "j", "a", "Enter"]) {
      expect(dispatchHotkey(input({ key, metaKey: key === "k" }), {})).toBe(false);
    }
  });
});

/** Walk a dotted i18n key into a (nested) catalog object. */
function lookup(catalog: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      catalog,
    );
}

describe("HOTKEY_BINDINGS", () => {
  it("renders every binding in a known group with a description in the English catalog (i18n.test.ts holds the other locales to its keys)", () => {
    for (const binding of HOTKEY_BINDINGS) {
      expect(HOTKEY_GROUPS).toContain(binding.group);
      expect(binding.displayKeys.length).toBeGreaterThan(0);
      expect(lookup(en, binding.descriptionKey), `en:${binding.descriptionKey}`).toBeDefined();
    }
  });
});
