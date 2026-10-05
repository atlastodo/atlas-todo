import { render } from "@testing-library/react-native";
import * as SystemUI from "expo-system-ui";
import { SystemBars } from "./SystemBars";

jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(async () => {}),
}));

const setBackground = jest.mocked(SystemUI.setBackgroundColorAsync);

describe("SystemBars", () => {
  beforeEach(() => setBackground.mockClear());

  it("paints the root view behind the system bars in the applied scheme", async () => {
    const view = await render(<SystemBars scheme="dark" />);
    expect(setBackground).toHaveBeenLastCalledWith("#09090b");

    await view.rerender(<SystemBars scheme="light" />);
    expect(setBackground).toHaveBeenLastCalledWith("#ffffff");
  });

  it("survives a build without the native module", async () => {
    setBackground.mockRejectedValueOnce(new Error("unavailable"));
    await render(<SystemBars scheme="dark" />);
    expect(setBackground).toHaveBeenCalledTimes(1);
  });
});
