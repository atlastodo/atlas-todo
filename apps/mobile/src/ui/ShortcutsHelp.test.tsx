import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import { PREFERENCES_ID } from "@atlastodo/todo-core";
import { withApp } from "../testutil";
import { HabitsDialogProvider } from "../data/HabitsDialogContext";
import { ShortcutsModal, ShortcutsTable } from "./ShortcutsHelp";

/** The modal's ways out; the table is data-driven from `@atlastodo/todo-core`'s `HOTKEY_BINDINGS`. */

describe("ShortcutsHelp", () => {
  it("closes from both close affordances (backdrop and header button)", async () => {
    const onClose = jest.fn();
    await render(<ShortcutsModal visible onClose={onClose} />);
    const closes = screen.getAllByLabelText("Close");
    expect(closes.length).toBe(2);
    await fireEvent.press(closes[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(closes[1]!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("lists H for habits only while the habits feature is on", async () => {
    const store = new LocalStore("test");
    const App = withApp(store);
    const table = (
      <App>
        <HabitsDialogProvider>
          <ShortcutsTable />
        </HabitsDialogProvider>
      </App>
    );
    const { rerender } = await render(table);
    expect(screen.getByText("Open habits")).toBeTruthy();

    store.set("preference", PREFERENCES_ID, "habits_enabled", false);
    await rerender(table);
    expect(screen.queryByText("Open habits")).toBeNull();
  });
});
