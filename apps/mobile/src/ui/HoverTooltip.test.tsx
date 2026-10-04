import { render, screen, fireEvent } from "@testing-library/react-native";
import { Pressable, View } from "react-native";
import { useHoverTooltip } from "./HoverTooltip";

/**
 * The rail hover tooltip. On web the hover event's `currentTarget` is the hovered DOM node and the
 * label anchors to its measured rect; under jest there is no DOM, so presses drive the hook with a
 * stub rect (the shape `fireEvent` can also inject, which is how the rail's own wiring is tested in
 * `AppDrawerContent.test`). The default (non-web) overlay renders inline, so no DOM is needed here.
 */

const RECT = { right: 72, top: 10, height: 40 };

function Harness({ rect }: { rect?: typeof RECT }) {
  const tip = useHoverTooltip("Today");
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="in"
        onPress={() =>
          tip.onHoverIn({ currentTarget: rect ? { getBoundingClientRect: () => rect } : null })
        }
      />
      <Pressable accessibilityRole="button" accessibilityLabel="out" onPress={tip.onHoverOut} />
      {tip.tooltip}
    </View>
  );
}

/** The label's fixed overlay style: walk up from the text (NativeWind wrappers may sit between). */
function overlayStyle(label: string): Record<string, unknown> {
  let el = screen.getByText(label).parent;
  while (el && !flatStyle(el.props.style).position) el = el.parent;
  if (!el) throw new Error("fixed overlay not found");
  return flatStyle(el.props.style);
}

/** NativeWind may hand a component an array of style objects; flatten for assertions. */
function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style) as Record<string, unknown>;
  return (style ?? {}) as Record<string, unknown>;
}

describe("useHoverTooltip", () => {
  it("renders no label until the first hover", async () => {
    await render(<Harness rect={RECT} />);
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("anchors the label just past the element's right edge, vertically centred on it", async () => {
    await render(<Harness rect={RECT} />);
    await fireEvent.press(screen.getByLabelText("in"));

    expect(overlayStyle("Today")).toMatchObject({
      position: "fixed",
      left: 84, // right edge + the 12px gap
      top: 30, // the element's vertical centre
    });
  });

  it("hides the label on hover-out", async () => {
    await render(<Harness rect={RECT} />);
    await fireEvent.press(screen.getByLabelText("in"));
    expect(screen.getByText("Today")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("out"));
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("shows nothing for an element whose rect cannot be measured (non-DOM refs)", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByLabelText("in"));
    expect(screen.queryByText("Today")).toBeNull();
  });
});
