import { fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, Text } from "react-native";
import i18n from "../i18n";
import { BottomSheet } from "./BottomSheet";
import * as useKeyboardHeightModule from "../hooks/useKeyboardHeight";

describe("BottomSheet", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls onClose when backdrop is pressed and keyboard is closed", async () => {
    jest.spyOn(useKeyboardHeightModule, "useKeyboardHeight").mockReturnValue(0);
    const onClose = jest.fn();

    await render(
      <BottomSheet visible onClose={onClose}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    const backdrop = screen.getByLabelText(i18n.t("common.close"));
    await fireEvent.press(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses keyboard and does not call onClose when backdrop is pressed with keyboard open", async () => {
    jest.spyOn(useKeyboardHeightModule, "useKeyboardHeight").mockReturnValue(300);
    const dismissSpy = jest.spyOn(Keyboard, "dismiss");
    const onClose = jest.fn();

    await render(
      <BottomSheet visible onClose={onClose}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    const backdrop = screen.getByLabelText(i18n.t("common.close"));
    await fireEvent.press(backdrop);

    expect(dismissSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
