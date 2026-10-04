import {
  IndexedDbPersistence,
  MemoryPersistence,
  type IndexedDbEvents,
  type Persistence,
} from "@atlas/client-core";
import { closeAll, trackOpen } from "./openDatabases";

/**
 * The attachment queue keeps a file's ciphertext as a `Blob`: IndexedDB stores it outside the JS
 * heap and `fetch` streams it as the upload body (see `AttachmentQueueOptions.ciphertextAsBlob`).
 */
export const CIPHERTEXT_AS_BLOB = true;

/**
 * Web durable op-log backend; Metro resolves this in place of `persistence.ts`. expo-sqlite's
 * wa-sqlite `.wasm` backend does not suit the browser build, so this uses IndexedDB, falling back to
 * in-memory where it is absent (jsdom, hardened private mode). The sync cursor lives in the store
 * itself (IndexedDB's `meta` store), as in the native SQLite op log. Always returns a defined
 * {@link Persistence}, since `StoreProvider` calls `getCursor()` unconditionally.
 */
export async function createPersistence(
  userId: string,
  events: IndexedDbEvents = {},
): Promise<Persistence> {
  if (typeof indexedDB === "undefined") return new MemoryPersistence();
  // Scoped to the user so two accounts in one browser never share an op log: a second account
  // would inherit the first's unsynced outbox and push ops that 403 forever.
  void requestPersistentStorage();
  return trackOpen(userId, new IndexedDbPersistence(dbName(userId), indexedDB, events));
}

/**
 * Ask the browser to keep this site's storage (when a signed-in store opens). Otherwise it is
 * best-effort and may be evicted under pressure (Safari after seven days without a visit), taking
 * unsynced changes with it. A refusal changes nothing else.
 */
async function requestPersistentStorage(): Promise<void> {
  const storage = (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage;
  if (typeof storage?.persist !== "function") return;
  try {
    if (await storage.persisted?.()) return;
    await storage.persist();
  } catch (err) {
    console.warn("[atlas] could not request persistent storage:", err);
  }
}

function dbName(userId: string): string {
  return `atlas-${userId}`;
}

/**
 * Delete `userId`'s database: the decrypted op log, outbox and upload queue. This tab's connections
 * close first; other tabs' close on request (`IndexedDbEvents.onVersionChange`) and the deletion waits.
 */
export async function deleteDatabase(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await closeAll(userId);
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName(userId));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
