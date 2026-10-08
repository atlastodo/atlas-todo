import { fireEvent, render, screen } from "@testing-library/react-native";
import { SelectionToolbar } from "./SelectionToolbar";

/**
 * The selection toolbar in isolation: every action is a callback prop, so the assertions are the
 * wiring a user drives -- most importantly the Label action opening the bulk label sheet, the
 * action this toolbar exists to offer alongside the rest.
 */

async function renderToolbar(overrides: Partial<Parameters<typeof SelectionToolbar>[0]> = {}) {
  const props = {
    count: 3,
    now: 0,
    onSelectAll: jest.fn(),
    onComplete: jest.fn(),
    onSetPriority: jest.fn(),
    onSetDue: jest.fn(),
    onCopy: jest.fn(),
    onDuplicate: jest.fn(),
    onMove: jest.fn(),
    onLabel: jest.fn(),
    onDelete: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  };
  await render(<SelectionToolbar {...props} />);
  return props;
}

describe("SelectionToolbar", () => {
  it("opens the bulk label sheet from the Label action", async () => {
    const props = await renderToolbar();

    await fireEvent.press(screen.getByLabelText("Labels"));
    expect(props.onLabel).toHaveBeenCalledTimes(1);
  });

  it("keeps the other actions wired alongside it", async () => {
    const props = await renderToolbar();

    await fireEvent.press(screen.getByLabelText("Move to"));
    expect(props.onMove).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("offers Reopen instead of Complete when every selected task is done", async () => {
    const props = await renderToolbar({ allCompleted: true });
    expect(screen.queryByLabelText("Complete task")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Reopen task"));
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });
});
