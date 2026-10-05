import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Task } from "@atlas/client-core";
import { TaskContextMenu } from "./TaskContextMenu";

/** A minimal open task; each test only cares about a couple of fields. */
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    project_id: null,
    section_id: null,
    parent_id: null,
    title: "Buy milk",
    notes: "",
    priority: 4,
    start_at: null,
    due_at: null,
    is_completed: false,
    completed_at: null,
    archived_at: null,
    deleted_at: null,
    recurrence: null,
    assignee_id: null,
    estimate_min: null,
    label_ids: [],
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

const NOW = Date.parse("2026-07-17T12:00:00Z");

async function renderMenu(overrides: Partial<React.ComponentProps<typeof TaskContextMenu>> = {}) {
  const props = {
    task: task(),
    x: 10,
    y: 10,
    now: NOW,
    onClose: jest.fn(),
    onToggle: jest.fn(),
    onSetPriority: jest.fn(),
    onSetDue: jest.fn(),
    onCopy: jest.fn(),
    onDuplicate: jest.fn(),
    onDelete: jest.fn(),
    onSelect: jest.fn(),
    ...overrides,
  };
  await render(<TaskContextMenu {...props} />);
  return props;
}

describe("TaskContextMenu", () => {
  it("completes the task and closes", async () => {
    const props = await renderMenu();
    await fireEvent.press(screen.getByLabelText("Complete task"));
    expect(props.onToggle).toHaveBeenCalledWith(props.task);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("skips a recurring task's occurrence when onSkip is wired", async () => {
    const props = await renderMenu({
      task: task({ recurrence: "FREQ=DAILY", due_at: NOW }),
      onSkip: jest.fn(),
    });
    await fireEvent.press(screen.getByLabelText("Skip occurrence"));
    expect(props.onSkip).toHaveBeenCalledWith(props.task);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("offers no Skip for non-recurring, completed, or undated tasks", async () => {
    await renderMenu({ task: task({ due_at: NOW }), onSkip: jest.fn() });
    expect(screen.queryByLabelText("Skip occurrence")).toBeNull();

    await renderMenu({
      task: task({ recurrence: "FREQ=DAILY", due_at: NOW, is_completed: true }),
      onSkip: jest.fn(),
    });
    expect(screen.queryByLabelText("Skip occurrence")).toBeNull();

    await renderMenu({ task: task({ recurrence: "FREQ=DAILY" }), onSkip: jest.fn() });
    expect(screen.queryByLabelText("Skip occurrence")).toBeNull();
  });

  it("labels each priority and marks the current one", async () => {
    const props = await renderMenu({ task: task({ priority: 2 }) });
    for (const text of ["P1", "P2", "P3", "None"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByLabelText("Priority 2").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("No priority").props.accessibilityState.selected).toBe(false);

    await fireEvent.press(screen.getByLabelText("No priority"));
    expect(props.onSetPriority).toHaveBeenCalledWith(props.task, 4);
  });

  it("schedules to a preset and clears the date", async () => {
    const props = await renderMenu();
    await fireEvent.press(screen.getByLabelText("Today"));
    expect(props.onSetDue).toHaveBeenCalledWith(props.task, expect.any(Number));

    await fireEvent.press(screen.getByLabelText("No date"));
    expect(props.onSetDue).toHaveBeenCalledWith(props.task, null);
  });

  it("offers Outdent only for a subtask (canOutdent)", async () => {
    const onOutdent = jest.fn();
    // A top-level task cannot outdent -> no item.
    await renderMenu({ onOutdent, canOutdent: false });
    expect(screen.queryByLabelText("Outdent")).toBeNull();

    // A subtask can.
    const props = await renderMenu({ onOutdent, canOutdent: true, task: task({ parent_id: "p" }) });
    await fireEvent.press(screen.getByLabelText("Outdent"));
    expect(onOutdent).toHaveBeenCalledWith(props.task);
  });

  it("offers Indent only when there is a sibling to nest under (canIndent)", async () => {
    await renderMenu({ onIndent: jest.fn(), canIndent: false });
    expect(screen.queryByLabelText("Indent (make subtask)")).toBeNull();
  });

  it("shows no Indent/Outdent when the list does not support nesting", async () => {
    await renderMenu();
    expect(screen.queryByLabelText("Indent (make subtask)")).toBeNull();
    expect(screen.queryByLabelText("Outdent")).toBeNull();
  });

  it("offers only Select on a task this device cannot decrypt", async () => {
    // Complete, priority, due, copy, duplicate, indent and delete all wrote (or copied) a task
    // whose fields are placeholders here.
    const props = await renderMenu({
      task: task({ title: "", locked: true }),
      onIndent: jest.fn(),
      onOutdent: jest.fn(),
      canOutdent: true,
    });
    expect(screen.getByText("Encrypted task — key not available")).toBeTruthy();
    for (const label of [
      "Complete task",
      "Copy",
      "Duplicate",
      "Delete",
      "Today",
      "Indent (make subtask)",
    ]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    await fireEvent.press(screen.getByRole("menuitem", { name: "Select" }));
    expect(props.onSelect).toHaveBeenCalledWith(props.task);
  });
});
