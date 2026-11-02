import { useCallback, useMemo } from "react";
import { listActivities, type Activity } from "@atlastodo/shared";
import { useStore } from "../data/StoreProvider";

/**
 * Read-only view of `activity` entities: task changes written by the task rules (`useLocalTasks`)
 * and project, section and member events written by their hooks. Kinds this version does not know
 * (a newer app's) are left out.
 */

export interface UseActivities {
  /** Every entry, newest first. */
  activities: Activity[];
  /** Activity entries for a task, oldest first. */
  forTask: (taskId: string) => Activity[];
}

export function useActivities(): UseActivities {
  const { store } = useStore();
  // Keyed on the activity revision, so task edits that write no entry do not re-derive.
  const revision = store.revision("activity");

  const activities = useMemo(
    () => listActivities(store),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [store, revision],
  );

  const forTask = useCallback(
    (taskId: string) =>
      activities.filter((a) => a.task_id === taskId).sort((a, b) => a.created_at - b.created_at),
    [activities],
  );

  return { activities, forTask };
}
