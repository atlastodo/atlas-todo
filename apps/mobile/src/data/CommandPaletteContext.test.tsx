import { act, render } from "@testing-library/react-native";
import {
  CommandPaletteProvider,
  useCommandPalette,
  type CommandPaletteControl,
} from "./CommandPaletteContext";

/** The root layout mounts the one palette and reads `open`; the tab header's search button only calls `openPalette`. */
describe("CommandPaletteContext", () => {
  it("opens and closes the one shared palette from any consumer", async () => {
    let header!: CommandPaletteControl;
    let root!: CommandPaletteControl;
    function HeaderButton() {
      header = useCommandPalette();
      return null;
    }
    function RootPalette() {
      root = useCommandPalette();
      return null;
    }
    await render(
      <CommandPaletteProvider>
        <HeaderButton />
        <RootPalette />
      </CommandPaletteProvider>,
    );

    expect(root.open).toBe(false);
    await act(() => header.openPalette());
    expect(root.open).toBe(true);
    await act(() => root.closePalette());
    expect(header.open).toBe(false);
  });
});
