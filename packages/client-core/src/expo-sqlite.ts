/**
 * A {@link SqlDatabase} over expo-sqlite for {@link SqlitePersistence}. The expo surface is declared
 * structurally so `client-core` stays dependency-free; the app injects the real `SQLiteDatabase`.
 */

import type { SqlDatabase, SqlExecuteResult } from "./persistence";

/**
 * What SQLite can bind. It must mirror expo's `SQLiteBindValue` exactly: it sits in a parameter
 * position (contravariant), so an extra member makes the port wider than the real database can
 * satisfy. SDK 57 accepts `ArrayBuffer` and SDK 54 does not; keep in step with the pinned SDK.
 */
export type ExpoBindValue = string | number | boolean | null | Uint8Array;

/**
 * The slice of expo-sqlite's `SQLiteDatabase` this adapter needs; omits the variadic and
 * object-keyed overloads.
 */
export interface ExpoSqliteDatabase {
  runAsync(
    source: string,
    params: ExpoBindValue[],
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, params: ExpoBindValue[]): Promise<T[]>;
  closeAsync?(): Promise<void>;
}

/**
 * Bridge the port's `unknown[]` binds to SQLite's bind values by cast: {@link SqlitePersistence}
 * only binds strings and numbers, so a runtime guard would re-prove what the caller guarantees.
 */
function asBindValues(values: unknown[]): ExpoBindValue[] {
  return values as ExpoBindValue[];
}

/**
 * Adapts an expo-sqlite database to {@link SqlDatabase}; both use `?` placeholders, only the result
 * shape differs.
 */
export class ExpoSqlDatabase implements SqlDatabase {
  constructor(private readonly db: ExpoSqliteDatabase) {}

  async execute(query: string, bindValues: unknown[] = []): Promise<SqlExecuteResult> {
    const result = await this.db.runAsync(query, asBindValues(bindValues));
    return { rowsAffected: result.changes, lastInsertId: result.lastInsertRowId };
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    // `select<OpRow[]>` asks for the row array, which `getAllAsync` returns.
    const rows = await this.db.getAllAsync<unknown>(query, asBindValues(bindValues));
    return rows as T;
  }

  async close(): Promise<void> {
    await this.db.closeAsync?.();
  }
}
