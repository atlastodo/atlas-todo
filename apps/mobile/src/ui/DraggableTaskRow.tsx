import { type Task } from "@atlastodo/todo-core";
import type { ReactNode } from "react";

/**
 * Wrap a task row so another row can be dropped on it (to nest it, or on Today to reschedule an
 * overdue one). A native no-op passthrough: on a phone nesting is touch drag-to-indent and the
 * detail composer, rescheduling the swipe sheet. Metro resolves `DraggableTaskRow.web.tsx` for the
 * browser, which wires the real drag source and drop target.
 */
export function DraggableTaskRow({
  children,
}: {
  task: Task;
  onRowDrop: (draggedId: string, target: Task) => void;
  onDragStart?: (taskId: string) => void;
  onDragEnd?: () => void;
  dropHint?: "reschedule";
  children: ReactNode;
}) {
  return <>{children}</>;
}
