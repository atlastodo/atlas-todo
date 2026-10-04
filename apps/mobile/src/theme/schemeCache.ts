import * as SQLite from "expo-sqlite";

export type CachedScheme = "light" | "dark";

/** Shared with the web twin so `bootScheme` type-checks against either. */
export const SCHEME_STORAGE_KEY = "atlas.colorScheme";

let inMemoryScheme: CachedScheme | null = null;
let metaDb: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase | null {
  if (!metaDb) {
    try {
      metaDb = SQLite.openDatabaseSync("atlas-meta.db");
      metaDb.execSync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, val TEXT)");
    } catch {
      metaDb = null;
    }
  }
  return metaDb;
}

/** Persist the scheme the app just applied so the next boot can read it synchronously. */
export function cacheScheme(scheme: CachedScheme): void {
  inMemoryScheme = scheme;
  try {
    const db = getDb();
    if (db) {
      db.runSync("INSERT OR REPLACE INTO kv (key, val) VALUES (?, ?)", [
        SCHEME_STORAGE_KEY,
        scheme,
      ]);
    }
  } catch {
    // Non-fatal: in-memory fallback remains active for the current session
  }
}

/** Read the scheme cached from the previous session synchronously. */
export function getCachedScheme(): CachedScheme | null {
  try {
    const db = getDb();
    if (db) {
      const row = db.getFirstSync<{ val: string }>("SELECT val FROM kv WHERE key = ?", [
        SCHEME_STORAGE_KEY,
      ]);
      if (row?.val === "dark" || row?.val === "light") {
        return row.val;
      }
    }
  } catch {
    // Non-fatal
  }
  return inMemoryScheme;
}
