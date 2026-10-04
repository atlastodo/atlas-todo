import type { QueuedReport } from "./reportQueue";

/**
 * The browser twin of `crashSlot.ts`: the same synchronous slot, on localStorage. A page does not
 * die with its error the way a native release build does, but the global handler takes one path
 * on every platform. Never throws.
 */

export interface SlotStorage {
  read(): string | null;
  write(value: string): void;
}

const KEY = "atlas.fatalReports";
const MAX_SLOT = 3;

const localStorageSlot: SlotStorage = {
  read: () => window.localStorage.getItem(KEY),
  write: (value) => window.localStorage.setItem(KEY, value),
};

let storage: SlotStorage = localStorageSlot;

/** Swap the backing store. Tests only. */
export function __setCrashSlotStorageForTests(next: SlotStorage | null): void {
  storage = next ?? localStorageSlot;
}

export function peekFatalSync(): QueuedReport[] {
  try {
    const raw = storage.read();
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

export function saveFatalSync(payload: QueuedReport): void {
  try {
    const items = peekFatalSync().filter((p) => p.id !== payload.id);
    items.push(payload);
    storage.write(JSON.stringify(items.slice(-MAX_SLOT)));
  } catch {
    // Storage blocked or full: the report is lost rather than becoming a second error.
  }
}

export function clearFatalSync(ids: string[]): void {
  try {
    const items = peekFatalSync();
    const rest = items.filter((p) => !ids.includes(p.id));
    if (rest.length !== items.length) storage.write(JSON.stringify(rest));
  } catch {
    // Left in place: moving them again later is idempotent.
  }
}
