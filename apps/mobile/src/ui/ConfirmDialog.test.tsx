import { fireEvent, render, screen } from "@testing-library/react-native";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  const base = {
    visible: true,
    title: "Leave this project?",
    message: "You'll lose access.",
    confirmLabel: "Leave project",
  };

  it("fires onConfirm when the confirm button is pressed", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel} />);
    await fireEvent.press(screen.getByLabelText("Leave project"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("fires onCancel from the Cancel button (defaulted label) without confirming", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel} />);
    await fireEvent.press(screen.getByLabelText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires onSave when the save button is pressed", async () => {
    const onSave = jest.fn();
    await render(
      <ConfirmDialog
        {...base}
        saveLabel="Save & Close"
        onSave={onSave}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Save & Close"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
