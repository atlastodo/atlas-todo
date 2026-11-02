import type { LocalStore } from "@atlastodo/client-core";

/**
 * Run a write and report the activity entries it appended, so a toast's undo can take them back
 * instead of recording the reverse change: an undone delete or archive leaves no trace in the feed.
 */
export function withNewActivity<T>(
  store: LocalStore,
  write: () => T,
): { result: T; entries: string[] } {
  const before = new Set(store.list("activity").map((e) => e.id));
  const result = write();
  const entries = store
    .list("activity")
    .map((e) => e.id)
    .filter((id) => !before.has(id));
  return { result, entries };
}

/** Take back entries {@link withNewActivity} reported (the toast undo of their write). */
export function dropActivity(store: LocalStore, entries: readonly string[]): void {
  for (const id of entries) store.remove("activity", id);
}
