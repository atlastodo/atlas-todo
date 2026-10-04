/**
 * @jest-environment jsdom
 */
import { Platform } from "react-native";
// The Escape wiring is web-only (native asks through the Modal's back button), so force the web
// platform before any render -- jest-expo defaults to a native OS.
(Platform as { OS: string }).OS = "web";

import { act, render } from "@testing-library/react-native";
import { ShortcutsModal } from "./ShortcutsHelp";

/**
 * While the help modal is open, Escape must close it -- the global hotkey layer's Escape case
 * deliberately reports unhandled so an open dialog can answer the key. Like `ConfirmDialog`, the
 * modal listens on a capture-phase `window` listener, so this test dispatches a real `window`
 * keydown (jsdom) rather than poking props.
 */

async function pressEscape() {
  await act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  });
}

describe("ShortcutsModal web Escape", () => {
  it("closes the modal when Escape is pressed while it is open", async () => {
    const onClose = jest.fn();
    await render(<ShortcutsModal visible onClose={onClose} />);

    await pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while closed", async () => {
    const onClose = jest.fn();
    await render(<ShortcutsModal visible={false} onClose={onClose} />);

    await pressEscape();

    expect(onClose).not.toHaveBeenCalled();
  });
});
