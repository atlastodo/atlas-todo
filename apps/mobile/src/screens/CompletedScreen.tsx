import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Task } from "@atlas/client-core";
import { completedHistory } from "@atlas/shared";
import { useTaskListView } from "../hooks/useTaskListView";
import { useProjects } from "../hooks/useProjects";
import { GroupedTaskList } from "../ui/GroupedTaskList";
import { ListPicker, type PickerOption } from "../ui/ListPicker";
import { bulkHandlers } from "./ViewTaskList";

/**
 * Completed: completed tasks grouped by completion time (This week / This month / Older), newest
 * first, with a header filter bar for search (title) and project. Unchecking a row reopens it.
 * No quick-add and no group/sort menu.
 *
 * Passes no `allTasks`, so it keeps the un-widened behaviour: widening would put open subtasks and
 * open parents into a history view. Completed parent and child still nest.
 */

export interface CompletedScreenProps {
  onOpenTask?: (task: Task) => void;
}

export function CompletedScreen({ onOpenTask }: CompletedScreenProps = {}) {
  const { t } = useTranslation();
  const view = useTaskListView("completed");
  const { projects } = useProjects();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const tasks = useMemo(() => {
    const list = completedHistory(view.tasks, query);
    return projectFilter ? list.filter((task) => task.project_id === projectFilter) : list;
  }, [view.tasks, query, projectFilter]);

  const projectOptions = useMemo<PickerOption<string>[]>(
    () => [
      { value: "", label: t("workspace.allProjects") },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects, t],
  );

  const header = (
    <View className="gap-2 px-3 py-3 web:w-full web:max-w-2xl">
      <TextInput
        accessibilityLabel={t("stats.search")}
        placeholder={t("stats.search")}
        placeholderTextColor="#a1a1aa"
        value={query}
        onChangeText={setQuery}
        className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 dark:border-neutral-800 dark:text-neutral-100"
      />
      <ListPicker
        label={t("workspace.projectFilter")}
        value={projectFilter}
        options={projectOptions}
        onChange={setProjectFilter}
      />
    </View>
  );

  return (
    <GroupedTaskList
      tasks={tasks}
      now={view.now}
      timeZone={view.timeZone}
      groupBy="completed"
      groupTitle={view.groupTitle}
      sortBy="manual"
      onToggle={view.toggle}
      onOpen={onOpenTask}
      onReschedule={view.reschedule}
      formatDue={view.formatDue}
      {...bulkHandlers(view)}
      onUpdateTask={view.update}
      onDiscardTask={view.discard}
      header={header}
      initialCollapsedKeys={["thisMonth", "older"]}
      emptyLabel={t("workspace.emptyCompleted")}
    />
  );
}
