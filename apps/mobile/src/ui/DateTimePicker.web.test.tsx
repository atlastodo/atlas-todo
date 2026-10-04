/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import DateTimePicker, { fromInputValue } from "./DateTimePicker.web";

/**
 * The web picker's event contract (the `.web` file is imported directly). The browser's `dd/mm/yyyy` input fires per segment,
 * so a value must only be reported on blur / Enter, or the month and year could never be typed.
 */

const input = () => screen.container.queryAll((node) => node.type === "input")[0]!;

/** Blur the field the way a browser does, with whatever the user left in it. */
const blurWith = (value: string) => fireEvent(input(), "blur", { currentTarget: { value } });
const keyWith = (key: string, value: string) =>
  fireEvent(input(), "keyDown", { key, currentTarget: { value } });

/**
 * Type digits into the segmented field the way a browser drives it: a keydown per digit, and a
 * change event per segment carrying the value so far (the field is prefilled, so that value is
 * already a whole date while the day is being typed).
 */
const type = async (digits: string, valueAfterEach: string[]) => {
  for (const [i, digit] of [...digits].entries()) {
    await fireEvent(input(), "keyDown", {
      key: digit,
      currentTarget: { value: valueAfterEach[i] },
    });
    await fireEvent(input(), "change", { currentTarget: { value: valueAfterEach[i] } });
  }
};

describe("web DateTimePicker", () => {
  it("reports the edited date, in local time, when the field is done", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={new Date(2026, 7, 3)} mode="date" onChange={onChange} />);

    await blurWith("2026-08-17");

    expect(onChange).toHaveBeenCalledTimes(1);
    const [event, date] = onChange.mock.calls[0];
    expect(event.type).toBe("set");
    // Local midnight on the day picked -- `new Date("2026-08-17")` would be UTC, a day early west
    // of Greenwich.
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 7, 17, 0,
    ]);
  });

  it("stays open until the whole date is typed, then reports it", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={new Date(2026, 7, 3)} mode="date" onChange={onChange} />);

    // 17 / 08 / 2026, digit by digit. The browser reports a complete value from the very first
    // keystroke, so anything earlier than the last one would cut the entry short at the day.
    const values = [
      "2026-08-01",
      "2026-08-17",
      "2026-01-17",
      "2026-08-17",
      "0002-08-17",
      "0020-08-17",
      "0202-08-17",
      "2026-08-17",
    ];
    for (const [i, value] of values.entries()) {
      // Nothing may be reported until the eighth digit lands.
      if (i > 0) expect(onChange).not.toHaveBeenCalled();
      await type("1", [value]);
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    const [event, date] = onChange.mock.calls[0];
    expect(event.type).toBe("set");
    expect(date.getDate()).toBe(17);
  });

  it("waits for blur when only one segment was edited", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={new Date(2026, 7, 3)} mode="date" onChange={onChange} />);

    // Just the day, then off to something else: two digits are not a typed-out date, so the value
    // rides out on the blur instead.
    await type("17", ["2026-08-01", "2026-08-17"]);
    expect(onChange).not.toHaveBeenCalled();

    await blurWith("2026-08-17");
    expect(onChange.mock.calls[0][0].type).toBe("set");
  });

  it("reports nothing to save when the offered date is left untouched", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={new Date(2026, 7, 3)} mode="date" onChange={onChange} />);

    // Opened the field, changed nothing, clicked away: the task must not gain that date.
    await blurWith("2026-08-03");

    expect(onChange.mock.calls[0][0].type).toBe("dismissed");
    expect(onChange.mock.calls[0][1]).toBeUndefined();
  });

  it("commits the offered value on Enter", async () => {
    const onChange = jest.fn();
    await render(
      <DateTimePicker value={new Date(2026, 7, 3, 9, 30)} mode="datetime" onChange={onChange} />,
    );

    await keyWith("Enter", "2026-08-03T09:30");

    const [event, date] = onChange.mock.calls[0];
    expect(event.type).toBe("set");
    expect(date.getTime()).toBe(new Date(2026, 7, 3, 9, 30).getTime());
  });

  it("dismisses on Escape without reporting the typed value", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={new Date(2026, 7, 3)} mode="date" onChange={onChange} />);

    await keyWith("Escape", "2026-08-17");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].type).toBe("dismissed");
  });

  it("reports once, even though closing the picker also blurs the field", async () => {
    const onChange = jest.fn();
    await render(<DateTimePicker value={new Date(2026, 7, 3)} mode="date" onChange={onChange} />);

    await keyWith("Enter", "2026-08-17");
    await blurWith("2026-08-17");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports a picked time on the day it was opened with", async () => {
    const onChange = jest.fn();
    await render(
      <DateTimePicker value={new Date(2026, 7, 3, 9, 0)} mode="time" onChange={onChange} />,
    );

    await blurWith("07:45");

    const [event, date] = onChange.mock.calls[0];
    expect(event.type).toBe("set");
    expect(date.getTime()).toBe(new Date(2026, 7, 3, 7, 45).getTime());
  });
});

describe("fromInputValue", () => {
  const base = new Date(2026, 7, 3, 9, 0);

  it("has nothing to report for a half-typed field", () => {
    // What the browser reports mid-edit: no value at all until every segment is filled.
    expect(fromInputValue("", "date", base)).toBeNull();
    expect(fromInputValue("", "datetime", base)).toBeNull();
    expect(fromInputValue("2026-08-17T", "datetime", base)).toBeNull();
    expect(fromInputValue("", "time", base)).toBeNull();
  });

  it("keeps a datetime in local time", () => {
    expect(fromInputValue("2026-08-17T14:30", "datetime", base)?.getTime()).toBe(
      new Date(2026, 7, 17, 14, 30).getTime(),
    );
  });
});
