import { type Task } from "@atlastodo/todo-core";
import { useRef, type ReactNode } from "react";
import { View, type ViewInstance } from "react-native";
import { useTranslation } from "react-i18next";

import { useDragSource, useDropTarget } from "../hooks/useCardDnd";
import { useCanHover } from "../hooks/useCanHover";
import { GripVertical } from "./icons";

/**
 * The web row drag wrapper: drag one row's grip onto another (HTML5 drag via `useCardDnd`, like the
 * board's `DraggableCard`). The drag source is a dedicated grip, not the row: native HTML5 drag
 * starts immediately and would fight the reorder pan. The whole row is a drop target.
 *
 * What a drop means is the caller's `onRowDrop`: usually nesting (`reparentTask`, cycle-guarded),
 * shown with a "nest here" ring; on Today, an Overdue row dropped on a Today row reschedules it,
 * and the caller marks those rows with `dropHint="reschedule"`, a section-wide tint instead of the
 * ring. Native uses the no-op `DraggableTaskRow.tsx`.
 */
export function DraggableTaskRow({
  task,
  onRowDrop,
  onDragStart,
  onDragEnd,
  dropHint,
  children,
}: {
  task: Task;
  onRowDrop: (draggedId: string, target: Task) => void;
  /** This row's grip started a drag. */
  onDragStart?: (taskId: string) => void;
  /** This row's drag ended, dropped or cancelled. */
  onDragEnd?: () => void;
  /** A drop here reschedules rather than nests: tint the row as part of the target section. */
  dropHint?: "reschedule";
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<ViewInstance>(null);
  const handleRef = useRef<ViewInstance>(null);
  const over = useDropTarget(rowRef, (draggedId) => {
    if (draggedId !== task.id) onRowDrop(draggedId, task);
  });
  const canHover = useCanHover();
  // `enabled` re-binds the grip when it mounts (a mouse attached after load).
  const dragging = useDragSource(handleRef, () => task.id, {
    enabled: canHover,
    onDragStart: () => onDragStart?.(task.id),
    onDragEnd,
  });

  return (
    <View ref={rowRef} className="group relative">
      {children}

      {/* Hover-only: on touch the grip would stick visible after a tap at the clipped right edge. */}
      {canHover && (
        <View
          ref={handleRef}
          accessible
          accessibilityLabel={t("task.dragToNest")}
          className={
            "absolute bottom-0 right-0 top-0 w-6 items-center justify-center opacity-0 group-hover:opacity-100 web:cursor-grab " +
            (dragging ? "opacity-100" : "")
          }
        >
          <GripVertical size={14} className="text-neutral-500" />
        </View>
      )}

      {dropHint === "reschedule" ? (
        <View
          style={{ pointerEvents: "none" }}
          className={"absolute inset-0 " + (over ? "bg-accent-500/20" : "bg-accent-500/10")}
        />
      ) : (
        over &&
        !dragging && (
          <View
            style={{ pointerEvents: "none" }}
            className="absolute inset-0 rounded border-2 border-accent-500 bg-accent-50 dark:bg-accent-950"
          />
        )
      )}
    </View>
  );
}
