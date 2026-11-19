import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  currentPeriod,
  dateKeyFromMs,
  isActiveToday,
  resolveProjectColor,
  type Habit,
} from "@atlastodo/todo-core";
import { useFeature } from "../hooks/useFeature";
import { useHabits } from "../hooks/useHabits";
import { useHabitCheckins } from "../hooks/useHabitCheckins";
import { useHabitDayToggle } from "../hooks/useHabitDayToggle";
import { usePreferences } from "../hooks/usePreferences";
import { projectIconFor } from "./projectIcons";
import { Check, ChevronDown, ChevronRight } from "./icons";

/** A run of today's habits: standalone ones have no `group`, a routine's members share theirs. */
interface HabitBlock {
  group: Habit | null;
  habits: Habit[];
}

const byOrder = (a: Habit, b: Habit) => a.sort_order - b.sort_order || a.created_at - b.created_at;

/**
 * Today's habits, above Today's tasks: every habit in play today (scheduled today, a weekly target
 * not yet met, or already checked today, so ticking one off does not make it vanish), checkable in
 * place with the same tap and undo as the Habits screen. Routines keep their members together under
 * the routine's name, in the Habits screen's order.
 *
 * Renders nothing while the habits feature is off, the `todayHabits` preference is off, or no habit
 * is in play today, so someone who does not use habits never sees it. The fold is a synced
 * preference, like a habit group's.
 */
export function TodayHabits({
  now,
  onOpenHabit,
}: {
  now: number;
  onOpenHabit?: (habit: Habit) => void;
}) {
  const { t } = useTranslation();
  const enabled = useFeature("habits");
  const { todayHabits, todayHabitsCollapsed, setTodayHabitsCollapsed, weekStartsOn } =
    usePreferences();
  const { habits, habitGroups } = useHabits();
  const { statesFor } = useHabitCheckins();
  const toggleDay = useHabitDayToggle();
  const todayKey = dateKeyFromMs(now);

  const blocks = useMemo(() => {
    const due = habits.filter((h) => isActiveToday(h, statesFor(h.id), now, weekStartsOn));
    const out: HabitBlock[] = [];
    const groups = new Map(habitGroups.map((g) => [g.id, g]));
    const members = new Map<string, Habit[]>();
    const standalone: Habit[] = [];
    for (const habit of due) {
      const group = habit.parent_id !== null ? groups.get(habit.parent_id) : undefined;
      if (group === undefined) standalone.push(habit);
      else members.set(group.id, [...(members.get(group.id) ?? []), habit]);
    }
    // Top level in the Habits screen's order: a routine sits where its header does.
    const top = [...standalone, ...habitGroups.filter((g) => members.has(g.id))].sort(byOrder);
    for (const item of top) {
      if (item.kind === "group") {
        out.push({ group: item, habits: (members.get(item.id) ?? []).sort(byOrder) });
      } else {
        const last = out[out.length - 1];
        if (last !== undefined && last.group === null) last.habits.push(item);
        else out.push({ group: null, habits: [item] });
      }
    }
    return out;
    // `todayKey`, not `now`: a per-minute tick does not change what is due.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, habitGroups, statesFor, todayKey, weekStartsOn]);

  if (!enabled || !todayHabits) return null;
  const shown = blocks.flatMap((b) => b.habits);
  if (shown.length === 0) return null;

  // A skipped day is settled, not outstanding: it leaves the count rather than holding "all done" back.
  const counted = shown.filter((h) => statesFor(h.id).get(todayKey) !== "skip");
  const done = counted.filter((h) => statesFor(h.id).get(todayKey) === "done").length;
  const allDone = done === counted.length;
  const progress = allDone
    ? t("habits.todayAllDone")
    : t("habits.todayProgress", { done, total: counted.length });
  const title = t("habits.todaySection");

  return (
    <View className="pb-1">
      <View className="flex-row items-center px-4 pb-1 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !todayHabitsCollapsed }}
          accessibilityLabel={t(todayHabitsCollapsed ? "habits.todayShow" : "habits.todayHide")}
          onPress={() => setTodayHabitsCollapsed(!todayHabitsCollapsed)}
          className="flex-1 flex-row items-center gap-1.5 web:cursor-pointer"
        >
          {todayHabitsCollapsed ? (
            <ChevronRight size={14} className="text-neutral-500" />
          ) : (
            <ChevronDown size={14} className="text-neutral-500" />
          )}
          <Text className="text-xs font-medium uppercase text-neutral-500">{title}</Text>
          <Text
            className={
              "text-xs " + (allDone ? "text-accent-600 dark:text-accent-400" : "text-neutral-500")
            }
          >
            · {progress}
          </Text>
        </Pressable>
      </View>

      {!todayHabitsCollapsed &&
        blocks.map((block) => (
          <View key={block.group?.id ?? block.habits[0]!.id}>
            {block.group !== null && <GroupLabel group={block.group} />}
            {block.habits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                state={statesFor(habit.id).get(todayKey)}
                period={currentPeriod(habit, statesFor(habit.id), now, weekStartsOn)}
                indented={block.group !== null}
                onToggle={() => toggleDay(habit, todayKey)}
                onOpen={onOpenHabit ? () => onOpenHabit(habit) : undefined}
              />
            ))}
          </View>
        ))}
    </View>
  );
}

function GroupLabel({ group }: { group: Habit }) {
  const Icon = projectIconFor(group.icon);
  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-0.5 pt-2">
      <Icon size={12} color={resolveProjectColor(group)} />
      <Text numberOfLines={1} className="text-xs font-medium text-neutral-500">
        {group.name}
      </Text>
    </View>
  );
}

function HabitRow({
  habit,
  state,
  period,
  indented,
  onToggle,
  onOpen,
}: {
  habit: Habit;
  state: string | undefined;
  period: ReturnType<typeof currentPeriod>;
  indented: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = projectIconFor(habit.icon);
  const isDone = state === "done";
  // A daily habit's period is today, so "1 of 1" would only restate the check.
  const showPeriod = habit.goal_kind !== "daily" && period !== null && period.target > 0;
  return (
    <View className={"flex-row items-center gap-3 py-1.5 pr-4 " + (indented ? "pl-8" : "pl-4")}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(isDone ? "habits.markNotDone" : "habits.markDone", {
          name: habit.name,
        })}
        accessibilityState={{ checked: isDone }}
        onPress={onToggle}
        hitSlop={6}
        className={
          "h-6 w-6 items-center justify-center rounded-full border-2 web:cursor-pointer " +
          (isDone
            ? "border-transparent"
            : state === "skip"
              ? "border-dashed border-neutral-400 dark:border-neutral-500"
              : "border-neutral-300 dark:border-neutral-600")
        }
        style={isDone ? { backgroundColor: habit.color } : undefined}
      >
        {isDone && <Check size={14} className="text-white" />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("habits.open", { name: habit.name })}
        onPress={onOpen}
        disabled={onOpen === undefined}
        className="min-w-0 flex-1 flex-row items-center gap-2 web:cursor-pointer"
      >
        <Icon size={14} color={habit.color} />
        <Text
          numberOfLines={1}
          className={
            "flex-1 text-sm " +
            (isDone || state === "skip"
              ? "text-neutral-400 dark:text-neutral-500"
              : "text-neutral-800 dark:text-neutral-100")
          }
        >
          {habit.name}
        </Text>
        {showPeriod && (
          <Text className="text-xs text-neutral-500">
            {t("habits.periodProgress", { done: period.done, target: period.target })}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
