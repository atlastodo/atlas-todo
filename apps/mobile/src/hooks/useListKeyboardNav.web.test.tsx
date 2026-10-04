/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import type { ListKeyboardNav } from "./useListKeyboardNav";
import { useListKeyboardNav } from "./useListKeyboardNav.web";

/**
 * The palette's desktop keyboard navigation. Renders the highlighted index so the test can
 * read it, and drives real `window` keydowns (jsdom) to prove arrow/Enter/Escape without a browser.
 */
function Harness(opts: ListKeyboardNav) {
  const index = useListKeyboardNav(opts);
  return <Text>{`index:${index}`}</Text>;
}

async function press(key: string) {
  await act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
  });
}

describe("useListKeyboardNav.web", () => {
  it("moves the highlight with the arrows, clamped to the ends", async () => {
    await render(<Harness enabled count={3} onEnter={jest.fn()} onEscape={jest.fn()} />);
    expect(screen.getByText("index:0")).toBeTruthy();
    await press("ArrowDown");
    expect(screen.getByText("index:1")).toBeTruthy();
    await press("ArrowDown");
    await press("ArrowDown"); // clamps at count - 1
    expect(screen.getByText("index:2")).toBeTruthy();
    await press("ArrowUp");
    expect(screen.getByText("index:1")).toBeTruthy();
  });

  it("runs the highlighted row on Enter and dismisses on Escape", async () => {
    const onEnter = jest.fn();
    const onEscape = jest.fn();
    await render(<Harness enabled count={3} onEnter={onEnter} onEscape={onEscape} />);
    await press("ArrowDown");
    await press("Enter");
    expect(onEnter).toHaveBeenCalledWith(1);
    await press("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("does not listen while disabled", async () => {
    const onEscape = jest.fn();
    await render(<Harness enabled={false} count={3} onEnter={jest.fn()} onEscape={onEscape} />);
    await press("Escape");
    expect(onEscape).not.toHaveBeenCalled();
  });
});
