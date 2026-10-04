/**
 * Field-value encryption: the `{ __enc: 2, kid, iv, ct }` envelope. The AES-GCM associated data binds
 * a value to its envelope version, entity kind and id, field name, key scope and key id, so
 * ciphertext the server copies elsewhere fails to open instead of being read or re-encrypted there.
 * The JSON plaintext is padded to a size bucket so length does not reveal `true` from `false` or a
 * short title from a long one. Version 1 (unpadded, no associated data) is read, never written.
 */

import { decryptAesGcm, encryptAesGcm } from "./aes";
import { bytesToUtf8, utf8ToBytes } from "./utils";

export const FIELD_ENVELOPE_VERSION = 2;

export type KeyScope = { kind: "personal" } | { kind: "project"; projectId: string };

export interface FieldLocation {
  entity: string;
  entityId: string;
  field: string;
}

export interface FieldEnvelopeV2 {
  __enc: 2;
  kid: string;
  iv: string;
  ct: string;
}

export function sameKeyScope(a: KeyScope, b: KeyScope): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "personal" || a.projectId === (b as { projectId: string }).projectId;
}

export function keyScopeLabel(scope: KeyScope): string {
  return scope.kind === "personal" ? "personal" : `project:${scope.projectId}`;
}

/** The associated data: every part length-delimited by JSON, so no two contexts collide. */
function fieldAad(at: FieldLocation, scope: KeyScope, kid: string): Uint8Array {
  return utf8ToBytes(
    JSON.stringify([
      "atlas-field",
      FIELD_ENVELOPE_VERSION,
      at.entity,
      at.entityId,
      at.field,
      keyScopeLabel(scope),
      kid,
    ]),
  );
}

/**
 * The padded size for `n` bytes of plaintext plus the one-byte pad marker: at least 32, then the
 * next power of two up to 1 KiB, then the next multiple of 1 KiB.
 */
export function paddedLength(n: number): number {
  const needed = n + 1;
  if (needed <= 32) return 32;
  if (needed <= 1024) return 2 ** Math.ceil(Math.log2(needed));
  return Math.ceil(needed / 1024) * 1024;
}

/** Append 0x80 and zeros up to the bucket size (ISO/IEC 7816-4 padding). */
export function padPlaintext(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(paddedLength(data.length));
  out.set(data, 0);
  out[data.length] = 0x80;
  return out;
}

export function unpadPlaintext(data: Uint8Array): Uint8Array {
  let end = data.length - 1;
  while (end >= 0 && data[end] === 0) end--;
  if (end < 0 || data[end] !== 0x80) throw new Error("bad field padding");
  return data.subarray(0, end);
}

export function encryptField(
  key: Uint8Array,
  kid: string,
  scope: KeyScope,
  at: FieldLocation,
  value: unknown,
): FieldEnvelopeV2 {
  const plain = padPlaintext(utf8ToBytes(JSON.stringify(value)));
  const { iv, ct } = encryptAesGcm(key, plain, fieldAad(at, scope, kid));
  return { __enc: 2, kid, iv, ct };
}

/**
 * Open a v2 envelope that claims to sit at `at` and to be encrypted by `key` of `scope`. Throws
 * when any of that is untrue: another key, another scope, or a value copied from elsewhere.
 */
export function decryptField(
  key: Uint8Array,
  scope: KeyScope,
  at: FieldLocation,
  envelope: FieldEnvelopeV2,
): unknown {
  const plain = decryptAesGcm(key, envelope, fieldAad(at, scope, envelope.kid));
  return JSON.parse(bytesToUtf8(unpadPlaintext(plain)));
}

export function isFieldEnvelopeV2(v: unknown): v is FieldEnvelopeV2 {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.__enc === 2 &&
    typeof o.kid === "string" &&
    typeof o.iv === "string" &&
    typeof o.ct === "string"
  );
}
