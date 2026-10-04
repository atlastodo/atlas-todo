/**
 * The attachment blob format: a file encrypted under its own key (AEK) in fixed-size chunks, so
 * no client ever holds the whole file.
 *
 * ```text
 * bytes 0..8     magic "ATLSBLOB"
 * byte  8        format version (2)
 * bytes 9..13    chunk size, u32 big-endian (64 KiB as written here)
 * bytes 13..21   nonce prefix, random per file
 * then per chunk AES-256-GCM ciphertext ‖ 16-byte tag
 * ```
 *
 * STREAM construction: chunk `i` uses nonce `prefix ‖ u32be(i)` and authenticates the header plus
 * a flag byte that is 1 on the last chunk only, so reordering, dropping, appending or a changed
 * header all fail. Every chunk but the last is exactly the chunk size.
 *
 * Older clients wrote one AES-256-GCM message (12-byte IV, ciphertext, tag), recognised by the
 * missing magic: still read, never written.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes, utf8ToBytes } from "./utils";

/** Verification failed (address, chunk, truncation or plain-sha mismatch): the bytes must never be trusted. */
export class BlobIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobIntegrityError";
  }
}

const MAGIC = utf8ToBytes("ATLSBLOB");
export const BLOB_FORMAT_VERSION = 2;
export const BLOB_HEADER_LENGTH = MAGIC.length + 1 + 4 + 8;
export const BLOB_CHUNK_SIZE = 64 * 1024;
export const BLOB_TAG_LENGTH = 16;
/** Opening holds one chunk at a time, so a header naming enormous chunks is refused. */
const MAX_CHUNK_SIZE = 4 * 1024 * 1024;
const LEGACY_IV_LENGTH = 12;

export function sealedBlobSize(plainSize: number, chunkSize: number = BLOB_CHUNK_SIZE): number {
  const chunks = Math.max(1, Math.ceil(plainSize / chunkSize));
  return BLOB_HEADER_LENGTH + plainSize + chunks * BLOB_TAG_LENGTH;
}

export function maxPlainSize(blobSize: number, chunkSize: number = BLOB_CHUNK_SIZE): number {
  const room = blobSize - BLOB_HEADER_LENGTH;
  if (room < BLOB_TAG_LENGTH) return 0;
  const full = Math.floor(room / (chunkSize + BLOB_TAG_LENGTH));
  const rest = room - full * (chunkSize + BLOB_TAG_LENGTH);
  return full * chunkSize + Math.max(0, rest - BLOB_TAG_LENGTH);
}

function chunkNonce(prefix: Uint8Array, index: number): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setUint32(8, index, false);
  return nonce;
}

function chunkAad(header: Uint8Array, final: boolean): Uint8Array {
  const aad = new Uint8Array(header.length + 1);
  aad.set(header, 0);
  aad[header.length] = final ? 1 : 0;
  return aad;
}

/** Write {@link header} first, then each {@link seal} result in order. */
export class BlobSealer {
  readonly header: Uint8Array;
  readonly chunkSize: number;
  private readonly prefix: Uint8Array;
  private index = 0;
  private done = false;

  constructor(
    private readonly aek: Uint8Array,
    opts: { chunkSize?: number; noncePrefix?: Uint8Array } = {},
  ) {
    if (aek.length !== 32) throw new Error(`AES-256 key must be 32 bytes, got ${aek.length}`);
    this.chunkSize = opts.chunkSize ?? BLOB_CHUNK_SIZE;
    if (this.chunkSize < 1 || this.chunkSize > MAX_CHUNK_SIZE) {
      throw new Error(`chunk size ${this.chunkSize} is out of range`);
    }
    this.prefix = opts.noncePrefix ?? randomBytes(8);
    if (this.prefix.length !== 8) throw new Error("the nonce prefix must be 8 bytes");
    const header = new Uint8Array(BLOB_HEADER_LENGTH);
    header.set(MAGIC, 0);
    header[MAGIC.length] = BLOB_FORMAT_VERSION;
    new DataView(header.buffer).setUint32(MAGIC.length + 1, this.chunkSize, false);
    header.set(this.prefix, MAGIC.length + 5);
    this.header = header;
  }

  /** Exactly {@link chunkSize} bytes, or at most that for the last (`final`). */
  seal(chunk: Uint8Array, final: boolean): Uint8Array {
    if (this.done) throw new Error("the blob is already sealed");
    if (final ? chunk.length > this.chunkSize : chunk.length !== this.chunkSize) {
      throw new Error(`chunk ${this.index} has ${chunk.length} bytes`);
    }
    if (this.index > 0xffffffff) throw new Error("too many chunks");
    const nonce = chunkNonce(this.prefix, this.index);
    const sealed = gcm(this.aek, nonce, chunkAad(this.header, final)).encrypt(chunk);
    this.index++;
    this.done = final;
    return sealed;
  }
}

/** {@link push} returns authenticated chunks (the last only once the end is known); call {@link finish} at the end. */
export class BlobOpener {
  private readonly head = new Uint8Array(BLOB_HEADER_LENGTH);
  private headLength = 0;
  private format: "chunked" | "legacy" | null = null;
  private header: Uint8Array | null = null;
  private prefix: Uint8Array | null = null;
  /** The chunk being filled: opened only once more bytes show it is not the last. */
  private chunk: Uint8Array | null = null;
  private chunkLength = 0;
  private index = 0;
  private legacy: Uint8Array[] = [];
  private finished = false;

  constructor(private readonly aek: Uint8Array) {
    if (aek.length !== 32) throw new Error(`AES-256 key must be 32 bytes, got ${aek.length}`);
  }

  push(bytes: Uint8Array): Uint8Array[] {
    if (this.finished) throw new Error("the blob is already finished");
    const out: Uint8Array[] = [];
    let at = 0;
    if (this.format === null) {
      const take = Math.min(BLOB_HEADER_LENGTH - this.headLength, bytes.length);
      this.head.set(bytes.subarray(0, take), this.headLength);
      this.headLength += take;
      at = take;
      if (this.headLength >= MAGIC.length && !this.hasMagic()) {
        this.format = "legacy";
        this.legacy.push(this.head.slice(0, this.headLength));
      } else if (this.headLength === BLOB_HEADER_LENGTH) {
        this.readHeader();
      }
    }
    if (this.format === "legacy") {
      if (at < bytes.length) this.legacy.push(bytes.slice(at));
      return out;
    }
    const chunk = this.chunk;
    if (this.format !== "chunked" || !chunk) return out;
    while (at < bytes.length) {
      if (this.chunkLength === chunk.length) {
        // More bytes follow a full chunk, so it is not the last one.
        out.push(this.open(chunk, false));
        this.chunkLength = 0;
      }
      const take = Math.min(chunk.length - this.chunkLength, bytes.length - at);
      chunk.set(bytes.subarray(at, at + take), this.chunkLength);
      this.chunkLength += take;
      at += take;
    }
    return out;
  }

  finish(): Uint8Array[] {
    if (this.finished) throw new Error("the blob is already finished");
    this.finished = true;
    if (this.format === null) {
      // Only part of a chunked blob's header arrived, or too little of anything to tell.
      if (this.headLength >= MAGIC.length) {
        throw new BlobIntegrityError("the blob ends inside its header");
      }
      this.legacy.push(this.head.slice(0, this.headLength));
    }
    if (this.format !== "chunked") return [this.openLegacy()];
    if (this.chunkLength < BLOB_TAG_LENGTH) {
      throw new BlobIntegrityError("the blob is cut short: its last chunk is missing");
    }
    return [this.open(this.chunk!.subarray(0, this.chunkLength), true)];
  }

  private hasMagic(): boolean {
    for (let i = 0; i < MAGIC.length; i++) if (this.head[i] !== MAGIC[i]) return false;
    return true;
  }

  private readHeader(): void {
    const view = new DataView(this.head.buffer);
    const version = this.head[MAGIC.length];
    if (version !== BLOB_FORMAT_VERSION) {
      throw new BlobIntegrityError(`unknown blob format version ${version}`);
    }
    const chunkSize = view.getUint32(MAGIC.length + 1, false);
    if (chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
      throw new BlobIntegrityError(`blob chunk size ${chunkSize} is out of range`);
    }
    this.format = "chunked";
    this.header = this.head.slice();
    this.prefix = this.head.slice(MAGIC.length + 5, BLOB_HEADER_LENGTH);
    this.chunk = new Uint8Array(chunkSize + BLOB_TAG_LENGTH);
  }

  private open(sealed: Uint8Array, final: boolean): Uint8Array {
    const nonce = chunkNonce(this.prefix!, this.index);
    try {
      const plain = gcm(this.aek, nonce, chunkAad(this.header!, final)).decrypt(sealed);
      this.index++;
      return plain;
    } catch {
      throw new BlobIntegrityError(
        final
          ? `the blob's last chunk (${this.index}) does not open: tampered, wrong key, or cut short`
          : `blob chunk ${this.index} does not open: tampered, reordered or wrong key`,
      );
    }
  }

  private openLegacy(): Uint8Array {
    const length = this.legacy.reduce((n, piece) => n + piece.length, 0);
    if (length < LEGACY_IV_LENGTH + BLOB_TAG_LENGTH) {
      throw new BlobIntegrityError(
        `blob is ${length} bytes — too short to carry the ${LEGACY_IV_LENGTH}-byte IV prefix and ${BLOB_TAG_LENGTH}-byte tag`,
      );
    }
    const whole = new Uint8Array(length);
    let at = 0;
    for (const piece of this.legacy) {
      whole.set(piece, at);
      at += piece.length;
    }
    this.legacy = [];
    try {
      return gcm(this.aek, whole.subarray(0, LEGACY_IV_LENGTH)).decrypt(
        whole.subarray(LEGACY_IV_LENGTH),
      );
    } catch {
      throw new BlobIntegrityError("the blob does not open: tampered or wrong key");
    }
  }
}
