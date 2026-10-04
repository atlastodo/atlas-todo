/**
 * @jest-environment jsdom
 */
import { Platform } from "react-native";
// The Escape wiring is web-only (native asks through the Modal's back button), so force the web
// platform before any render -- jest-expo defaults to a native OS.
(Platform as { OS: string }).OS = "web";

import { act, render } from "@testing-library/react-native";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * While the dialog is open, Escape must answer the dialog (cancel), not whatever Escape handler was
 * mounted before it -- e.g. TaskDetailWebFrame closing the whole screen behind the dialog. The
 * capture-phase listener is what gives the dialog that priority, so this test dispatches a real
 * `window` keydown (jsdom) rather than poking props.
 */

async function pressEscape() {
  await act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  });
}

describe("ConfirmDialog web Escape", () => {
  it("cancels the dialog when Escape is pressed while it is open", async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    await render(
      <ConfirmDialog
        visible={true}
        title="Leave project?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await pressEscape();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stops listening once the dialog has closed", async () => {
    const onCancel = jest.fn();
    const { rerender } = await render(
      <ConfirmDialog
        visible={true}
        title="Leave project?"
        confirmLabel="Leave"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );
    await rerender(
      <ConfirmDialog
        visible={false}
        title="Leave project?"
        confirmLabel="Leave"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    await pressEscape();

    expect(onCancel).not.toHaveBeenCalled();
  });
});
