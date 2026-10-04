import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import i18n from "../i18n";
import { TaskDetailWebFrame } from "./TaskDetailWebFrame";

/**
 * On web the native header is off, so the frame draws its own dismiss control at every width (back arrow when narrow,
 * close when wide), and both invoke `onClose`.
 */
describe("TaskDetailWebFrame", () => {
  const body = <Text>task body</Text>;

  it("renders a working dismiss control when wide (right-side drawer)", async () => {
    const onClose = jest.fn();
    await render(
      <TaskDetailWebFrame isWide title="Details" onClose={onClose}>
        {body}
      </TaskDetailWebFrame>,
    );
    // The backdrop and the X both close; at least one Close control must exist, and pressing it fires.
    const closers = screen.getAllByLabelText(i18n.t("common.close"));
    expect(closers.length).toBeGreaterThan(0);
    await fireEvent.press(closers[closers.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
