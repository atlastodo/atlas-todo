import * as SQLite from "expo-sqlite";
import type { QueuedReport } from "./reportQueue";

/**
 * A synchronous home for the report of a crash about to take the process down. React Native's fatal
 * handler ends the app the moment it runs, so nothing async started before it finishes. The report
 * is written here synchronously first (expo-sqlite's sync API; localStorage on web) and the next
 * launch moves it into the report queue (`crashReporter.flushQueue`). Never throws: this runs
 * inside the global error handler.
 */

/** The synchronous storage surface, swappable in tests. */
export interface SlotStorage {
  read(): string | null;
  write(value: string): void;
}

const KEY = "atlas.fatalReports";

/** A crash loop that survives relaunches must not grow this without bound. */
const MAX_SLOT = 3;

let db: SQLite.SQLiteDatabase | null = null;

function database(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("atlas-meta.db");
    db.execSync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, val TEXT)");
  }
  return db;
}

const sqliteStorage: SlotStorage = {
  read: () =>
    database().getFirstSync<{ val: string }>("SELECT val FROM kv WHERE key = ?", [KEY])?.val ??
    null,
  write: (value) => {
    database().runSync("INSERT OR REPLACE INTO kv (key, val) VALUES (?, ?)", [KEY, value]);
  },
};

let storage: SlotStorage = sqliteStorage;

/** Swap the backing store. Tests only. */
export function __setCrashSlotStorageForTests(next: SlotStorage | null): void {
  storage = next ?? sqliteStorage;
}

/** The reports saved by crashes that have not been moved to the queue yet, oldest first. */
export function peekFatalSync(): QueuedReport[] {
  try {
    const raw = storage.read();
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

/** Save a report synchronously, before the process can die. */
export function saveFatalSync(payload: QueuedReport): void {
  try {
    const items = peekFatalSync().filter((p) => p.id !== payload.id);
    items.push(payload);
    storage.write(JSON.stringify(items.slice(-MAX_SLOT)));
  } catch {
    // Nowhere to write: losing the report beats a second crash.
  }
}

/** Forget the given reports, once they are safely in the queue. */
export function clearFatalSync(ids: string[]): void {
  try {
    const items = peekFatalSync();
    const rest = items.filter((p) => !ids.includes(p.id));
    if (rest.length !== items.length) storage.write(JSON.stringify(rest));
  } catch {
    // Left in place; moving them again is idempotent (the queue dedupes by id).
  }
}
