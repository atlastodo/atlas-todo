import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  addDays,
  completedStreak,
  completionsByDay,
  completionsByProject,
  completionsByWeek,
  dateKeyFromMs,
  formatDuration,
  shiftDateKey,
  totalCompleted,
  type Habit,
} from "@atlas/shared";
import type { LucideIcon } from "../ui/icons";
import { CircleCheckBig, Flame, Timer } from "../ui/icons";
import { BarChart } from "../ui/BarChart";
import { BreakdownRow } from "../ui/BreakdownRow";
import { ScreenFade } from "../ui/ScreenFade";
import { SectionHeading } from "../ui/SectionHeading";
import { useLocalTasks } from "../hooks/useLocalTasks";
import { useProjects } from "../hooks/useProjects";
import { useHabits } from "../hooks/useHabits";
import { useHabitCheckins } from "../hooks/useHabitCheckins";
import { useFocusSessions } from "../hooks/useFocusSessions";
import { usePreferences } from "../hooks/usePreferences";
import { useFeature } from "../hooks/useFeature";

/**
 * Productivity stats: headline metrics, a completions chart over a selectable range, a per-project
 * breakdown, and habit check-ins. Gated behind the `stats` feature toggle at the route. `now` is
 * injectable. Charts come from `ui/BarChart`.
 */

const RANGES = [
  { days: 7, labelKey: "stats.range7" },
  { days: 30, labelKey: "stats.range30" },
  { days: 90, labelKey: "stats.range90" },
];

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    // Grouped, so a screen reader announces "12, completed in 30 days" as one.
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      className="flex-1 flex-row items-center gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <Icon size={24} className={accent} />
      <View className="flex-1">
        <Text className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {value}
        </Text>
        <Text className="text-xs text-neutral-500">{label}</Text>
      </View>
    </View>
  );
}

export function StatsScreen({ now }: { now?: number }) {
  const { t } = useTranslation();
  const nowMs = now ?? Date.now();
  const [rangeDays, setRangeDays] = useState(30);
  const { tasks } = useLocalTasks();
  const { projects } = useProjects();
  const { habits, habitGroups } = useHabits();
  const { statesFor } = useHabitCheckins();
  const { sessions } = useFocusSessions();
  const { weekStartsOn, focusEnabled, timezone } = usePreferences();
  const timeZone = timezone || undefined;
  const habitsEnabled = useFeature("habits");

  const { fromMs, toMs } = useMemo(
    () => ({
      fromMs: addDays(nowMs, -(rangeDays - 1), timeZone),
      toMs: addDays(nowMs, 1, timeZone) - 1,
    }),
    [nowMs, rangeDays, timeZone],
  );

  const projectName = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) =>
      id === null ? t("stats.inbox") : (byId.get(id) ?? t("stats.unknownProject"));
  }, [projects, t]);

  const total = useMemo(() => totalCompleted(tasks, fromMs, toMs), [tasks, fromMs, toMs]);
  const streak = useMemo(() => completedStreak(tasks, nowMs, timeZone), [tasks, nowMs, timeZone]);
  const focusedMs = useMemo(
    () =>
      sessions
        .filter((s) => s.started_at >= fromMs && s.started_at <= toMs)
        .reduce((sum, s) => sum + s.duration_ms, 0),
    [sessions, fromMs, toMs],
  );

  const weekly = rangeDays > 45;
  const chart = useMemo(() => {
    if (weekly) {
      return completionsByWeek(tasks, fromMs, toMs, weekStartsOn, timeZone).map((w) => w.count);
    }
    return completionsByDay(tasks, fromMs, toMs, timeZone).map((d) => d.count);
  }, [tasks, fromMs, toMs, weekly, weekStartsOn, timeZone]);

  const byProject = useMemo(() => completionsByProject(tasks, fromMs, toMs), [tasks, fromMs, toMs]);
  const maxProject = Math.max(1, ...byProject.map((p) => p.count));

  // Day keys, not instants: that is how a check-in is identified, and `fromMs`/`toMs` would drift at the range's edges.
  const habitCheckins = useMemo(() => {
    const toKey = dateKeyFromMs(nowMs);
    const fromKey = shiftDateKey(toKey, -(rangeDays - 1));
    return habits
      .map((habit) => {
        let count = 0;
        for (const [date, state] of statesFor(habit.id)) {
          if (state === "done" && date >= fromKey && date <= toKey) count++;
        }
        return { habit, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [habits, statesFor, nowMs, rangeDays]);
  const maxHabit = Math.max(1, ...habitCheckins.map((h) => h.count));

  /**
   * The same rows grouped under each habit's routine (`useHabits().habits` excludes groups).
   * Blocks and members are ordered by count; a routine with no check-ins in the range is dropped.
   */
  const habitBlocks = useMemo(() => {
    const byId = new Map(habitCheckins.map((h) => [h.habit.id, h]));
    const blocks: {
      group: Habit | null;
      count: number;
      rows: { habit: Habit; count: number }[];
    }[] = [];
    for (const group of habitGroups) {
      const rows = habitCheckins.filter((h) => h.habit.parent_id === group.id);
      if (rows.length === 0) continue;
      blocks.push({ group, count: rows.reduce((sum, r) => sum + r.count, 0), rows });
    }
    for (const row of habitCheckins) {
      const parent = row.habit.parent_id;
      // Orphans (a member whose group was purged elsewhere) rank at the top level, like `flattenHabitGroups`.
      if (parent !== null && habitGroups.some((g) => g.id === parent)) continue;
      blocks.push({ group: null, count: row.count, rows: [byId.get(row.habit.id) ?? row] });
    }
    return blocks.sort((a, b) => b.count - a.count);
  }, [habitCheckins, habitGroups]);

  return (
    <ScreenFade>
      <ScrollView
        className="flex-1 bg-white dark:bg-zinc-950"
        contentContainerClassName="gap-6 p-4"
      >
        <View className="flex-row items-center gap-2">
          {RANGES.map((r) => {
            const active = rangeDays === r.days;
            return (
              <Pressable
                key={r.days}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(r.labelKey)}
                onPress={() => setRangeDays(r.days)}
                className={
                  "rounded-md px-3 py-1 " +
                  (active ? "bg-accent-600" : "border border-neutral-200 dark:border-neutral-800")
                }
              >
                <Text
                  className={
                    "text-sm " + (active ? "text-white" : "text-neutral-600 dark:text-neutral-300")
                  }
                >
                  {t(r.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row gap-3">
          <StatCard
            icon={CircleCheckBig}
            label={t("stats.completedInDays", { days: rangeDays })}
            value={String(total)}
            accent="text-emerald-500"
          />
          <StatCard
            icon={Flame}
            label={t("stats.currentStreak")}
            value={t("stats.streak", { count: streak })}
            accent="text-orange-500"
          />
        </View>
        {/* Focused time comes from Pomodoro; hide it entirely when focus is disabled. */}
        {focusEnabled && (
          <StatCard
            icon={Timer}
            label={t("stats.focusedTime")}
            value={formatDuration(focusedMs)}
            accent="text-accent-500"
          />
        )}

        <View>
          <SectionHeading>{weekly ? t("stats.perWeek") : t("stats.perDay")}</SectionHeading>
          <BarChart values={chart} ariaLabel={t("stats.overTime")} />
        </View>

        <View>
          <SectionHeading>{t("stats.byProject")}</SectionHeading>
          {byProject.length === 0 ? (
            <Text className="text-sm text-neutral-400">{t("stats.noCompletions")}</Text>
          ) : (
            <View className="gap-1.5">
              {byProject.map((p) => (
                <BreakdownRow
                  key={p.projectId ?? "inbox"}
                  label={projectName(p.projectId)}
                  count={p.count}
                  max={maxProject}
                />
              ))}
            </View>
          )}
        </View>

        {habitsEnabled && habitCheckins.length > 0 && (
          <View>
            <SectionHeading>{t("stats.habits")}</SectionHeading>
            <View className="gap-1.5">
              {habitBlocks.map((block) => (
                <View key={block.group?.id ?? block.rows[0]!.habit.id} className="gap-1.5">
                  {block.group !== null && (
                    <BreakdownRow
                      label={block.group.name}
                      count={block.count}
                      max={maxHabit}
                      tint={block.group.color}
                    />
                  )}
                  {block.rows.map(({ habit, count }) => (
                    <BreakdownRow
                      key={habit.id}
                      label={habit.name}
                      count={count}
                      max={maxHabit}
                      tint={habit.color}
                      indent={block.group !== null}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenFade>
  );
}
