import { useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { allTasks, toProject, toSection, type Activity } from "@atlastodo/shared";
import { useStore } from "../data/StoreProvider";
import { AuthContext } from "../auth/AuthContext";
import { useProjectMembers } from "./useProjectMembers";
import { useLabels } from "./useLabels";
import { useFormat } from "./useFormat";
import { describeActivity, type ActivityLookups } from "../lib/activityText";

export interface UseActivityText {
  /** An entry as a sentence fragment, its actor's name left to the caller. */
  describe: (a: Activity) => string;
  /** "You", a collaborator's name, or "Someone". */
  nameOf: (userId: string) => string;
  /** A task's title in quotes, or "a task" once it is gone. */
  taskLabel: (taskId: string) => string;
  /** A project's name, trashed and archived ones included; null when unknown here. */
  projectName: (projectId: string) => string | null;
}

/** Names and wording for activity entries, from the store (`describeActivity`). */
export function useActivityText(): UseActivityText {
  const { t } = useTranslation();
  const { store, version } = useStore();
  const myId = useContext(AuthContext)?.session?.user.id;
  const { byUserId } = useProjectMembers();
  const { byId: labelById } = useLabels();
  const fmt = useFormat();

  // Trashed tasks included: a deleted task's entries still name it.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const taskById = useMemo(() => new Map(allTasks(store).map((x) => [x.id, x])), [store, version]);

  const nameOf = useCallback(
    (userId: string) => {
      if (userId && userId === myId) return t("comment.you");
      const m = byUserId(userId);
      return m?.display_name || m?.email || t("comment.someone");
    },
    [myId, byUserId, t],
  );

  const projectName = useCallback(
    (id: string) => {
      const f = store.get("project", id);
      return f ? toProject(id, f).name || null : null;
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );

  const lookups = useMemo<ActivityLookups>(
    () => ({
      taskTitle: (id) => taskById.get(id)?.title || null,
      projectName,
      sectionName: (id) => {
        const f = store.get("section", id);
        return f ? toSection(id, f).name || null : null;
      },
      labelName: (id) => labelById(id)?.name ?? null,
      personName: nameOf,
    }),
    [taskById, projectName, store, labelById, nameOf],
  );

  const describe = useCallback(
    (a: Activity) => describeActivity(a, t, fmt, lookups),
    [t, fmt, lookups],
  );
  const taskLabel = useCallback(
    (taskId: string) => `“${taskById.get(taskId)?.title || t("activity.aTask")}”`,
    [taskById, t],
  );

  return { describe, nameOf, taskLabel, projectName };
}
