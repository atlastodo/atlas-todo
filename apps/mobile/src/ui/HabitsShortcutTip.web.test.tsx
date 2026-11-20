/**
 * @jest-environment jsdom
 */
import { Platform } from "react-native";
// The H tip is for a keyboard layout: force the web platform before any render -- jest-expo
// defaults to a native OS.
(Platform as { OS: string }).OS = "web";

import { render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import { withApp } from "../testutil";
import { HabitsDialogProvider } from "../data/HabitsDialogContext";
import * as useIsWideModule from "../hooks/useIsWide";
import { HabitsShortcutTip } from "./HabitsShortcutTip";

const TIP = "Tip: press H to open your habits from anywhere.";

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

async function renderTip(store: LocalStore) {
  const App = withApp(store);
  return render(
    <App>
      <HabitsDialogProvider>
        <HabitsShortcutTip />
      </HabitsDialogProvider>
    </App>,
  );
}

describe("HabitsShortcutTip", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("tells a keyboard user about H once, after the first habit", async () => {
    jest.spyOn(useIsWideModule, "useIsWide").mockReturnValue(true);
    const store = storeWithHabit();
    const first = await renderTip(store);
    expect(screen.getByText(TIP)).toBeTruthy();
    await first.unmount();

    await renderTip(store);
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("leaves a narrow window to the add button's own tip", async () => {
    jest.spyOn(useIsWideModule, "useIsWide").mockReturnValue(false);
    await renderTip(storeWithHabit());
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("does not tell a touch-only tablet about a key it has no keyboard for", async () => {
    jest.spyOn(useIsWideModule, "useIsWide").mockReturnValue(true);
    (window as { matchMedia?: unknown }).matchMedia = (query: string) => ({
      matches: false,
      media: query,
    });
    await renderTip(storeWithHabit());
    expect(screen.queryByText(TIP)).toBeNull();
  });
});
