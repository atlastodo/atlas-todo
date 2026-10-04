import { Platform } from "react-native";
// Force iOS before the first render: the wrapper's inline branch is chosen at render time, and
// jest-expo would otherwise leave the platform at whatever the preset defaults to.
(Platform as { OS: string }).OS = "ios";

import { act, render, screen, fireEvent } from "@testing-library/react-native";
import DateTimePicker from "./DateTimePicker";

/**
 * The iOS picker is inline and live, and the caller writes what it reports back to the task. So nothing is reported until
 * Done, and what the caller writes in the meantime must not move the picker (its date is read off the prop it renders with).
 */

// The library's picker is a composite component, and RNTL v14 only exposes host elements, so a thin
// wrapper records the props the component under test hands it (the real picker still renders).
interface PickerProps {
  mode: string;
  value: Date;
  onValueChange: (event: unknown, date?: Date) => void;
  onDismiss: () => void;
}
let mockPickerProps = {} as PickerProps;
jest.mock("@react-native-community/datetimepicker", () => {
  const actual = jest.requireActual("@react-native-community/datetimepicker");
  const { createElement } = jest.requireActual("react");
  const Spy = (props: Record<string, unknown>) => {
    mockPickerProps = props as unknown as PickerProps;
    return createElement(actual.default, props);
  };
  return { ...actual, __esModule: true, default: Spy };
});
const inner = () => ({ props: mockPickerProps });

/** The user turning the wheels / tapping a day, which iOS reports as it happens. */
const turnTo = (date: Date) => act(() => inner().props.onValueChange({}, date));

const MARCH_7 = new Date(2024, 2, 7, 9, 0);
const MARCH_9 = new Date(2024, 2, 9, 9, 0);

describe("iOS DateTimePicker", () => {
  it("reports nothing while the user is still choosing", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={MARCH_7} mode="date" onChange={onChange} />);

    await turnTo(MARCH_9);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports the chosen date once, on Done", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={MARCH_7} mode="date" onChange={onChange} />);

    await turnTo(MARCH_9);
    await fireEvent.press(screen.getByLabelText("Done"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [event, date] = onChange.mock.calls[0];
    expect(event.type).toBe("set");
    expect(date.getTime()).toBe(MARCH_9.getTime());
  });

  it("reports a dismissal on Cancel, with no date to write", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={MARCH_7} mode="date" onChange={onChange} />);

    await turnTo(MARCH_9);
    await fireEvent.press(screen.getByLabelText("Cancel"));

    expect(onChange.mock.calls[0][0].type).toBe("dismissed");
    expect(onChange.mock.calls[0][1]).toBeUndefined();
  });

  it("keeps the user's half-made choice when the screen re-renders under it", async () => {
    const { rerender } = await render(
      <DateTimePicker value={MARCH_7} mode="date" onChange={jest.fn()} />,
    );

    await turnTo(MARCH_9);
    // The screen re-renders with a different date -- a save elsewhere, a sync landing. The picker
    // must stay on what the user chose rather than jump back and drop them out of the field.
    await rerender(
      <DateTimePicker value={new Date(2024, 5, 1)} mode="date" onChange={jest.fn()} />,
    );

    expect(inner().props.value.getTime()).toBe(MARCH_9.getTime());
  });
});

describe("Android DateTimePicker", () => {
  beforeEach(() => {
    (Platform as { OS: string }).OS = "android";
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = "ios";
  });

  it("chains date then time picker when mode is datetime", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={MARCH_7} mode="datetime" onChange={onChange} />);

    // First picker rendered should be in date mode
    expect(inner().props.mode).toBe("date");

    // User picks March 9
    await act(() => inner().props.onValueChange({}, MARCH_9));

    // Picker should now transition to time mode
    expect(inner().props.mode).toBe("time");
    expect(onChange).not.toHaveBeenCalled();

    // User picks 14:30
    const timeChoice = new Date(2024, 0, 1, 14, 30);
    await act(() => inner().props.onValueChange({}, timeChoice));

    // Final result should combine March 9 and 14:30
    expect(onChange).toHaveBeenCalledTimes(1);
    const [event, date] = onChange.mock.calls[0];
    expect(event.type).toBe("set");
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(9);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(30);
  });

  it("reports dismissal if user cancels at the date stage", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={MARCH_7} mode="datetime" onChange={onChange} />);

    expect(inner().props.mode).toBe("date");
    await act(() => inner().props.onDismiss());

    expect(onChange).toHaveBeenCalledWith({ type: "dismissed" });
  });

  it("reports dismissal if user cancels at the time stage", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={MARCH_7} mode="datetime" onChange={onChange} />);

    // Pass date stage
    await act(() => inner().props.onValueChange({}, MARCH_9));
    expect(inner().props.mode).toBe("time");

    // Dismiss at time stage
    await act(() => inner().props.onDismiss());
    expect(onChange).toHaveBeenCalledWith({ type: "dismissed" });
  });
});
