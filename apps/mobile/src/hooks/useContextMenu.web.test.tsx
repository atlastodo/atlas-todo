/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react-native";
import { useContextMenu, type MenuPos } from "./useContextMenu.web";

/**
 * The right-click seam, driven against a real detached `div` set on the ref (a react-native-web ref is the DOM node;
 * under jest it is not).
 */
function Harness({ node, onOpen }: { node: HTMLElement; onOpen: (pos: MenuPos) => void }) {
  const ref = useContextMenu(onOpen);
  // Set before the mount effect runs (react-native-web would make this the DOM node in production).
  (ref as { current: unknown }).current = node;
  return null;
}

describe("useContextMenu.web", () => {
  it("opens the menu at the cursor and prevents the default browser menu", async () => {
    const div = document.createElement("div");
    const onOpen = jest.fn();
    await render(<Harness node={div} onOpen={onOpen} />);

    const event = new MouseEvent("contextmenu", { clientX: 42, clientY: 7, cancelable: true });
    div.dispatchEvent(event);

    expect(onOpen).toHaveBeenCalledWith({ x: 42, y: 7 });
    expect(event.defaultPrevented).toBe(true);
  });

  it("removes its listener on unmount", async () => {
    const div = document.createElement("div");
    const onOpen = jest.fn();
    const { unmount } = await render(<Harness node={div} onOpen={onOpen} />);
    await unmount();
    div.dispatchEvent(new MouseEvent("contextmenu", { clientX: 1, clientY: 1 }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
