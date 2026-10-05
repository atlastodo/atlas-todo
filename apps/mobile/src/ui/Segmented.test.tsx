import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Segmented } from "./Segmented";

const options = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

describe("Segmented", () => {
  it("marks the selected option and reports a press", async () => {
    const onChange = jest.fn();
    await render(<Segmented value="system" options={options} onChange={onChange} label="Theme" />);

    expect(screen.getByRole("radio", { name: "System" }).props.accessibilityState).toEqual({
      selected: true,
    });
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("lets every option grow, so a full-width control spreads them evenly", async () => {
    await render(<Segmented value="system" options={options} onChange={() => {}} label="Theme" />);

    for (const { label } of options) {
      const style = StyleSheet.flatten(screen.getByRole("radio", { name: label }).props.style);
      expect(style.flexGrow).toBe(1);
    }
  });

  it("never paints a background behind a label, only the pill does", async () => {
    await render(<Segmented value="system" options={options} onChange={() => {}} label="Theme" />);

    const style = StyleSheet.flatten(screen.getByText("System").props.style);
    expect(style.backgroundColor).toBe("transparent");
  });
});
