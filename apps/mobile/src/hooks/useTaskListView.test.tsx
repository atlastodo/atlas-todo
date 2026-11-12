import { act, fireEvent, renderHook, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import type { ReactNode } from "react";
import { withApp } from "../testutil";
import { OpenTaskContext } from "../data/OpenTaskContext";
import { useTaskListView } from "./useTaskListView";

/**
 * A titled create says where the task went (from Today a task dated tomorrow leaves the screen with
 * nothing changing), with Undo and Open. A blank draft row is not announced.
 */

function mount(store: LocalStore, openTask: (id: string) => void) {
  const App = withApp(store);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <App>
      <OpenTaskContext.Provider value={openTask}>{children}</OpenTaskContext.Provider>
    </App>
  );
  return renderHook(() => useTaskListView("today"), { wrapper });
}

describe("useTaskListView create toast", () => {
  it("announces a titled create with Undo and Open", async () => {
    const store = new LocalStore("test");
    const openTask = jest.fn();
    const { result } = await mount(store, openTask);

    let id = "";
    await act(async () => {
      id = result.current.create({ title: "Dentist", project_id: null });
    });
    expect(screen.getByText("Added to Inbox")).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText("Open")));
    expect(openTask).toHaveBeenCalledWith(id);

    await act(async () => {
      id = result.current.create({ title: "Gym", project_id: null });
    });
    await act(async () => fireEvent.press(screen.getByLabelText("Undo")));
    expect(store.get("task", id)).toBeNull();
  });

  it("names the due date when there is one", async () => {
    const store = new LocalStore("test");
    const { result } = await mount(store, jest.fn());
    await act(async () => {
      result.current.create({
        title: "Dentist",
        project_id: null,
        due_at: Date.now() + 86_400_000,
      });
    });
    expect(screen.getByText(/^Added to Inbox · /)).toBeTruthy();
  });

  it("does not announce a blank draft row", async () => {
    const store = new LocalStore("test");
    const { result } = await mount(store, jest.fn());
    await act(async () => {
      result.current.create({ title: "", project_id: null });
    });
    expect(screen.queryByText(/^Added to/)).toBeNull();
  });
});
