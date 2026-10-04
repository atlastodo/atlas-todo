import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Entity ids. Every synced id must be a valid UUID: the server stores `entity_id` in a Postgres
 * `UUID` column, so a non-UUID id makes `POST /sync/push` reject the whole batch with 422.
 */
export const PREFERENCES_ID = "00000000-0000-4000-8000-000000000001";

// SHA-256 over `namespace NUL key`, as an RFC 9562 version-8 UUID. Deterministic, so offline
// devices converge on one row. NUL cannot occur in a namespace, so no two pairs share a seed.
export function derivedUuidV2(namespace: string, key: string): string {
  const bytes = sha256(utf8(`${namespace}\u0000${key}`)).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80; // version 8
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 9562 variant
  const hex = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

// Legacy, kept only to recognise old ids; use {@link derivedUuidV2}. Real keys collide (32-bit
// hash state) and ("a:b", "c") collides with ("a", "b:c").
export function derivedUuidV1(namespace: string, key: string): string {
  const seed = `${namespace}:${key}`;
  // xmur3 (string to 32-bit seeds) feeding sfc32: a string-to-bytes stream without a crypto
  // dependency (Hermes has no global `crypto`).
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  let a = next(),
    b = next(),
    c = next(),
    d = next();
  const rand = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  const bytes: number[] = [];
  for (let i = 0; i < 4; i++) {
    const word = rand();
    bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
