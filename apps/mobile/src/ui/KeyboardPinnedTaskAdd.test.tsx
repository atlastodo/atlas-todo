import { fireEvent, render, screen } from "@testing-library/react-native";
import { KeyboardPinnedTaskAdd } from "./KeyboardPinnedTaskAdd";

describe("KeyboardPinnedTaskAdd", () => {
  it("renders when visible and handles close on backdrop press", async () => {
    const onClose = jest.fn();
    const onAdd = jest.fn();

    await render(<KeyboardPinnedTaskAdd visible={true} onClose={onClose} onAdd={onAdd} />);

    expect(screen.getByLabelText("Add a task")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render when visible is false", async () => {
    const onClose = jest.fn();
    const onAdd = jest.fn();

    await render(<KeyboardPinnedTaskAdd visible={false} onClose={onClose} onAdd={onAdd} />);

    expect(screen.queryByLabelText("Add a task")).toBeNull();
  });

  it("adds task and calls onClose upon submission", async () => {
    const onClose = jest.fn();
    const onAdd = jest.fn().mockReturnValue("new-task-id");

    await render(<KeyboardPinnedTaskAdd visible={true} onClose={onClose} onAdd={onAdd} />);

    const input = screen.getByLabelText("Add a task");
    await fireEvent.changeText(input, "Buy groceries");
    await fireEvent(input, "submitEditing");

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "Buy groceries" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("asks for confirmation when tapping backdrop after typing input", async () => {
    const onClose = jest.fn();
    const onAdd = jest.fn();

    await render(<KeyboardPinnedTaskAdd visible={true} onClose={onClose} onAdd={onAdd} />);

    const input = screen.getByLabelText("Add a task");
    await fireEvent.changeText(input, "Draft task in progress");

    // Tap backdrop
    await fireEvent.press(screen.getByLabelText("Close"));

    // Should NOT close immediately; confirm dialog should be visible
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Discard task?")).toBeTruthy();

    // Cancel keeping editing in dialog
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();

    // Tap backdrop again and confirm discard
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(screen.getByText("Discard task?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Discard"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes directly when tapping backdrop with empty input", async () => {
    const onClose = jest.fn();
    const onAdd = jest.fn();

    await render(<KeyboardPinnedTaskAdd visible={true} onClose={onClose} onAdd={onAdd} />);

    await fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
