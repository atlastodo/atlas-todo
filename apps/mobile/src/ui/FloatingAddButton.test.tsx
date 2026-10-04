import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { BottomChromeProvider, useBottomChrome } from "../data/BottomChromeContext";
import { FloatingAddButton } from "./FloatingAddButton";

/**
 * The add button and the focus bar float over the same corner from different trees, so the only
 * thing keeping them off each other is the height one claims and the other reads. That handshake is
 * what these cover -- the geometry either side of it is plain arithmetic.
 */

/** Stands in for the focus bar: claims a height along the bottom edge. */
function Claim({ height }: { height: number }) {
  const { setFocusBarBottom } = useBottomChrome();
  useEffect(() => setFocusBarBottom(height), [height, setFocusBarBottom]);
  return null;
}

/** The button's positioned container, which is what carries the offset. */
function containerStyle() {
  let node = screen.getByLabelText("Add").parent;
  while (node && StyleSheet.flatten(node.props?.style)?.bottom === undefined) node = node.parent;
  return StyleSheet.flatten(node?.props?.style) as { bottom: number } | undefined;
}

describe("FloatingAddButton", () => {
  it("sits at its usual spot when nothing else is on the bottom edge", async () => {
    await render(
      <BottomChromeProvider>
        <FloatingAddButton onPress={() => {}} />
      </BottomChromeProvider>,
    );

    expect(containerStyle()?.bottom).toBe(16);
  });

  it("lifts clear of the focus bar when it is parked below", async () => {
    await render(
      <BottomChromeProvider>
        <Claim height={48} />
        <FloatingAddButton onPress={() => {}} />
      </BottomChromeProvider>,
    );

    // Its own margin, the bar's height, and the gap between the two.
    expect(containerStyle()?.bottom).toBe(16 + 48 + 8);
  });

  it("drops back down when the bar leaves the bottom edge", async () => {
    const { rerender } = await render(
      <BottomChromeProvider>
        <Claim height={48} />
        <FloatingAddButton onPress={() => {}} />
      </BottomChromeProvider>,
    );
    expect(containerStyle()?.bottom).toBe(72);

    // A bar dragged to a top corner claims nothing, and must not leave the button stranded.
    await rerender(
      <BottomChromeProvider>
        <Claim height={0} />
        <FloatingAddButton onPress={() => {}} />
      </BottomChromeProvider>,
    );

    expect(containerStyle()?.bottom).toBe(16);
  });
});
