import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { ListPicker, type PickerOption } from "./ListPicker";

const shortOptions: PickerOption<string>[] = [
  { value: "opt1", label: "Option 1", hint: "Hint 1" },
  { value: "opt2", label: "Option 2" },
  { value: "opt3", label: "Option 3" },
];

const longOptions: PickerOption<string>[] = Array.from({ length: 15 }, (_, i) => ({
  value: `val${i}`,
  label: `Item ${i}`,
}));

describe("ListPicker", () => {
  it("opens modal and chooses an option", async () => {
    const onChange = jest.fn();
    await render(
      <ListPicker label="Test Picker" value="opt1" options={shortOptions} onChange={onChange} />,
    );

    await fireEvent.press(screen.getByLabelText("Test Picker"));
    expect(screen.getByLabelText("Option 2")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Option 2"));
    expect(onChange).toHaveBeenCalledWith("opt2");
  });

  it("dismisses bottom sheet when close button is pressed", async () => {
    await render(
      <ListPicker label="Test Picker" value="opt1" options={shortOptions} onChange={() => {}} />,
    );

    await fireEvent.press(screen.getByLabelText("Test Picker"));
    expect(screen.getByLabelText("Option 2")).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText("Close")[0]!);
    expect(screen.queryByLabelText("Option 2")).toBeNull();
  });

  it("does not show search bar on short picker", async () => {
    await render(
      <ListPicker label="Short Picker" value="opt1" options={shortOptions} onChange={() => {}} />,
    );
    await fireEvent.press(screen.getByLabelText("Short Picker"));
    expect(screen.queryByLabelText("Search")).toBeNull();
  });

  it("shows search bar when options exceed threshold", async () => {
    await render(
      <ListPicker label="Long Picker" value="val0" options={longOptions} onChange={() => {}} />,
    );
    await fireEvent.press(screen.getByLabelText("Long Picker"));
    expect(screen.getByLabelText("Search")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Search"), "14");
    expect(screen.getByLabelText("Item 14")).toBeTruthy();
    expect(screen.queryByLabelText("Item 1")).toBeNull();
  });

  describe("on web", () => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      Platform.OS = "web";
    });

    afterEach(() => {
      Platform.OS = originalOS;
    });

    it("renders custom dropdown on web and allows selecting option", async () => {
      const onChange = jest.fn();
      await render(
        <ListPicker label="Web Picker" value="opt1" options={shortOptions} onChange={onChange} />,
      );

      await fireEvent.press(screen.getByLabelText("Web Picker"));
      expect(screen.getByLabelText("Option 3")).toBeTruthy();

      await fireEvent.press(screen.getByLabelText("Option 3"));
      expect(onChange).toHaveBeenCalledWith("opt3");
    });

    it("allows searching in web dropdown when searchable", async () => {
      await render(
        <ListPicker
          label="Web Long Picker"
          value="val0"
          options={longOptions}
          onChange={() => {}}
        />,
      );

      await fireEvent.press(screen.getByLabelText("Web Long Picker"));
      expect(screen.getByLabelText("Search")).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText("Search"), "12");
      expect(screen.getByLabelText("Item 12")).toBeTruthy();
      expect(screen.queryByLabelText("Item 1")).toBeNull();
    });

    it("dismisses dropdown when clicking backdrop outside", async () => {
      await render(
        <ListPicker label="Web Picker" value="opt1" options={shortOptions} onChange={() => {}} />,
      );

      await fireEvent.press(screen.getByLabelText("Web Picker"));
      expect(screen.getByLabelText("Option 2")).toBeTruthy();

      await fireEvent.press(screen.getByLabelText("Close"));
      expect(screen.queryByLabelText("Option 2")).toBeNull();
    });
  });
});
