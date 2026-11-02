import type { TFunction } from "i18next";
import { decodeLabels, decodePlace, type Activity, type Formatters } from "@atlastodo/todo-core";

/**
 * One activity entry as a sentence fragment ("set the due date of Ship it to Fri 14 Nov"), the
 * actor's name in front added by the caller. Lookups are injected, so this stays pure: names of
 * tasks, projects, sections, labels and people come from the store, with fallbacks for anything
 * since purged or never synced here.
 */
export interface ActivityLookups {
  taskTitle: (taskId: string) => string | null;
  projectName: (projectId: string) => string | null;
  sectionName: (sectionId: string) => string | null;
  labelName: (labelId: string) => string | null;
  personName: (userId: string) => string;
}

const quote = (s: string) => `“${s}”`;

export function describeActivity(
  a: Activity,
  t: TFunction,
  fmt: Formatters,
  look: ActivityLookups,
): string {
  const task = quote(look.taskTitle(a.task_id) || t("activity.aTask"));
  const date = (v: string | null) => (v ? fmt.dueChip(Number(v)) : "");
  const place = (v: string | null) => {
    const p = decodePlace(v);
    if (!p?.project_id) return t("nav.inbox");
    const project = look.projectName(p.project_id) ?? "?";
    const section = p.section_id ? look.sectionName(p.section_id) : null;
    return section ? `${project} › ${section}` : project;
  };
  const named = (fallback: string | null) => quote(fallback ?? "");
  switch (a.kind) {
    case "status":
      return t(a.to === "completed" ? "activity.completed" : "activity.reopened", { task });
    case "due":
      return a.to
        ? t("activity.dueSet", { task, date: date(a.to) })
        : t("activity.dueCleared", { task });
    case "start":
      return a.to
        ? t("activity.startSet", { task, date: date(a.to) })
        : t("activity.startCleared", { task });
    case "assignee":
      return a.to
        ? t("activity.assigned", { task, name: look.personName(a.to) })
        : t("activity.unassigned", { task });
    case "priority":
      return t("activity.priority", {
        task,
        priority: t("task.priority", { level: a.to ?? "4" }),
      });
    case "labels": {
      const names = decodeLabels(a.to).map((id) => look.labelName(id) ?? "?");
      return t("activity.labels", {
        task,
        labels: names.length > 0 ? names.join(", ") : t("activity.noLabels"),
      });
    }
    case "title":
      return t("activity.renamed", { from: quote(a.from ?? ""), to: quote(a.to ?? "") });
    case "description":
      return t("activity.description", { task });
    case "move":
      return t("activity.moved", { task, place: place(a.to) });
    case "created":
      return t("activity.created", { task });
    case "deleted":
      return t("activity.deleted", { task });
    case "restored":
      return t("activity.restored", { task });
    case "project_renamed":
      return t("activity.projectRenamed", { from: quote(a.from ?? ""), to: quote(a.to ?? "") });
    case "project_archived":
      return t("activity.projectArchived", { name: named(a.to) });
    case "project_unarchived":
      return t("activity.projectUnarchived", { name: named(a.to) });
    case "project_deleted":
      return t("activity.projectDeleted", { name: named(a.to) });
    case "project_restored":
      return t("activity.projectRestored", { name: named(a.to) });
    case "section_renamed":
      return t("activity.sectionRenamed", { from: quote(a.from ?? ""), to: quote(a.to ?? "") });
    case "section_archived":
      return t("activity.sectionArchived", { name: named(a.to) });
    case "section_unarchived":
      return t("activity.sectionUnarchived", { name: named(a.to) });
    case "section_deleted":
      return t("activity.sectionDeleted", { name: named(a.to) });
    case "section_restored":
      return t("activity.sectionRestored", { name: named(a.to) });
    // Member entries name the member's user id (older ones may hold an address).
    case "member_invited":
      return t("activity.memberInvited", { name: a.to ? look.personName(a.to) : "" });
    case "member_joined":
      return t("activity.memberJoined");
    case "member_removed":
      return t("activity.memberRemoved", { name: a.to ? look.personName(a.to) : "" });
  }
}
