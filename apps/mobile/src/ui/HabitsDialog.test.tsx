import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import { PREFERENCES_ID } from "@atlastodo/todo-core";
import { withApp } from "../testutil";
import { BottomChromeProvider } from "../data/BottomChromeContext";
import { HabitsDialogProvider } from "../data/HabitsDialogContext";
import { FloatingAddButton } from "./FloatingAddButton";
import { HabitsDialog } from "./HabitsDialog";

// Opening habits from the add button: the press-and-hold and its one-time tip, over a real in-memory
// store. H is a binding in `@atlastodo/todo-core`'s hotkey table (`hotkeys.test`); its tip is
// `HabitsShortcutTip.web.test`.

/** A daily habit, so it is in play today and the Habits screen lists it. */
function storeWithHabit(): LocalStore {
  const store = new LocalStore("test");
  const now = Date.now();
  const fields: Record<string, unknown> = {
    name: "Meditate",
    goal_kind: "daily",
    days: [],
    target: 1,
    color: "#6366f1",
    icon: "hash",
    steps: [],
    archived_at: null,
    created_at: now,
    sort_order: now,
  };
  for (const [field, value] of Object.entries(fields)) {
    store.set("habit", "11111111-1111-4111-8111-111111111111", field, value);
  }
  return store;
}

async function renderApp(store: LocalStore, children: ReactNode) {
  const App = withApp(store);
  return render(
    <App>
      <HabitsDialogProvider>
        <BottomChromeProvider>{children}</BottomChromeProvider>
      </HabitsDialogProvider>
    </App>,
  );
}

/** A press-and-hold on the add button, released `dy` px from where it began (negative is up). */
async function holdAndRelease(dy: number) {
  const button = screen.getByLabelText("Add");
  await fireEvent(button, "pressIn");
  await fireEvent(button, "longPress", { nativeEvent: { pageX: 300, pageY: 700 } });
  await fireEvent(button, "pressOut", { nativeEvent: { pageX: 300, pageY: 700 + dy } });
}

/** The add button and the dialog it opens, over a store with one habit. */
async function renderButton(store: LocalStore = storeWithHabit(), onAdd = jest.fn()) {
  await renderApp(
    store,
    <>
      <FloatingAddButton onPress={onAdd} />
      <HabitsDialog onOpenHabit={() => {}} />
    </>,
  );
  return onAdd;
}

describe("opening habits from the add button", () => {
  it("opens the habits dialog when the hold slides up onto the habits button", async () => {
    const onAdd = await renderButton();
    expect(screen.queryByText("Meditate")).toBeNull();

    await holdAndRelease(-68);

    expect(screen.getByText("Meditate")).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("leaves the habits button out after a hold released in place, to be tapped", async () => {
    const onAdd = await renderButton();
    expect(screen.queryByLabelText("Open habits")).toBeNull();

    await holdAndRelease(0);
    expect(screen.queryByText("Meditate")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Open habits"));

    expect(screen.getByText("Meditate")).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("puts the habits button away on a tap of the add button, without adding a task", async () => {
    const onAdd = await renderButton();
    await holdAndRelease(0);

    await fireEvent.press(screen.getByLabelText("Add"));
    expect(screen.queryByLabelText("Open habits")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();

    // Put away, the button adds again.
    await fireEvent.press(screen.getByLabelText("Add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("puts the habits button away on a tap anywhere else", async () => {
    await renderButton();
    await holdAndRelease(0);

    await fireEvent.press(screen.getByLabelText("Close"));

    expect(screen.queryByLabelText("Open habits")).toBeNull();
    expect(screen.queryByText("Meditate")).toBeNull();
  });

  it("offers habits to a screen reader as an action on the add button", async () => {
    await renderButton();

    await fireEvent(screen.getByLabelText("Add"), "accessibilityAction", {
      nativeEvent: { actionName: "openHabits" },
    });

    expect(screen.getByText("Meditate")).toBeTruthy();
  });

  it("is a plain add button while habits are turned off", async () => {
    const store = storeWithHabit();
    store.set("preference", PREFERENCES_ID, "habits_enabled", false);
    const onAdd = await renderButton(store);

    await holdAndRelease(-68);
    expect(screen.queryByText("Meditate")).toBeNull();
    expect(screen.queryByLabelText("Open habits")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("turning habits off", () => {
  it("puts the habits button away, so + adds again", async () => {
    const store = storeWithHabit();
    const onAdd = await renderButton(store);
    await holdAndRelease(0);

    await act(() => store.set("preference", PREFERENCES_ID, "habits_enabled", false));

    expect(screen.queryByLabelText("Open habits")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("closes the habits dialog, which stays closed when habits come back on", async () => {
    const store = storeWithHabit();
    await renderButton(store);
    await holdAndRelease(-68);
    expect(screen.getByText("Meditate")).toBeTruthy();

    await act(() => store.set("preference", PREFERENCES_ID, "habits_enabled", false));
    expect(screen.queryByText("Meditate")).toBeNull();
    await act(() => store.set("preference", PREFERENCES_ID, "habits_enabled", true));

    expect(screen.queryByText("Meditate")).toBeNull();
  });
});

describe("the hold tip", () => {
  const TIP = "Tip: press and hold + to open your habits.";

  it("shows above the add button until closed, then never again", async () => {
    const store = storeWithHabit();
    const first = await renderApp(store, <FloatingAddButton onPress={() => {}} />);
    expect(screen.getByText(TIP)).toBeTruthy();

    await fireEvent.press(screen.getByText(TIP));
    expect(screen.queryByText(TIP)).toBeNull();
    await first.unmount();

    await renderApp(store, <FloatingAddButton onPress={() => {}} />);
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("goes once the hold has been used", async () => {
    await renderApp(storeWithHabit(), <FloatingAddButton onPress={() => {}} />);

    await holdAndRelease(0);
    await fireEvent.press(screen.getByLabelText("Add"));

    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("says nothing to someone without habits", async () => {
    await renderApp(new LocalStore("test"), <FloatingAddButton onPress={() => {}} />);
    expect(screen.queryByText(TIP)).toBeNull();
  });
});
