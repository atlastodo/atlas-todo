import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { Priority, Task } from "@atlas/client-core";
import { PRIORITY_COLOR, quickScheduleOptions, type QuickScheduleOption } from "@atlas/shared";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Copy,
  CopyPlus,
  Flag,
  ListChecks,
  SkipForward,
  Trash2,
  X,
} from "./icons";
import { clampMenuPosition, type Size } from "../lib/menuPosition";
import { MenuItem } from "./ContextMenu";
import { useBackdropSwitch } from "../hooks/useBackdropSwitch";

/**
 * A desktop right-click context menu for a task, rendered by `GroupedTaskList` only when a
 * `contextmenu` event fired (web only). Positioned at the cursor over a backdrop that closes it.
 * Actions reuse the callbacks the list already wires.
 */

const PRIORITIES: Priority[] = [1, 2, 3, 4];
// Keyed on the option's own key type so a new `quickScheduleOptions` preset breaks the build here instead of falling back to the wrong label.
const SCHEDULE_LABEL: Record<QuickScheduleOption["key"], string> = {
  today: "task.scheduleToday",
  tomorrow: "task.scheduleTomorrow",
  weekend: "task.scheduleWeekend",
  nextWeek: "task.scheduleNextWeek",
};

export interface TaskContextMenuProps {
  task: Task;
  x: number;
  y: number;
  now: number;
  timeZone?: string;
  onClose: () => void;
  onToggle: (task: Task) => void;
  /** Skip the current occurrence. Absent means no Skip item; shown for open recurring tasks with a due date. */
  onSkip?: (task: Task) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onSetDue: (task: Task, dueAt: number | null) => void;
  onCopy: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Enter multi-select with this task selected. Absent means no Select item (the board has no selection toolbar). */
  onSelect?: (task: Task) => void;
  onIndent?: (task: Task) => void;
  canIndent?: boolean;
  onOutdent?: (task: Task) => void;
  canOutdent?: boolean;
  /** Start moving the card to another board column (tap-to-move for touch, where cards can't be dragged across columns). */
  onMoveToColumn?: (task: Task) => void;
}

export function TaskContextMenu({
  task,
  x,
  y,
  now,
  timeZone,
  onClose,
  onToggle,
  onSkip,
  onSetPriority,
  onSetDue,
  onCopy,
  onDuplicate,
  onDelete,
  onSelect,
  onIndent,
  canIndent = false,
  onOutdent,
  canOutdent = false,
  onMoveToColumn,
}: TaskContextMenuProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();

  // Web only. Guarded on a real DOM `window`: the RN runtime and jest may expose a partial `window` without `addEventListener`.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Positioned against the measured menu size: placed at the raw point and hidden until the first
  // `onLayout`, then revealed clamped/flipped so it is fully on screen.
  const [size, setSize] = useState<Size | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const placed = size ? clampMenuPosition({ x, y }, size, { width, height }) : { x, y };
  // On web a right-click on the backdrop routes to the task row beneath, so the menu switches in one click.
  const backdropRef = useBackdropSwitch(onClose);

  if (task.locked) {
    // An undecryptable task is read-only: every other action writes it (Copy would copy a blank).
    return (
      <Modal transparent visible animationType="fade" onRequestClose={onClose}>
        <Pressable
          ref={backdropRef}
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          accessibilityLabel={t("context.title")}
          onLayout={onLayout}
          style={{ position: "absolute", left: placed.x, top: placed.y, opacity: size ? 1 : 0 }}
          className="w-56 overflow-hidden rounded-md border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
        >
          <Text className="px-2 py-1.5 text-sm italic text-neutral-400">
            {t("task.lockedTitle")}
          </Text>
          {onSelect && (
            <MenuItem
              icon={ListChecks}
              label={t("selection.select")}
              onPress={() => onSelect(task)}
              onClose={onClose}
            />
          )}
        </View>
      </Modal>
    );
  }

  return (
    // A Modal (portaled to the document root on web), not an inline `position: fixed` overlay: a
    // transformed ancestor would scope `fixed` to a sub-region and an outside press would not close it.
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {/* Backdrop: an outside tap/click closes the menu; a right-click (web) switches to the row
          beneath instead of showing the browser's own menu. */}
      <Pressable
        ref={backdropRef}
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        accessibilityLabel={t("context.title")}
        onLayout={onLayout}
        style={{
          position: "absolute",
          left: placed.x,
          top: placed.y,
          maxHeight: height - 8,
          opacity: size ? 1 : 0,
        }}
        className="w-56 overflow-hidden rounded-md border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <MenuItem
            icon={CircleCheckBig}
            label={task.is_completed ? t("task.reopen") : t("task.complete")}
            onPress={() => onToggle(task)}
            onClose={onClose}
          />

          {/* Skip this occurrence: push the due date to the series' next slot without completing --
              the instance-scoped recurring action, distinct from the Complete above. */}
          {onSkip && !task.is_completed && task.recurrence && task.due_at != null && (
            <MenuItem
              icon={SkipForward}
              label={t("task.skipOccurrence")}
              onPress={() => onSkip(task)}
              onClose={onClose}
            />
          )}

          {onSelect && (
            <MenuItem
              icon={ListChecks}
              label={t("selection.select")}
              onPress={() => onSelect(task)}
              onClose={onClose}
            />
          )}

          {/* Indent / outdent: the touch path to nesting (the reliable complement to the drag
              indent), shown only where the list supports subtasks. */}
          {onIndent && canIndent && (
            <MenuItem
              icon={ChevronRight}
              label={t("task.indent")}
              onPress={() => onIndent(task)}
              onClose={onClose}
            />
          )}
          {onOutdent && canOutdent && (
            <MenuItem
              icon={ChevronLeft}
              label={t("task.outdent")}
              onPress={() => onOutdent(task)}
              onClose={onClose}
            />
          )}

          {onMoveToColumn && !task.is_completed && (
            <MenuItem
              icon={ArrowRightLeft}
              label={t("board.moveToColumn")}
              onPress={() => onMoveToColumn(task)}
              onClose={onClose}
            />
          )}

          <View className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <Text className="px-2 pb-1 text-xs font-medium text-neutral-400">
            {t("context.priority")}
          </Text>
          <View className="flex-row gap-1 px-1 pb-1">
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="menuitem"
                accessibilityLabel={t("task.priority", { level: p })}
                accessibilityState={{ selected: task.priority === p }}
                onPress={() => {
                  onSetPriority(task, p);
                  onClose();
                }}
                className={
                  "flex-1 items-center justify-center rounded py-1 web:cursor-pointer " +
                  (task.priority === p ? "bg-neutral-100 dark:bg-neutral-800" : "")
                }
              >
                <Flag
                  size={16}
                  className={p < 4 ? (PRIORITY_COLOR[p] ?? "") : "text-neutral-400"}
                />
              </Pressable>
            ))}
          </View>

          <View className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <Text className="px-2 pb-1 text-xs font-medium text-neutral-400">{t("context.due")}</Text>
          {quickScheduleOptions(now, timeZone).map((o) => (
            <MenuItem
              key={o.key}
              icon={CalendarDays}
              label={t(SCHEDULE_LABEL[o.key])}
              onPress={() => onSetDue(task, o.dueAt)}
              onClose={onClose}
            />
          ))}
          <MenuItem
            icon={X}
            label={t("task.scheduleNoDate")}
            onPress={() => onSetDue(task, null)}
            onClose={onClose}
          />

          <View className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <MenuItem
            icon={Copy}
            label={t("selection.copy")}
            onPress={() => onCopy(task)}
            onClose={onClose}
          />
          <MenuItem
            icon={CopyPlus}
            label={t("common.duplicate")}
            onPress={() => onDuplicate(task)}
            onClose={onClose}
          />
          <MenuItem
            icon={Trash2}
            label={t("common.delete")}
            danger
            onPress={() => onDelete(task)}
            onClose={onClose}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
