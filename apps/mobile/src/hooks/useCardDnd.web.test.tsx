/**
 * @jest-environment jsdom
 */
import { useRef } from "react";
import { act, render } from "@testing-library/react-native";
import { CARD_MIME, useDragLift, useDragSource, useDropTarget } from "./useCardDnd.web";

/**
 * The board's HTML5 drag-and-drop wiring, driven against a real detached `div` (a react-native-web ref is the DOM node;
 * under jest it is not). jsdom has no `DataTransfer`, so a minimal fake carries the payload.
 */
function fakeDataTransfer(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    effectAllowed: "none",
    types: Object.keys(store),
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
  };
}

function fireDrag(node: Element, type: string, dataTransfer: ReturnType<typeof fakeDataTransfer>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer, configurable: true });
  node.dispatchEvent(event);
  return event;
}

function DragHarness({
  node,
  id,
  enabled,
  onDragStart,
  onDragEnd,
}: {
  node: HTMLElement;
  id: string;
  enabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const ref = useRef<HTMLElement | null>(node);
  useDragSource(ref, () => id, { enabled, onDragStart, onDragEnd });
  return null;
}

/** A card as the board wires it: dragged, and lifted out of its column while it is. */
function LiftHarness({
  node,
  seen,
}: {
  node: HTMLElement;
  seen: { dragging: boolean; lifted: boolean };
}) {
  const ref = useRef<HTMLElement | null>(node);
  const dragging = useDragSource(ref, () => "task-1");
  seen.dragging = dragging;
  seen.lifted = useDragLift(dragging);
  return null;
}

function DropHarness({ node, onDrop }: { node: HTMLElement; onDrop: (id: string) => void }) {
  const ref = useRef<HTMLElement | null>(node);
  useDropTarget(ref, onDrop);
  return null;
}

describe("useCardDnd.web", () => {
  it("marks the card draggable and encodes its id on dragstart", async () => {
    const div = document.createElement("div");
    await render(<DragHarness node={div} id="task-7" />);
    expect(div.getAttribute("draggable")).toBe("true");

    const dt = fakeDataTransfer();
    await act(() => void fireDrag(div, "dragstart", dt));
    expect(dt.getData(CARD_MIME)).toBe("task-7");
  });

  it("calls onDrop with the dragged id when a card is dropped on the column", async () => {
    const div = document.createElement("div");
    const onDrop = jest.fn();
    await render(<DropHarness node={div} onDrop={onDrop} />);

    fireDrag(div, "drop", fakeDataTransfer({ [CARD_MIME]: "task-9" }));
    expect(onDrop).toHaveBeenCalledWith("task-9");
  });

  it("ignores a drop that is not one of our cards", async () => {
    const div = document.createElement("div");
    const onDrop = jest.fn();
    await render(<DropHarness node={div} onDrop={onDrop} />);

    fireDrag(div, "drop", fakeDataTransfer({ "text/plain": "something-else" }));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("tells the board when a card drag starts and ends (the board's drop preview)", async () => {
    const div = document.createElement("div");
    const onDragStart = jest.fn();
    const onDragEnd = jest.fn();
    await render(
      <DragHarness node={div} id="task-4" onDragStart={onDragStart} onDragEnd={onDragEnd} />,
    );

    await act(() => void fireDrag(div, "dragstart", fakeDataTransfer()));
    expect(onDragStart).toHaveBeenCalledTimes(1);

    await act(() => void fireDrag(div, "dragend", fakeDataTransfer()));
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("leaves a disabled source undraggable (a locked task's card)", async () => {
    const div = document.createElement("div");
    await render(<DragHarness node={div} id="locked-1" enabled={false} />);
    expect(div.getAttribute("draggable")).toBeNull();
    const dt = fakeDataTransfer();
    fireDrag(div, "dragstart", dt);
    expect(dt.getData(CARD_MIME)).toBe("");
  });

  describe("lifting the dragged card out of its column", () => {
    // The card stayed in place, dimmed, while a dimmed copy showed at the drop point: the card twice.
    // It now collapses -- but hiding a drag source inside its own dragstart makes Chromium cancel the
    // drag, so the lift must wait a frame and end on every way a drag can end.
    let card: HTMLElement;
    let seen: { dragging: boolean; lifted: boolean };

    beforeEach(async () => {
      jest.useFakeTimers();
      card = document.createElement("div");
      document.body.appendChild(card);
      seen = { dragging: false, lifted: false };
      await render(<LiftHarness node={card} seen={seen} />);
    });

    afterEach(() => {
      jest.useRealTimers();
      document.body.innerHTML = "";
    });

    const nextFrame = () => act(() => jest.advanceTimersByTime(20));

    it("lifts the card on the frame after dragstart, not inside it", async () => {
      await act(() => void fireDrag(card, "dragstart", fakeDataTransfer()));
      expect(seen.dragging).toBe(true);
      expect(seen.lifted).toBe(false);

      await nextFrame();
      expect(seen.lifted).toBe(true);
    });

    it("puts the card back when the drag ends -- dropped, or cancelled with Esc", async () => {
      await act(() => void fireDrag(card, "dragstart", fakeDataTransfer()));
      await nextFrame();

      await act(() => void fireDrag(card, "dragend", fakeDataTransfer()));
      expect(seen.lifted).toBe(false);
    });

    it("never lifts a card whose drag ended within the first frame", async () => {
      await act(() => {
        fireDrag(card, "dragstart", fakeDataTransfer());
        fireDrag(card, "dragend", fakeDataTransfer());
      });
      await nextFrame();

      expect(seen.lifted).toBe(false);
    });

    it("puts the card back on a drop anywhere, even if its own dragend never comes", async () => {
      // A drop that moves the card re-renders it, and a moved source can miss its dragend.
      const column = document.createElement("div");
      document.body.appendChild(column);
      await act(() => void fireDrag(card, "dragstart", fakeDataTransfer()));
      await nextFrame();

      await act(() => void fireDrag(column, "drop", fakeDataTransfer({ [CARD_MIME]: "task-1" })));
      expect(seen.dragging).toBe(false);
      expect(seen.lifted).toBe(false);
    });
  });
});
