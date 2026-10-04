import { useMemo } from "react";
import type { Task } from "@atlas/client-core";
import { inboxTasks } from "@atlas/shared";
import { useTaskListView } from "../hooks/useTaskListView";
import { QuickAddTaskList } from "./ViewTaskList";

/** Inbox: active tasks with no project (`inboxTasks`). Quick-add needs no `due_at` default: a project-less task is what Inbox holds. */

export interface InboxScreenProps {
  onOpenTask?: (task: Task) => void;
}

export function InboxScreen({ onOpenTask }: InboxScreenProps = {}) {
  const view = useTaskListView("inbox");
  const tasks = useMemo(() => inboxTasks(view.tasks), [view.tasks]);

  return <QuickAddTaskList view={view} tasks={tasks} onOpenTask={onOpenTask} />;
}
