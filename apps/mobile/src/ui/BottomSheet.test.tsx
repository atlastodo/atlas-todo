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

  it("renders the shared header with a title, subtitle and an X that closes", async () => {
    jest.spyOn(useKeyboardHeightModule, "useKeyboardHeight").mockReturnValue(0);
    const onClose = jest.fn();

    await render(
      <BottomSheet visible onClose={onClose} title="New habit" subtitle="In Mornings">
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(screen.getByRole("header", { name: "New habit" })).toBeTruthy();
    expect(screen.getByText("In Mornings")).toBeTruthy();
    // Backdrop first, then the header X.
    const closes = screen.getAllByLabelText(i18n.t("common.close"));
    expect(closes).toHaveLength(2);
    await fireEvent.press(closes[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no header without a title", async () => {
    await render(
      <BottomSheet visible onClose={() => {}}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.getAllByLabelText(i18n.t("common.close"))).toHaveLength(1);
  });
});
