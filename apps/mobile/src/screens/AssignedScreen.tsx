import { useMemo } from "react";
import type { Task } from "@atlas/client-core";
import { assignedToMe } from "@atlas/shared";
import { useAuth } from "../auth/AuthContext";
import { useTaskListView } from "../hooks/useTaskListView";
import { ViewTaskList } from "./ViewTaskList";

/**
 * Assigned to me: open tasks whose assignee is the current user (`assignedToMe(tasks, userId)`).
 * The user id comes from the session; with none the list is empty. No quick-add: a new task has no
 * assignee and would not appear here. Assigning happens in the task's detail.
 */

export interface AssignedScreenProps {
  onOpenTask?: (task: Task) => void;
}

export function AssignedScreen({ onOpenTask }: AssignedScreenProps = {}) {
  const { session } = useAuth();
  const view = useTaskListView("assigned");
  const myId = session?.user.id;

  const tasks = useMemo(() => (myId ? assignedToMe(view.tasks, myId) : []), [view.tasks, myId]);

  return <ViewTaskList view={view} tasks={tasks} onOpenTask={onOpenTask} />;
}
