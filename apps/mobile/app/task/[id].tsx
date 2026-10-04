import { useCallback, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { Stack, router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/AuthContext";
import { useLocalTasks } from "../../src/hooks/useLocalTasks";
import { useToast } from "../../src/data/ToastProvider";
import { useIsWide } from "../../src/hooks/useIsWide";
import { useDismissKeyboardOnOpen } from "../../src/hooks/useDismissKeyboardOnOpen";
import { TaskDetailScreen } from "../../src/screens/TaskDetailScreen";
import { TaskDetailWebFrame } from "../../src/screens/TaskDetailWebFrame";
import { taskDetailScreenOptions } from "../../src/screens/taskDetailOptions";
import { EmptyState } from "../../src/ui/EmptyState";
import { CircleAlert } from "../../src/ui/icons";
import { CrashScreen } from "../../src/ui/CrashScreen";
import { useAutoReport } from "../../src/hooks/useAutoReport";
import { useProjects } from "../../src/hooks/useProjects";
import { useAllSections } from "../../src/hooks/useAllSections";
import { useLabels } from "../../src/hooks/useLabels";
import { usePreferences } from "../../src/hooks/usePreferences";
import { useNow } from "../../src/hooks/useNow";
import { MoveToPicker } from "../../src/ui/MoveToPicker";
import { KeyboardPinnedTaskAdd } from "../../src/ui/KeyboardPinnedTaskAdd";

/**
 * One task's detail, as a pushed route, so the back gesture and hardware button work and the task
 * has a real URL for deep links.
 *
 * It is presented as a `transparentModal` (the list stays mounted behind) and laid out by width in
 * `TaskDetailWebFrame`: a right-side drawer when wide, a full-screen panel when narrow. The
 * navigation options are constant (see `taskDetailScreenOptions`) so a resize never leaves a stale
 * presentation.
 *
 * The screen is keyed by task id, so title/notes buffers start fresh when moving between tasks.
 */
export default function TaskRoute() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const {
    tasks,
    create,
    toggle,
    skip,
    update,
    updateRecurring,
    setArchived,
    remove,
    restore,
    duplicate,
    discard,
  } = useLocalTasks(session?.user.id);
  const toast = useToast();
  const isWide = useIsWide();
  const isWeb = Platform.OS === "web";
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const discardRef = useRef<() => void>(() => {});
  const saveAndCloseRef = useRef<() => void>(() => {});

  // Native only: on web the detail dismisses itself, sparing a field the user clicked.
  useDismissKeyboardOnOpen();

  const task = tasks.find((candidate) => candidate.id === id);
  const subtasks = tasks
    .filter((candidate) => candidate.parent_id === id)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (task?.project_id) {
      router.replace(`/project/${task.project_id}`);
    } else {
      router.replace("/today");
    }
  };

  const { projects } = useProjects();
  const allSections = useAllSections();
  const { labels, createLabel } = useLabels();
  const { timezone, smartDatesEnabled } = usePreferences();
  const now = useNow();
  const [subtaskModalOpen, setSubtaskModalOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  const resolveLabels = useCallback(
    (names: string[]) =>
      names
        .map((name) => {
          const existing = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
          return existing ? existing.id : null;
        })
        .filter((id): id is string => id != null),
    [labels],
  );

  const handleArchive = () => {
    if (!task || !setArchived(task, true)) return;
    handleBack();
    toast.show(t("toast.archivedCount", { count: 1 }), {
      label: t("common.undo"),
      run: () => setArchived(task, false),
    });
  };

  const handleDelete = () => {
    if (!task || !remove(task)) return;
    handleBack();
    toast.show(t("toast.deleted"), {
      label: t("common.undo"),
      run: () => restore(task),
    });
  };

  const handleDuplicate = () => {
    if (!task) return;
    const newId = duplicate(task);
    if (newId == null) return;
    toast.show(t("toast.duplicated", { count: 1 }), {
      label: t("common.undo"),
      run: () => discard(newId),
    });
  };

  const handleSkip = () => {
    if (task) skip(task);
  };

  const projectName = task
    ? task.project_id
      ? (projects.find((p) => p.id === task.project_id)?.name ?? t("moveTo.inbox"))
      : t("moveTo.inbox")
    : undefined;

  const detail = task ? (
    <TaskDetailScreen
      key={task.id}
      task={task}
      isWide={isWide}
      onUpdate={update}
      onUpdateRecurring={updateRecurring}
      onToggle={toggle}
      onDirtyChange={setHasUnsavedChanges}
      onRegisterDiscard={(fn) => {
        discardRef.current = fn;
      }}
      onRegisterSaveAndClose={(fn) => {
        saveAndCloseRef.current = fn;
      }}
      subtasks={subtasks}
      onOpenSubtask={(child) => router.push(`/task/${child.id}`)}
      onToggleSubtask={toggle}
      onAddSubtask={(subtaskInput) =>
        create({
          ...subtaskInput,
          parent_id: task.id,
          project_id: task.project_id,
          section_id: task.section_id,
        })
      }
      onRequestAddSubtask={() => setSubtaskModalOpen(true)}
      isSubtaskModalOpen={subtaskModalOpen}
      onArchive={handleArchive}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
      onSkip={task.recurrence && task.due_at != null ? handleSkip : undefined}
    />
  ) : (
    // Not an error: another device may delete the task while this screen is open. It needs a way out.
    <EmptyState
      icon={CircleAlert}
      title={t("task.gone")}
      description={t("task.goneBody")}
      actions={[{ label: t("common.back"), onPress: handleBack, primary: true }]}
    />
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t("taskDetail.details"),
          ...taskDetailScreenOptions(isWeb),
        }}
      />
      <TaskDetailWebFrame
        isWide={isWide}
        title={t("taskDetail.details")}
        projectName={projectName}
        onProjectPress={() => setMoving(true)}
        onArchive={task ? handleArchive : undefined}
        onDelete={task ? handleDelete : undefined}
        onDuplicate={task ? handleDuplicate : undefined}
        onSkip={
          task && !task.is_completed && task.recurrence && task.due_at != null
            ? handleSkip
            : undefined
        }
        onClose={handleBack}
        hasUnsavedChanges={hasUnsavedChanges}
        onDiscard={() => {
          discardRef.current();
        }}
        onSaveAndClose={() => {
          saveAndCloseRef.current();
        }}
      >
        {detail}
      </TaskDetailWebFrame>

      <MoveToPicker
        title={moving && task ? task.title : null}
        projects={projects}
        sections={allSections.sections}
        currentProjectId={task?.project_id}
        currentSectionId={task?.section_id}
        onPick={(target) => {
          if (task) update(task, { project_id: target.project_id, section_id: target.section_id });
          setMoving(false);
        }}
        onClose={() => setMoving(false)}
      />

      {!isWeb && !isWide && task && (
        <KeyboardPinnedTaskAdd
          visible={subtaskModalOpen}
          onClose={() => {
            Keyboard.dismiss();
            setSubtaskModalOpen(false);
          }}
          onAdd={(subtaskInput) =>
            create({
              ...subtaskInput,
              parent_id: task.id,
              project_id: task.project_id,
              section_id: task.section_id,
            })
          }
          defaults={{
            parent_id: task.id,
            project_id: task.project_id,
            section_id: task.section_id,
          }}
          placeholder={t("taskDetail.addSubtask")}
          accessibilityLabel={t("taskDetail.addSubtask")}
          hasBottomNav={false}
          labels={labels}
          resolveLabels={resolveLabels}
          onCreateLabel={createLabel}
          smartDates={smartDatesEnabled}
          projects={task.project_id ? projects.filter((p) => p.id === task.project_id) : []}
          sections={
            task.project_id
              ? allSections.sections.filter((s) => s.project_id === task.project_id)
              : []
          }
          now={now}
          timeZone={timezone || undefined}
        />
      )}
    </>
  );
}

/**
 * The task detail is a sibling of `(drawer)` under the root Stack, so without its own boundary a
 * throw here would skip the drawer's and take the whole app down.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const report = useAutoReport(error);
  if (__DEV__) console.error(error);
  return (
    <CrashScreen
      error={error}
      report={report}
      onRetry={() => void retry()}
      onGoHome={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/today");
        }
      }}
      homeLabel={t("common.back")}
    />
  );
}
