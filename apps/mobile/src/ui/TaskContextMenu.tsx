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
import { MENU_SURFACE, MenuItem, ShortcutHint, useTouchMenu } from "./ContextMenu";
import { hotkeyHint } from "../lib/hotkeyHint";
import { useBackdropSwitch } from "../hooks/useBackdropSwitch";
import { ThemeScope } from "../theme/ThemeProvider";

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
  // Key hints only where there is a keyboard: a desktop pointer, not touch.
  const touch = useTouchMenu();
  const hint = (...args: Parameters<typeof hotkeyHint>) =>
    touch ? undefined : hotkeyHint(...args);
  const rescheduleHint = hint("rescheduleCursor");

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
        <ThemeScope className="flex-1">
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
            className={"w-60 " + MENU_SURFACE}
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
        </ThemeScope>
      </Modal>
    );
  }

  return (
    // A Modal (portaled to the document root on web), not an inline `position: fixed` overlay: a
    // transformed ancestor would scope `fixed` to a sub-region and an outside press would not close it.
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <ThemeScope className="flex-1">
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
          className={"w-60 " + MENU_SURFACE}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <MenuItem
              icon={CircleCheckBig}
              label={task.is_completed ? t("task.reopen") : t("task.complete")}
              shortcut={hint("completeCursor")}
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
            {/* Each flag carries its P1–P3/None label (as the task detail does); the current one gets
              an accent ring, so it doesn't read as a hovered tile. */}
            <View className="flex-row gap-1 px-1 pb-1">
              {PRIORITIES.map((p) => {
                const current = task.priority === p;
                return (
                  <Pressable
                    key={p}
                    accessibilityRole="menuitem"
                    accessibilityLabel={
                      p < 4 ? t("task.priority", { level: p }) : t("taskDetail.priorityNoneDesc")
                    }
                    accessibilityState={{ selected: current }}
                    onPress={() => {
                      onSetPriority(task, p);
                      onClose();
                    }}
                    className={
                      "flex-1 flex-row items-center justify-center gap-1 rounded border web:cursor-pointer " +
                      (touch ? "min-h-[44px] " : "py-1 ") +
                      (current
                        ? "border-accent-500 bg-accent-50 dark:border-accent-400 dark:bg-accent-950/70"
                        : "border-transparent web:hover:bg-neutral-100 dark:web:hover:bg-neutral-800")
                    }
                  >
                    <Flag
                      size={14}
                      className={p < 4 ? (PRIORITY_COLOR[p] ?? "") : "text-neutral-400"}
                    />
                    <Text
                      className={
                        "text-xs " +
                        (current
                          ? "font-semibold text-accent-700 dark:text-accent-200"
                          : "text-neutral-600 dark:text-neutral-300")
                      }
                    >
                      {p < 4 ? `P${p}` : t("taskDetail.priorityNone")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
            {/* T opens the full reschedule picker for the cursor task; the presets below are its shortcuts. */}
            <View className="flex-row items-center justify-between px-2 pb-1">
              <Text className="text-xs font-medium text-neutral-400">{t("context.due")}</Text>
              {rescheduleHint != null && <ShortcutHint keys={rescheduleHint} />}
            </View>
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
              shortcut={hint("copySelection")}
              onPress={() => onCopy(task)}
              onClose={onClose}
            />
            <MenuItem
              icon={CopyPlus}
              label={t("common.duplicate")}
              shortcut={hint("duplicateSelection")}
              onPress={() => onDuplicate(task)}
              onClose={onClose}
            />
            <MenuItem
              icon={Trash2}
              label={t("common.delete")}
              shortcut={hint("deleteCursor", "Del")}
              danger
              onPress={() => onDelete(task)}
              onClose={onClose}
            />
          </ScrollView>
        </View>
      </ThemeScope>
    </Modal>
  );
}
