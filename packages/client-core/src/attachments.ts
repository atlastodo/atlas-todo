/**
 * Client side of the E2EE attachment pipeline (see docs/architecture.md). A per-file key (AEK)
 * seals the file in chunks, the blob is addressed by its ciphertext sha256, and the metadata uses
 * the `__aenc` marker. Files are sealed in ranges, never whole in memory; no plaintext fallback.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { ApiError, type BlobDownload } from "./api";
import {
  BLOB_CHUNK_SIZE,
  BlobIntegrityError,
  BlobOpener,
  BlobSealer,
  bytesToHex,
  bytesToUtf8,
  decryptAesGcm,
  encryptAesGcm,
  isWrappedAttachmentKey,
  maxPlainSize,
  randomBytes,
  sealedBlobSize,
  unwrapAttachmentKey,
  unwrapKey,
  wrapAttachmentKey,
  type AttachmentKeyPayload,
  type Keyring,
  type WrappedAttachmentKey,
} from "./crypto";
import type { AttachmentMeta, AttachmentMetaPayload, EntityKind, Operation } from "./types";
import type {
  AttachmentCiphertext,
  AttachmentUploadInfo,
  AttachmentUploadState,
  PersistedAttachmentUpload,
} from "./persistence";
import {
  keyForScope,
  rewrapAttachmentKey,
  unwrapWithAnyKey,
  type ScopeKey,
  type ScopeStore,
} from "./scope";
import type { LocalStore } from "./store";

/** The server's default blob cap (`MAX_BLOB_BYTES`), used until it reports its own. */
export const DEFAULT_MAX_BLOB_BYTES = 25 * 1024 * 1024;

export function maxAttachmentBytes(maxBlobBytes: number = DEFAULT_MAX_BLOB_BYTES): number {
  return maxPlainSize(maxBlobBytes);
}

/** Thrown before encrypting, instead of uploading to a 413. */
export class AttachmentTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`attachment exceeds the ${maxBytes}-byte limit`);
    this.name = "AttachmentTooLargeError";
  }
}

/** A fresh 256-bit attachment key, one per file. Only its wrap under the scope key is durable. */
export function generateAek(): Uint8Array {
  return randomBytes(32);
}

function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export interface AttachmentSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function bytesSource(bytes: Uint8Array): AttachmentSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}

export function blobSource(blob: Blob): AttachmentSource {
  return {
    size: blob.size,
    read: async (offset, length) =>
      new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

const READ_BYTES = 16 * BLOB_CHUNK_SIZE;

const BLOB_PART_BYTES = 1024 * 1024;

interface CiphertextSink {
  write(bytes: Uint8Array): void;
  finish(): AttachmentCiphertext;
}

class BufferSink implements CiphertextSink {
  private readonly out: Uint8Array;
  private length = 0;

  constructor(size: number) {
    this.out = new Uint8Array(size);
  }

  write(bytes: Uint8Array): void {
    this.out.set(bytes, this.length);
    this.length += bytes.length;
  }

  finish(): Uint8Array {
    return this.out;
  }
}

/** A part at a time: browsers keep Blob bytes outside the JS heap. */
class BlobSink implements CiphertextSink {
  private readonly parts: Blob[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;

  write(bytes: Uint8Array): void {
    this.pending.push(bytes);
    this.pendingBytes += bytes.length;
    if (this.pendingBytes >= BLOB_PART_BYTES) this.flush();
  }

  finish(): Blob {
    this.flush();
    return new Blob(this.parts, { type: "application/octet-stream" });
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    this.parts.push(new Blob(this.pending as BlobPart[]));
    this.pending = [];
    this.pendingBytes = 0;
  }
}

export interface SealedBlob {
  sha: string;
  size: number;
  plainSha: string;
  ciphertext: AttachmentCiphertext;
}

/** Throws if the file changed length while read. */
export async function sealSource(
  aek: Uint8Array,
  source: AttachmentSource,
  opts: { asBlob?: boolean } = {},
): Promise<SealedBlob> {
  const total = source.size;
  const expected = sealedBlobSize(total);
  const sink: CiphertextSink = opts.asBlob ? new BlobSink() : new BufferSink(expected);
  const sealer = new BlobSealer(aek);
  const blobHash = sha256.create();
  const plainHash = sha256.create();
  let size = 0;
  const emit = (bytes: Uint8Array) => {
    blobHash.update(bytes);
    sink.write(bytes);
    size += bytes.length;
  };
  emit(sealer.header);
  let offset = 0;
  for (;;) {
    const want = Math.min(READ_BYTES, total - offset);
    const piece = want > 0 ? await source.read(offset, want) : new Uint8Array();
    if (piece.length !== want) throw new Error("the file changed while it was being read");
    plainHash.update(piece);
    offset += want;
    const last = offset === total;
    for (const sealed of sealChunks(sealer, piece, last)) emit(sealed);
    if (last) break;
  }
  if (size !== expected) throw new Error("sealed blob has an unexpected size");
  return {
    sha: bytesToHex(blobHash.digest()),
    size,
    plainSha: bytesToHex(plainHash.digest()),
    ciphertext: sink.finish(),
  };
}

function* sealChunks(sealer: BlobSealer, piece: Uint8Array, last: boolean): Generator<Uint8Array> {
  for (let at = 0; ; at += BLOB_CHUNK_SIZE) {
    const end = Math.min(at + BLOB_CHUNK_SIZE, piece.length);
    yield sealer.seal(piece.subarray(at, end), last && end === piece.length);
    if (end === piece.length) return;
  }
}

export function encryptBlob(
  aek: Uint8Array,
  plaintext: Uint8Array,
): { sha: string; blob: Uint8Array } {
  const sealer = new BlobSealer(aek);
  const sink = new BufferSink(sealedBlobSize(plaintext.length));
  sink.write(sealer.header);
  for (const sealed of sealChunks(sealer, plaintext, true)) sink.write(sealed);
  const blob = sink.finish();
  return { sha: sha256Hex(blob), blob };
}

/** Any tamper, reorder, truncation or wrong key throws; `expectedPlainSha` also checks the meta. */
export function decryptBlob(
  aek: Uint8Array,
  blob: Uint8Array,
  expectedPlainSha?: string,
): Uint8Array {
  const opener = new BlobOpener(aek);
  const plain = new PlainCollector(blob.length);
  for (const chunk of opener.push(blob)) plain.push(chunk);
  for (const chunk of opener.finish()) plain.push(chunk);
  return plain.result(expectedPlainSha);
}

/** Largest blob trusted to preallocate the plaintext buffer; beyond it chunks are collected. */
const MAX_PREALLOCATION = 256 * 1024 * 1024;

class PlainCollector {
  private out: Uint8Array | null;
  private parts: Uint8Array[] = [];
  private length = 0;
  private readonly hash = sha256.create();

  constructor(blobSize: number | null) {
    this.out = blobSize !== null && blobSize <= MAX_PREALLOCATION ? new Uint8Array(blobSize) : null;
  }

  push(chunk: Uint8Array): void {
    this.hash.update(chunk);
    if (this.out && this.length + chunk.length <= this.out.length) {
      this.out.set(chunk, this.length);
    } else {
      if (this.out) {
        this.parts.push(this.out.subarray(0, this.length));
        this.out = null;
      }
      this.parts.push(chunk);
    }
    this.length += chunk.length;
  }

  result(expectedPlainSha?: string): Uint8Array {
    if (
      expectedPlainSha !== undefined &&
      bytesToHex(this.hash.digest()) !== expectedPlainSha.toLowerCase()
    ) {
      throw new BlobIntegrityError("decrypted plaintext does not match the recorded plain sha");
    }
    if (this.out) return this.out.subarray(0, this.length);
    if (this.parts.length === 1) return this.parts[0]!;
    const whole = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      whole.set(part, at);
      at += part.length;
    }
    return whole;
  }
}

export function encryptMeta(aek: Uint8Array, meta: AttachmentMeta): AttachmentMetaPayload {
  const enc = encryptAesGcm(aek, JSON.stringify(meta));
  return { __aenc: 1, iv: enc.iv, ct: enc.ct };
}

export function decryptMeta(aek: Uint8Array, payload: AttachmentMetaPayload): AttachmentMeta {
  if (payload.__aenc !== 1) {
    throw new BlobIntegrityError('not an attachment meta payload (missing "__aenc": 1 marker)');
  }
  const { iv, ct } = payload;
  const json = bytesToUtf8(decryptAesGcm(aek, { iv, ct }));
  return JSON.parse(json) as AttachmentMeta;
}

/** Binds attachment id, scope and key id as AAD so the server cannot hand out one attachment's key as another's. */
export function wrapAek(
  aek: Uint8Array,
  scopeKey: ScopeKey,
  attachmentId: string,
): WrappedAttachmentKey {
  return wrapAttachmentKey(aek, scopeKey.key, scopeKey.keyId, scopeKey.scope, attachmentId);
}

export function unwrapAek(
  wrapped: AttachmentKeyPayload,
  scopeKey: ScopeKey,
  attachmentId: string,
): Uint8Array {
  if (isWrappedAttachmentKey(wrapped)) {
    return unwrapAttachmentKey(wrapped, scopeKey.key, scopeKey.scope, attachmentId);
  }
  return unwrapKey(wrapped, scopeKey.key);
}

/** An older unbound wrap tries `preferred`, then every held key. */
export function unwrapAekAny(
  wrapped: AttachmentKeyPayload,
  keyring: Keyring,
  attachmentId: string,
  preferred?: Uint8Array | null,
): Uint8Array {
  const aek = unwrapWithAnyKey(wrapped, keyring, attachmentId, preferred);
  if (!aek) throw new BlobIntegrityError("no key held unwraps this attachment");
  return aek;
}

export interface BlobTransport {
  put(sha: string, body: AttachmentCiphertext): Promise<"stored" | "exists">;
  /** 403 when no live attachment references the sha, 404 when gone. */
  get(sha: string): Promise<Uint8Array | BlobDownload>;
}

/** The slice of {@link Persistence} the queue needs; ciphertext loads only for the entry uploading. */
export interface AttachmentQueueStore {
  listAttachmentQueue(): Promise<AttachmentUploadInfo[]>;
  loadAttachmentCiphertext(id: string): Promise<AttachmentCiphertext | null>;
  putAttachmentUpload(upload: PersistedAttachmentUpload): Promise<void>;
  updateAttachmentUpload(info: AttachmentUploadInfo): Promise<void>;
  deleteAttachmentUpload(id: string): Promise<void>;
}

export interface AttachmentStore extends Pick<
  LocalStore,
  "rawField" | "exists" | "visibleFieldStates" | "rewriteField" | "unsyncedOps"
> {
  set(entity: EntityKind, entityId: string, field: string, value: unknown): Operation;
  get(entity: EntityKind, entityId: string): Record<string, unknown> | null;
  list: ScopeStore["list"];
  flush?(): Promise<void>;
}

/**
 * Written field by field so a new queue-row field cannot reach the sync log unreviewed. `task_id`
 * and `blob_sha` stay plaintext (the server routes fan-out and download authorization by them).
 */
export function attachmentMetadataFields(
  upload: Pick<
    PersistedAttachmentUpload,
    | "taskId"
    | "blobSha"
    | "blobSize"
    | "wrappedKey"
    | "meta"
    | "thumbSha"
    | "sortOrder"
    | "createdAt"
  >,
): { field: string; value: unknown }[] {
  return [
    { field: "task_id", value: upload.taskId },
    { field: "blob_sha", value: upload.blobSha },
    { field: "thumb_sha", value: upload.thumbSha },
    { field: "blob_size", value: upload.blobSize },
    { field: "wrapped_key", value: upload.wrappedKey },
    { field: "meta", value: upload.meta },
    { field: "sort_order", value: upload.sortOrder },
    { field: "created_at", value: upload.createdAt },
  ];
}

/**
 * Plaintext is returned only once the bytes hash to the address, the blob ends where its last
 * chunk says, and the file matches `expectedPlainSha`. Transport errors propagate as-is: metadata
 * may outrun the blob.
 */
export async function fetchBlob(
  transport: BlobTransport,
  sha: string,
  aek: Uint8Array,
  plainSha?: string,
): Promise<Uint8Array> {
  const body = await transport.get(sha);
  const download: BlobDownload =
    body instanceof Uint8Array ? { size: body.length, chunks: [body] } : body;
  const opener = new BlobOpener(aek);
  const plain = new PlainCollector(download.size);
  const received = sha256.create();
  for await (const piece of download.chunks) {
    received.update(piece);
    for (const chunk of opener.push(piece)) plain.push(chunk);
  }
  if (bytesToHex(received.digest()) !== sha.toLowerCase()) {
    throw new BlobIntegrityError(`fetched blob does not hash to its address ${sha}`);
  }
  for (const chunk of opener.finish()) plain.push(chunk);
  return plain.result(plainSha);
}

export interface DrainSummary {
  stored: number;
  retried: number;
  failed: number;
  cancelled: number;
  deferred: number;
}

export interface AttachmentQueueEvent {
  id: string;
  state: AttachmentUploadState;
  error?: string;
}

export interface AttachmentDraft {
  taskId: string;
  projectId?: string | null;
  filename: string;
  mime: string;
  source: AttachmentSource | Uint8Array;
  dims?: { width: number; height: number };
  sortOrder?: number;
}

export interface AttachmentQueueOptions {
  transport: BlobTransport;
  persistence: AttachmentQueueStore;
  keyring: Keyring;
  store: AttachmentStore;
  now?: () => number;
  newId?: () => string;
  random?: () => number;
  backoff?: { baseMs?: number; maxMs?: number; jitter?: number };
  onStateChange?: (event: AttachmentQueueEvent) => void;
  maxBlobBytes?: () => number;
  /** Browser: keep ciphertext as a `Blob` (outside the JS heap, streamable). SQLite needs bytes. */
  ciphertextAsBlob?: boolean;
  /** Queues over the same key share one drain. */
  lockKey?: object;
  lockName?: string;
}

const PERSONAL_SCOPE = { kind: "personal" } as const;
const NO_SHARES: ReadonlySet<string> = new Set();

const DEFAULT_BACKOFF_BASE_MS = 1_000;
/** Past this the blob is put again before release: the server GCs unreferenced blobs after at least a day. */
export const BLOB_REFRESH_MS = 12 * 60 * 60_000;
export const MAX_SERVER_ATTEMPTS = 8;

const activeDrains = new WeakMap<object, Promise<DrainSummary>>();

function emptySummary(): DrainSummary {
  return { stored: 0, retried: 0, failed: 0, cancelled: 0, deferred: 0 };
}

function withTabLock<T>(
  name: string | undefined,
  task: () => Promise<T>,
  busy: () => T,
): Promise<T> {
  const locks = (
    globalThis as {
      navigator?: {
        locks?: {
          request(
            name: string,
            options: { ifAvailable: boolean },
            callback: (lock: unknown) => Promise<T> | T,
          ): Promise<T>;
        };
      };
    }
  ).navigator?.locks;
  if (!name || typeof locks?.request !== "function") return task();
  return locks.request(name, { ifAvailable: true }, (lock) => (lock ? task() : busy()));
}
const DEFAULT_BACKOFF_MAX_MS = 5 * 60_000;
const DEFAULT_BACKOFF_JITTER = 0.25;

/**
 * Durable, device-local upload queue; never synced. `enqueue` encrypts immediately (works offline).
 * - Metadata is released to the outbox after the first settled put attempt (success or one
 *   transient failure). A `stored` entry whose put went stale is re-put first.
 * - Transient failures back off with jitter. 400/404/405/409/413 and repeated server failures are
 *   `failed`; 403 is `cancelled` if the task is tombstoned. Terminal entries retry only via `retry`.
 * Accepted edge: released metadata may later see its blob fail terminally.
 */
export class AttachmentQueue {
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly random: () => number;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly jitter: number;
  private readonly removed = new Set<string>();

  constructor(private readonly opts: AttachmentQueueOptions) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.random = opts.random ?? Math.random;
    this.baseMs = opts.backoff?.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.maxMs = opts.backoff?.maxMs ?? DEFAULT_BACKOFF_MAX_MS;
    this.jitter = opts.backoff?.jitter ?? DEFAULT_BACKOFF_JITTER;
  }

  async entries(): Promise<AttachmentUploadInfo[]> {
    return (await this.opts.persistence.listAttachmentQueue()).filter((e) => e.state !== "stored");
  }

  async remove(id: string): Promise<void> {
    this.removed.add(id);
    await this.opts.persistence.deleteAttachmentUpload(id);
  }

  async retry(id: string): Promise<void> {
    const entry = (await this.entries()).find((e) => e.id === id);
    if (!entry || (entry.state !== "failed" && entry.state !== "cancelled")) return;
    await this.save({ ...entry, state: "queued", attempts: 0, nextAttemptAt: 0, lastError: null });
    this.emit({ id, state: "queued" });
  }

  /** The caller may close its source once this resolves. */
  async enqueue(draft: AttachmentDraft): Promise<PersistedAttachmentUpload> {
    const source = draft.source instanceof Uint8Array ? bytesSource(draft.source) : draft.source;
    const maxBlobBytes = this.opts.maxBlobBytes?.() ?? DEFAULT_MAX_BLOB_BYTES;
    if (sealedBlobSize(source.size) > maxBlobBytes) {
      throw new AttachmentTooLargeError(maxAttachmentBytes(maxBlobBytes));
    }
    const id = this.newId();
    const aek = generateAek();
    const sealed = await sealSource(aek, source, { asBlob: this.opts.ciphertextAsBlob });
    const upload: PersistedAttachmentUpload = {
      id,
      taskId: draft.taskId,
      projectId: draft.projectId ?? null,
      blobSha: sealed.sha,
      blobSize: sealed.size,
      ciphertext: sealed.ciphertext,
      // Wrapped under the personal key while queued: the task may move or be shared before release,
      // which re-wraps for the scope then.
      wrappedKey: wrapAek(aek, keyForScope(this.opts.keyring, PERSONAL_SCOPE, NO_SHARES), id),
      meta: encryptMeta(aek, {
        filename: draft.filename,
        mime: draft.mime,
        plain_sha: sealed.plainSha,
        dims: draft.dims,
      }),
      thumbSha: null, // v1: no thumbnails; the lightbox fetches the full blob
      sortOrder: draft.sortOrder ?? 0,
      createdAt: this.now(),
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      metaReleased: false,
    };
    await this.opts.persistence.putAttachmentUpload(upload);
    this.emit({ id: upload.id, state: "queued" });
    return upload;
  }

  /** Concurrent callers, queue instances and (via `lockName`) tabs coalesce, else metadata releases twice. */
  drain(): Promise<DrainSummary> {
    const key = this.opts.lockKey ?? this.opts.persistence;
    const active = activeDrains.get(key);
    if (active) return active;
    const run = withTabLock(this.opts.lockName, () => this.runDrain(), emptySummary).finally(() => {
      activeDrains.delete(key);
    });
    activeDrains.set(key, run);
    return run;
  }

  private async runDrain(): Promise<DrainSummary> {
    const summary = emptySummary();
    const rows = await this.opts.persistence.listAttachmentQueue();
    for (const entry of rows.filter((e) => e.state === "stored")) {
      await this.settleStored(entry, summary);
    }
    for (const entry of rows.filter((e) => e.state === "queued")) {
      if (entry.nextAttemptAt > this.now()) {
        summary.deferred++;
        continue;
      }
      await this.processOne(entry, summary);
    }
    return summary;
  }

  private async processOne(entry: AttachmentUploadInfo, summary: DrainSummary): Promise<void> {
    const ciphertext = await this.opts.persistence.loadAttachmentCiphertext(entry.id);
    if (!ciphertext || this.removed.has(entry.id)) return;
    this.emit({ id: entry.id, state: "uploading" });
    let outcome: "stored" | "exists";
    try {
      outcome = await this.opts.transport.put(entry.blobSha, ciphertext);
    } catch (err) {
      if (await this.wasRemoved(entry.id)) return;
      await this.onPutFailure(entry, err, summary);
      return;
    }
    if (await this.wasRemoved(entry.id)) return;
    void outcome;
    await this.onPutSuccess(entry, summary);
  }

  private async settleStored(entry: AttachmentUploadInfo, summary: DrainSummary): Promise<void> {
    if (this.metadataPending(entry.id)) return;
    if (entry.nextAttemptAt > this.now()) {
      await this.opts.persistence.deleteAttachmentUpload(entry.id);
      return;
    }
    await this.processOne(entry, summary);
  }

  private metadataPending(id: string): boolean {
    return this.opts.store
      .unsyncedOps()
      .some((op) => op.entity === "attachment" && op.entityId === id);
  }

  private async wasRemoved(id: string): Promise<boolean> {
    if (this.removed.has(id)) return true;
    return !(await this.opts.persistence.listAttachmentQueue()).some((e) => e.id === id);
  }

  private async onPutSuccess(entry: AttachmentUploadInfo, summary: DrainSummary): Promise<void> {
    if (!entry.metaReleased) {
      this.releaseMetadata(entry);
      // The metadata ops must be durable BEFORE the release flag: a crash in between must find
      // metaReleased=false and release again (duplicates merge by LWW).
      await this.opts.store.flush?.();
    }
    if (this.metadataPending(entry.id)) {
      await this.save({
        ...entry,
        state: "stored",
        metaReleased: true,
        attempts: 0,
        nextAttemptAt: this.now() + BLOB_REFRESH_MS,
        lastError: null,
      });
    } else {
      await this.opts.persistence.deleteAttachmentUpload(entry.id);
    }
    this.emit({ id: entry.id, state: "stored" });
    summary.stored++;
  }

  private async onPutFailure(
    entry: AttachmentUploadInfo,
    err: unknown,
    summary: DrainSummary,
  ): Promise<void> {
    const status = terminalStatus(err);
    const attempts = entry.attempts + 1;
    const gaveUp = err instanceof ApiError && status === null && attempts >= MAX_SERVER_ATTEMPTS;
    if ((status !== null && status !== 403) || gaveUp) {
      // No retry helps, and metadata must not go out for a blob that will never exist.
      await this.save({
        ...entry,
        state: "failed",
        lastError: message(err),
      });
      this.emit({ id: entry.id, state: "failed", error: message(err) });
      summary.failed++;
      return;
    }
    if (status === 403) {
      // 403: cancelled rather than failed if the task is tombstoned or absent.
      const taskGone = this.opts.store.get("task", entry.taskId) === null;
      const state: AttachmentUploadState = taskGone ? "cancelled" : "failed";
      await this.save({ ...entry, state, lastError: message(err) });
      this.emit({ id: entry.id, state, error: message(err) });
      if (taskGone) summary.cancelled++;
      else summary.failed++;
      return;
    }
    // Transient: back off with jitter (or as the server said), and release the metadata if this was
    // the first settled attempt.
    const waitMs = Math.max(
      this.backoffDelay(attempts),
      err instanceof ApiError ? (err.retryAfterMs ?? 0) : 0,
    );
    const nextAttemptAt = this.now() + waitMs;
    const error = message(err);
    if (!entry.metaReleased) {
      this.releaseMetadata(entry);
      await this.opts.store.flush?.(); // same ordering rule as onPutSuccess
    }
    await this.save({
      ...entry,
      attempts,
      nextAttemptAt,
      lastError: error,
      state: "queued",
      metaReleased: true,
    });
    this.emit({ id: entry.id, state: "queued", error });
    summary.retried++;
  }

  private releaseMetadata(entry: AttachmentUploadInfo): void {
    for (const { field, value } of attachmentMetadataFields(entry)) {
      // `task_id` is written first so the attachment resolves to its task's current scope and the
      // held key is wrapped for it.
      const released =
        field === "wrapped_key"
          ? rewrapAttachmentKey(this.opts.store, this.opts.keyring, entry.id, value, [
              { kind: "personal" },
            ])
          : value;
      this.opts.store.set("attachment", entry.id, field, released);
    }
  }

  private async save(info: AttachmentUploadInfo): Promise<void> {
    await this.opts.persistence.updateAttachmentUpload(info);
  }

  private backoffDelay(attempts: number): number {
    const delay = Math.min(this.baseMs * 2 ** (attempts - 1), this.maxMs);
    return Math.round(delay * (1 - this.jitter + 2 * this.jitter * this.random()));
  }

  private emit(event: AttachmentQueueEvent): void {
    this.opts.onStateChange?.(event);
  }
}

const TERMINAL_STATUSES = new Set([400, 403, 404, 405, 409, 413]);

function terminalStatus(err: unknown): number | null {
  if (err instanceof ApiError && TERMINAL_STATUSES.has(err.status)) return err.status;
  return null;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
