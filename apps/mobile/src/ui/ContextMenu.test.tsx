import { fireEvent, render, screen } from "@testing-library/react-native";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Archive, CopyPlus, SquareArrowOutUpRight, Trash2 } from "./icons";

/**
 * The generic right-click menu that drives the sidebar's project/filter/smart-list actions. Native
 * fires no `contextmenu`, so opening is web-only and untested here; this covers the rendering +
 * press behaviour, which are platform-agnostic.
 */
function items(onOpen = jest.fn(), onDelete = jest.fn()): ContextMenuItem[] {
  return [
    { key: "open", label: "Open", icon: SquareArrowOutUpRight, onPress: onOpen },
    { key: "duplicate", label: "Duplicate", icon: CopyPlus, onPress: jest.fn() },
    { key: "archive", label: "Archive", icon: Archive, onPress: jest.fn() },
    {
      key: "delete",
      label: "Delete",
      icon: Trash2,
      onPress: onDelete,
      separatorBefore: true,
      danger: true,
    },
  ];
}

describe("ContextMenu", () => {
  it("fires an item's onPress and closes the menu", async () => {
    const onOpen = jest.fn();
    const onClose = jest.fn();
    await render(<ContextMenu items={items(onOpen)} pos={{ x: 10, y: 10 }} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText("Open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is pressed", async () => {
    const onClose = jest.fn();
    await render(<ContextMenu items={items()} pos={{ x: 10, y: 10 }} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
