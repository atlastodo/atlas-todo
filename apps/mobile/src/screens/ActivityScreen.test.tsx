import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import {
  allTasks,
  createTask,
  moveTaskToProject,
  updateTask,
  writeProjectActivity,
} from "@atlastodo/shared";
import { fakeAuth, withApp } from "../testutil";
import { ActivityScreen } from "./ActivityScreen";

/**
 * Over a real in-memory store. The feed, undo and recording rules are `@atlastodo/shared`'s
 * (tested there); these assert the screen scopes to its view, words entries, offers undo only on
 * the latest change to a field, and records the undo.
 */
const ME = "me";
const auth = fakeAuth({
  session: {
    accessToken: "a",
    refreshToken: "r",
    deviceId: "d",
    user: { id: ME, email: "me@example.com", display_name: "Me" },
  },
});

function setup() {
  const store = new LocalStore("test");
  const task = (id: string) => allTasks(store).find((t) => t.id === id)!;
  return { store, task };
}

describe("ActivityScreen", () => {
  it("lists a project's entries, newest first, and leaves other projects out", async () => {
    const { store, task } = setup();
    store.set("project", "p1", "name", "Home");
    store.set("project", "p2", "name", "Work");
    const home = createTask(store, { title: "Paint fence", project_id: "p1" }, "UTC", ME);
    createTask(store, { title: "Write report", project_id: "p2" }, "UTC", ME);
    updateTask(store, task(home), { priority: 1 }, ME);
    writeProjectActivity(store, ME, { projectId: "p1" }, "project_renamed", "House", "Home");
    await render(<ActivityScreen target={{ project: "p1" }} />, { wrapper: withApp(store, auth) });

    expect(screen.getByText(/renamed the project “House” to “Home”/)).toBeTruthy();
    expect(screen.getByText(/set the priority of “Paint fence” to Priority 1/)).toBeTruthy();
    expect(screen.getByText(/created “Paint fence”/)).toBeTruthy();
    expect(screen.queryByText(/Write report/)).toBeNull();
  });

  it("offers undo on the latest change only, and records the undo", async () => {
    const { store, task } = setup();
    const id = createTask(store, { title: "Ship" }, "UTC");
    updateTask(store, task(id), { title: "Ship it" }, ME, Date.now() - 10 * 60_000);
    updateTask(store, task(id), { title: "Ship it now" }, ME);
    await render(<ActivityScreen />, { wrapper: withApp(store, auth) });

    const undo = screen.getAllByRole("button", { name: /^Undo:/ });
    expect(undo).toHaveLength(1);
    await fireEvent.press(undo[0]!);
    expect(task(id).title).toBe("Ship it");
    expect(screen.getByText(/renamed “Ship it now” to “Ship it”/)).toBeTruthy();
    expect(screen.getByText("Change undone")).toBeTruthy();
  });

  it("filters by kind", async () => {
    const { store, task } = setup();
    const id = createTask(store, { title: "Ship" }, "UTC", ME);
    updateTask(store, task(id), { priority: 2 }, ME);
    await render(<ActivityScreen />, { wrapper: withApp(store, auth) });
    expect(screen.getByText(/created “Ship”/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(/Kinds/));
    await fireEvent.press(screen.getByText("Edits"));
    expect(screen.queryByText(/created “Ship”/)).toBeNull();
    expect(screen.getByText(/set the priority of “Ship”/)).toBeTruthy();
  });

  it("says so when there is nothing yet", async () => {
    const { store } = setup();
    await render(<ActivityScreen target={{ view: "today" }} />, { wrapper: withApp(store, auth) });
    expect(screen.getByText("No activity yet.")).toBeTruthy();
  });
});

describe("ActivityScreen undo rights", () => {
  it("does not offer to undo a move back into a project where I only comment", async () => {
    const store = new LocalStore("test");
    const member = (project: string, user: string, role: string) => {
      const id = `${project}-${user}`;
      store.set("project_member", id, "project_id", project);
      store.set("project_member", id, "user_id", user);
      store.set("project_member", id, "role", role);
      store.set("project_member", id, "state", "active");
    };
    store.set("project", "p1", "name", "Old");
    store.set("project", "p2", "name", "New");
    member("p1", ME, "commenter");
    member("p1", "bo", "owner");
    member("p2", ME, "editor");
    member("p2", "bo", "owner");
    const id = createTask(store, { title: "Moved", project_id: "p1" }, "UTC");
    moveTaskToProject(store, id, { project_id: "p2", section_id: null }, Date.now(), "bo");
    await render(<ActivityScreen />, { wrapper: withApp(store, auth) });
    expect(screen.getByText(/moved “Moved” to New/)).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^Undo:/ })).toHaveLength(0);
  });
});
