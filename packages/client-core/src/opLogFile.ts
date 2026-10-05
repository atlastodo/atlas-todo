import { compareHlc } from "./hlc";
import { isWellFormedOp } from "./store";
import type { Operation } from "./types";

/**
 * Scaffolding for syncing a local-only store through a file the user picks: one that lives in a
 * folder Nextcloud, iCloud Drive, Syncthing, Dropbox or similar keeps in step between devices. Not
 * wired into any client yet; see `docs/local-file-sync.md` for the plan.
 *
 * The op log is a CRDT (last writer wins per field, by HLC), so a file needs no locking and no
 * server: a device merges the file's ops with its own and writes the union back. Two devices
 * writing at once leave either the later write (the earlier device's ops come back on its next
 * cycle, since it still holds them) or a "conflicted copy" beside the file, which merges like any
 * other copy (`mergeOpLogs`).
 */

/** The `format` tag that marks an Atlas op-log file. */
export const OP_LOG_FILE_FORMAT = "atlas-oplog";
/** The newest file version this build reads and the one it writes. */
export const OP_LOG_FILE_VERSION = 1;

/** The file's JSON shape. Version 1 is plaintext; encryption is planned as a later version. */
export interface OpLogFile {
  format: typeof OP_LOG_FILE_FORMAT;
  version: number;
  ops: Operation[];
}

/** A file this build cannot read: not an op-log file, unreadable JSON, or a newer version. */
export class OpLogFileError extends Error {
  constructor(
    readonly reason: "not_json" | "not_op_log" | "newer_version",
    message: string,
  ) {
    super(message);
    this.name = "OpLogFileError";
  }
}

/**
 * Where a file-synced store reads and writes its file. Each platform supplies one: a
 * security-scoped bookmark on iOS/macOS, a Storage Access Framework URI on Android, a path on
 * Electron, the File System Access API on Chromium.
 */
export interface FileSyncTarget {
  /** A name to show the user, such as the file's name and folder. */
  readonly label: string;
  /** The file's text, or null when it does not exist yet. */
  read(): Promise<string | null>;
  /** Replace the file's contents. Should write a temporary file and rename it where possible. */
  write(text: string): Promise<void>;
  /** The texts of conflicted copies the sync service left beside the file, if it can list them. */
  readConflictCopies?(): Promise<string[]>;
}

/** The file's text for `ops`, ordered by HLC so unchanged history diffs as unchanged. */
export function encodeOpLogFile(ops: Iterable<Operation>): string {
  const file: OpLogFile = {
    format: OP_LOG_FILE_FORMAT,
    version: OP_LOG_FILE_VERSION,
    ops: sortOps([...ops]),
  };
  return JSON.stringify(file);
}

/**
 * The ops in an op-log file's text. Throws {@link OpLogFileError} for a file this build cannot
 * read; a malformed op inside a readable file is skipped, as `LocalStore.hydrate` does.
 */
export function decodeOpLogFile(text: string): Operation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpLogFileError("not_json", "The file is not valid JSON.");
  }
  const file = parsed as Partial<OpLogFile> | null;
  if (file?.format !== OP_LOG_FILE_FORMAT || !Array.isArray(file.ops)) {
    throw new OpLogFileError("not_op_log", "The file is not an Atlas op-log file.");
  }
  if (typeof file.version !== "number" || file.version > OP_LOG_FILE_VERSION) {
    throw new OpLogFileError("newer_version", "The file was written by a newer version of Atlas.");
  }
  return file.ops.filter(isWellFormedOp);
}

/** The union of several logs, one copy per op id, ordered by HLC. */
export function mergeOpLogs(...logs: Iterable<Operation>[]): Operation[] {
  const byId = new Map<string, Operation>();
  for (const log of logs) for (const op of log) if (!byId.has(op.id)) byId.set(op.id, op);
  return sortOps([...byId.values()]);
}

function sortOps(ops: Operation[]): Operation[] {
  return ops.sort((a, b) => compareHlc(a.ts, b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
