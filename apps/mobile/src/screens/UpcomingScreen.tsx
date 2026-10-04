import { useMemo } from "react";
import type { Task } from "@atlas/client-core";
import { endOfDay, upcomingTasks } from "@atlas/shared";
import { useTaskListView } from "../hooks/useTaskListView";
import { QuickAddTaskList } from "./ViewTaskList";

/**
 * Upcoming: everything due after today, grouped by day (`upcomingTasks` plus `groupTasks`' `date`
 * mode); the choice is changeable and syncs. Navigation is injected: importing expo-router's
 * `router` into a screen drags its dev-server lookup into every test that renders it.
 */

export interface UpcomingScreenProps {
  onOpenTask?: (task: Task) => void;
}

export function UpcomingScreen({ onOpenTask }: UpcomingScreenProps = {}) {
  const view = useTaskListView("upcoming", { group: "date", sort: "manual" });

  const tasks = useMemo(
    () => upcomingTasks(view.tasks, view.now, view.timeZone),
    [view.tasks, view.now, view.timeZone],
  );

  return (
    <QuickAddTaskList
      view={view}
      tasks={tasks}
      onOpenTask={onOpenTask}
      quickAddDefaults={{ due_at: endOfDay(view.now + 86_400_000, view.timeZone) }}
    />
  );
}
