import { type Task } from "@atlastodo/todo-core";
import { act, render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlastodo/client-core";
import type { ReactNode } from "react";
import { withApp } from "../testutil";
import { GroupedTaskList } from "./GroupedTaskList";

/**
 * Today's drag-to-reschedule: an Overdue row dropped on the Today group moves to today instead of
 * nesting. The drag itself is HTML5 (web only), so the row wrapper and the header's drop hook are
 * replaced with recorders and the test drives their callbacks.
 */

interface RowProps {
  task: Task;
  onRowDrop: (draggedId: string, target: Task) => void;
  onDragStart?: (taskId: string) => void;
  onDragEnd?: () => void;
  dropHint?: "reschedule";
  children: ReactNode;
}
const mockRows = new Map<string, RowProps>();
jest.mock("./DraggableTaskRow", () => ({
  DraggableTaskRow: (props: RowProps) => {
    mockRows.set(props.task.id, props);
    return <>{props.children}</>;
  },
}));

const mockHeaderDrops: ((draggedId: string) => void)[] = [];
jest.mock("../hooks/useCardDnd", () => ({
  useDropTarget: (_ref: unknown, onDrop: (draggedId: string) => void) => {
    mockHeaderDrops.push(onDrop);
    return false;
  },
  useDragSource: () => false,
  useDragLift: () => false,
}));

const NOW = Date.parse("2026-09-23T12:00:00Z");
const DAY = 86_400_000;

function task(overrides: Partial<Task>): Task {
  return {
    id: "t",
    project_id: null,
    section_id: null,
    parent_id: null,
    title: "Task",
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

const noop = () => {};

function List({
  tasks,
  onDropOnToday,
  onReparent,
}: {
  tasks: Task[];
  onDropOnToday?: (task: Task) => void;
  onReparent: (id: string, parentId: string | null, sortOrder: number) => void;
}) {
  return (
    <GroupedTaskList
      tasks={tasks}
      allTasks={tasks}
      now={NOW}
      timeZone="UTC"
      groupBy="date"
      groupTitle={(_kind, key) => `group:${key}`}
      sortBy="manual"
      onToggle={noop}
      onBulkSetPriority={noop}
      onBulkSetDue={noop}
      onBulkSetLabels={noop}
      onBulkClearLabels={noop}
      onBulkDuplicate={noop}
      onBulkDelete={noop}
      onBulkMove={noop}
      onReparent={onReparent}
      onDropOnToday={onDropOnToday}
    />
  );
}

const overdue = task({ id: "late", title: "Late", due_at: NOW - DAY, sort_order: 1 });
const overdue2 = task({ id: "late2", title: "Late 2", due_at: NOW - DAY, sort_order: 2 });
const today = task({ id: "now", title: "Now", due_at: NOW + 3_600_000, sort_order: 3 });
const today2 = task({ id: "now2", title: "Now 2", due_at: NOW + 3_600_000, sort_order: 4 });

beforeEach(() => {
  mockRows.clear();
  mockHeaderDrops.length = 0;
});

describe("GroupedTaskList drop on Today", () => {
  it("reschedules an Overdue row dropped on a Today row instead of nesting it", async () => {
    const onDropOnToday = jest.fn();
    const onReparent = jest.fn();
    await render(
      <List
        tasks={[overdue, today, today2]}
        onDropOnToday={onDropOnToday}
        onReparent={onReparent}
      />,
      { wrapper: withApp(new LocalStore("test")) },
    );

    await act(async () => mockRows.get("late")!.onDragStart?.("late"));
    expect(mockRows.get("now")!.dropHint).toBe("reschedule");
    expect(mockRows.get("late")!.dropHint).toBeUndefined();

    await act(async () => mockRows.get("now")!.onRowDrop("late", today));
    expect(onDropOnToday).toHaveBeenCalledWith(overdue);
    expect(onReparent).not.toHaveBeenCalled();
  });

  it("still nests a drop within the same group", async () => {
    const onDropOnToday = jest.fn();
    const onReparent = jest.fn();
    await render(
      <List
        tasks={[overdue, overdue2, today, today2]}
        onDropOnToday={onDropOnToday}
        onReparent={onReparent}
      />,
      { wrapper: withApp(new LocalStore("test")) },
    );

    await act(async () => mockRows.get("now")!.onRowDrop("now2", today));
    await act(async () => mockRows.get("late2")!.onRowDrop("late", overdue2));
    expect(onDropOnToday).not.toHaveBeenCalled();
    expect(onReparent).toHaveBeenCalledTimes(2);
    expect(onReparent.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ["now2", "now"],
      ["late", "late2"],
    ]);
  });

  it("nests as before when the screen does not opt in", async () => {
    const onReparent = jest.fn();
    await render(<List tasks={[overdue, today]} onReparent={onReparent} />, {
      wrapper: withApp(new LocalStore("test")),
    });

    expect(mockRows.get("late")!.onDragStart).toBeUndefined();
    await act(async () => mockRows.get("now")!.onRowDrop("late", today));
    expect(onReparent).toHaveBeenCalledWith("late", "now", expect.any(Number));
  });

  it("shows an empty Today drop zone while dragging when everything is overdue", async () => {
    const onDropOnToday = jest.fn();
    await render(
      <List tasks={[overdue, overdue2]} onDropOnToday={onDropOnToday} onReparent={noop} />,
      { wrapper: withApp(new LocalStore("test")) },
    );
    expect(screen.queryByText("group:today (0)")).toBeNull();

    await act(async () => mockRows.get("late")!.onDragStart?.("late"));
    expect(screen.getByText("group:today (0)")).toBeTruthy();
    expect(screen.getByText("Drop here to do today")).toBeTruthy();

    // The newest header drop target is the Today one; dropping there reschedules.
    await act(async () => mockHeaderDrops[mockHeaderDrops.length - 1]!("late"));
    expect(onDropOnToday).toHaveBeenCalledWith(overdue);

    await act(async () => mockRows.get("late")!.onDragEnd?.());
    expect(screen.queryByText("group:today (0)")).toBeNull();
  });
});
