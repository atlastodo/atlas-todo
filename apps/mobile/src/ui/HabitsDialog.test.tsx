import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import { PREFERENCES_ID } from "@atlastodo/todo-core";
import { withApp } from "../testutil";
import { BottomChromeProvider } from "../data/BottomChromeContext";
import { HabitsDialogProvider } from "../data/HabitsDialogContext";
import { FloatingAddButton } from "./FloatingAddButton";
import { HabitsDialog } from "./HabitsDialog";
import { HabitsShortcutTip } from "./HabitsShortcutTip";

// Opening habits from anywhere: the add button's press-and-hold and the one-time tip, over a real
// in-memory store. H is a binding in `@atlastodo/todo-core`'s hotkey table (`hotkeys.test`).

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

/** A press-and-hold on the add button, released `dx` px left of where it began. */
async function holdAndRelease(dx: number) {
  const button = screen.getByLabelText("Add");
  await fireEvent(button, "pressIn");
  await fireEvent(button, "longPress", { nativeEvent: { pageX: 300, pageY: 700 } });
  await fireEvent(button, "pressOut", { nativeEvent: { pageX: 300 + dx, pageY: 700 } });
}

describe("opening habits from the add button", () => {
  it("opens the habits dialog when the hold is released over the habits button", async () => {
    const onAdd = jest.fn();
    await renderApp(
      storeWithHabit(),
      <>
        <FloatingAddButton onPress={onAdd} />
        <HabitsDialog onOpenHabit={() => {}} />
      </>,
    );
    expect(screen.queryByText("Meditate")).toBeNull();

    await holdAndRelease(-76);

    expect(screen.getByText("Meditate")).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does nothing when the hold is released anywhere else", async () => {
    const onAdd = jest.fn();
    await renderApp(
      storeWithHabit(),
      <>
        <FloatingAddButton onPress={onAdd} />
        <HabitsDialog onOpenHabit={() => {}} />
      </>,
    );

    await holdAndRelease(0);

    expect(screen.queryByText("Meditate")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("offers habits to a screen reader as an action on the add button", async () => {
    await renderApp(
      storeWithHabit(),
      <>
        <FloatingAddButton onPress={() => {}} />
        <HabitsDialog onOpenHabit={() => {}} />
      </>,
    );

    await fireEvent(screen.getByLabelText("Add"), "accessibilityAction", {
      nativeEvent: { actionName: "openHabits" },
    });

    expect(screen.getByText("Meditate")).toBeTruthy();
  });

  it("is a plain add button while habits are turned off", async () => {
    const store = storeWithHabit();
    store.set("preference", PREFERENCES_ID, "habits_enabled", false);
    const onAdd = jest.fn();
    await renderApp(
      store,
      <>
        <FloatingAddButton onPress={onAdd} />
        <HabitsDialog onOpenHabit={() => {}} />
      </>,
    );

    await holdAndRelease(-76);
    expect(screen.queryByText("Meditate")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("HabitsShortcutTip", () => {
  const TIP = "Tip: press and hold + to open your habits.";

  it("shows the tip once, after the first habit", async () => {
    const store = storeWithHabit();
    const first = await renderApp(store, <HabitsShortcutTip />);
    expect(screen.getByText(TIP)).toBeTruthy();
    await first.unmount();

    await renderApp(store, <HabitsShortcutTip />);
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("says nothing to someone without habits", async () => {
    await renderApp(new LocalStore("test"), <HabitsShortcutTip />);
    expect(screen.queryByText(TIP)).toBeNull();
  });
});
