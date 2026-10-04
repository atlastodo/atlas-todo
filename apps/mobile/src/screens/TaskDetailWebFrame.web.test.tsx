/**
 * @jest-environment jsdom
 */
import { Platform, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import i18n from "../i18n";
import { TaskDetailWebFrame } from "./TaskDetailWebFrame";

describe("TaskDetailWebFrame (web)", () => {
  const origOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = "web";
  });
  afterEach(() => {
    Platform.OS = origOS;
  });

  const body = <Text>task body</Text>;

  it("renders centered popup and closes on backdrop press when there are no unsaved changes", async () => {
    const onClose = jest.fn();
    await render(
      <TaskDetailWebFrame isWide title="Details" onClose={onClose}>
        {body}
      </TaskDetailWebFrame>,
    );
    const closers = screen.getAllByLabelText(i18n.t("common.close"));
    expect(closers.length).toBeGreaterThan(0);
    // Backdrop is the first closer
    await fireEvent.press(closers[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape keypress when there are no unsaved changes", async () => {
    const onClose = jest.fn();
    await render(
      <TaskDetailWebFrame isWide title="Details" onClose={onClose}>
        {body}
      </TaskDetailWebFrame>,
    );
    await act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to a dialog open over the detail", async () => {
    // A picker or the "this occurrence or all" prompt on top: Escape closes that, not the detail
    // under it. react-native-web marks an open Modal with aria-modal.
    const onClose = jest.fn();
    await render(
      <TaskDetailWebFrame isWide title="Details" onClose={onClose}>
        {body}
      </TaskDetailWebFrame>,
    );
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    await act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    document.body.removeChild(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens confirmation dialogue on Escape when there are unsaved changes", async () => {
    const onClose = jest.fn();
    const onDiscard = jest.fn();

    await render(
      <TaskDetailWebFrame
        isWide
        title="Details"
        hasUnsavedChanges={true}
        onClose={onClose}
        onDiscard={onDiscard}
      >
        {body}
      </TaskDetailWebFrame>,
    );

    // Escape key does not close modal immediately
    await act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();

    // Confirmation dialogue is visible
    expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();

    // Press Discard to exit
    await fireEvent.press(screen.getByLabelText("Discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens confirmation dialogue on backdrop press when there are unsaved changes and saves on Save & Close", async () => {
    const onClose = jest.fn();
    const onSaveAndClose = jest.fn();

    await render(
      <TaskDetailWebFrame
        isWide
        title="Details"
        hasUnsavedChanges={true}
        onClose={onClose}
        onSaveAndClose={onSaveAndClose}
      >
        {body}
      </TaskDetailWebFrame>,
    );

    const closers = screen.getAllByLabelText(i18n.t("common.close"));
    // 1st click on backdrop opens confirmation dialog
    await fireEvent.press(closers[0]!);
    expect(onClose).not.toHaveBeenCalled();

    expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();

    // Press Save & Close
    await fireEvent.press(screen.getByLabelText("Save & Close"));
    expect(onSaveAndClose).toHaveBeenCalledTimes(1);
  });
});
