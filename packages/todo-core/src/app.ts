import {
  registerApp,
  rescopeEntity,
  rewriteEntity,
  ownsEntity,
  type AppDefinition,
  type Keyring,
  type LocalStore,
} from "@atlastodo/client-core";
import definition from "./definition.json";

/**
 * Atlas Todo's app definition (`definition.json`): which of its kinds scope to a shared project and
 * through which link, and the writer field of activity entries. Core has no todo rules: the engine
 * reads these. {@link registerTodoApp} runs when this package is imported.
 */
export const TODO_APP_DEFINITION: AppDefinition = {
  app: definition.app,
  kinds: definition.kinds as AppDefinition["kinds"],
};

export function registerTodoApp(): void {
  registerApp(TODO_APP_DEFINITION);
}

type RescopeStore = Pick<
  LocalStore,
  "list" | "get" | "rawField" | "exists" | "visibleFieldStates" | "rewriteField"
>;

/**
 * After a task moved between scopes: re-write it, its comments, activity and attachments under the
 * new key. Only `fromProjectId`'s keys and the DEK may unwrap; with `userId`, only that account's
 * activity entries are re-written (someone else's would lose their author).
 */
export function rescopeTask(
  store: RescopeStore,
  keyring: Keyring | null,
  taskId: string,
  fromProjectId?: string | null,
  userId?: string,
): number {
  return rescopeEntity(store, keyring, "task", taskId, fromProjectId, userId);
}

/** After a section moved to another project: the section, its tasks and its own entries. */
export function rescopeSection(
  store: RescopeStore,
  keyring: Keyring | null,
  sectionId: string,
  fromProjectId?: string | null,
  userId?: string,
): number {
  let written = rescopeEntity(store, keyring, "section", sectionId, fromProjectId, userId);
  for (const e of store.list("task")) {
    if (e.fields.section_id === sectionId)
      written += rescopeTask(store, keyring, e.id, fromProjectId, userId);
  }
  // The section's own entries (renames, archives), which name it rather than a task.
  for (const e of store.list("activity")) {
    if (
      !e.fields.task_id &&
      e.fields.section_id === sectionId &&
      ownsEntity("activity", e.fields, userId)
    )
      written += rewriteEntity(store, "activity", e.id);
  }
  return written;
}
