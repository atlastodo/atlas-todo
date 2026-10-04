/**
 * @jest-environment jsdom
 */
import { useRef } from "react";
import { act, render } from "@testing-library/react-native";
import { COLUMN_MIME, useColumnDragSource, useColumnDropTarget } from "./useColumnDnd.web";

/** The board's HTML5 column-reorder wiring: a sibling of `useCardDnd.web` with its own MIME, so card and column drags stay independent. */
function fakeDataTransfer(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    effectAllowed: "none",
    dropEffect: "none",
    types: Object.keys(store),
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
  };
}

async function fireDrag(
  node: Element,
  type: string,
  dataTransfer: ReturnType<typeof fakeDataTransfer>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer, configurable: true });
  await act(() => void node.dispatchEvent(event));
  return event;
}

function DragHarness({ node, id }: { node: HTMLElement; id: string }) {
  const ref = useRef<HTMLElement | null>(node);
  useColumnDragSource(ref, () => id);
  return null;
}

function DropHarness({ node, onDrop }: { node: HTMLElement; onDrop: (id: string) => void }) {
  const ref = useRef<HTMLElement | null>(node);
  useColumnDropTarget(ref, onDrop);
  return null;
}

describe("useColumnDnd.web", () => {
  it("marks the header draggable and encodes its section id on dragstart", async () => {
    const div = document.createElement("div");
    await render(<DragHarness node={div} id="section-3" />);
    expect(div.getAttribute("draggable")).toBe("true");

    const dt = fakeDataTransfer();
    await fireDrag(div, "dragstart", dt);
    expect(dt.getData(COLUMN_MIME)).toBe("section-3");
  });

  it("calls onDrop with the dragged section id when a column is dropped on it", async () => {
    const div = document.createElement("div");
    const onDrop = jest.fn();
    await render(<DropHarness node={div} onDrop={onDrop} />);

    await fireDrag(div, "drop", fakeDataTransfer({ [COLUMN_MIME]: "section-9" }));
    expect(onDrop).toHaveBeenCalledWith("section-9");
  });

  it("ignores a drop that is a card (different MIME), so card and column drags never cross", async () => {
    const div = document.createElement("div");
    const onDrop = jest.fn();
    await render(<DropHarness node={div} onDrop={onDrop} />);

    await fireDrag(div, "drop", fakeDataTransfer({ "application/x-atlas-card": "task-1" }));
    expect(onDrop).not.toHaveBeenCalled();
  });
});
