import { render, screen, fireEvent } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { Row } from "./Section";

// Branch is inline style, so the layout is assertable (NativeWind classes are inert under jest).

function Harness() {
  return (
    <Row label="Theme" description="Light or dark">
      {/* A control wide enough to squeeze a label at half-window width. */}
      <Pressable accessibilityRole="button" accessibilityLabel="control">
        <Text>Light</Text>
      </Pressable>
    </Row>
  );
}

/** The Row root: the only ancestor in the harness that measures itself with `onLayout`. */
function rowOf(label: string) {
  let el = screen.getByText(label).parent;
  while (el && !el.props.onLayout) el = el.parent;
  if (!el) throw new Error("Row root not found");
  return el;
}

describe("Row", () => {
  it("keeps the label and the control side by side while the row is wide", async () => {
    await render(<Harness />);
    await fireEvent(screen.getByText("Theme"), "layout", {
      nativeEvent: { layout: { width: 520 } },
    });
    expect(rowOf("Theme").props.style).toMatchObject({ flexDirection: "row" });
  });

  it("stacks the control under the label when the row measures narrow", async () => {
    await render(<Harness />);
    await fireEvent(screen.getByText("Theme"), "layout", {
      nativeEvent: { layout: { width: 300 } },
    });
    expect(rowOf("Theme").props.style).toMatchObject({ flexDirection: "column" });
  });
});
