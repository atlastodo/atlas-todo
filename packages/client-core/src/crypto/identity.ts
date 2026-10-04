/**
 * The Ed25519 identity signing key, delivery signatures and safety numbers.
 * - The private half is wrapped under the DEK (bound to its public half), so a password change,
 *   recovery or KDF change never touches it.
 * - An owner signs each delivery over a length-prefixed encoding of a domain string, project id,
 *   recipient id, key id and sealed bytes; a made-up or moved delivery does not verify against the
 *   pinned key.
 * - A safety number is Signal's construction over both identity keys and both account ids, sorted
 *   so both members see the same 60 digits.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { decryptAesGcm, encryptAesGcm } from "./aes";
import { sealKey, type SealedKey } from "./asym";
import { base64ToBytes, bytesToHex, hexToBytes, utf8ToBytes } from "./utils";

export interface SigningKeypair {
  publicKey: string;
  secretKey: Uint8Array;
}

export interface WrappedSigningKey {
  v: 1;
  iv: string;
  ct: string;
}

export function generateSigningKeypair(): SigningKeypair {
  const { secretKey, publicKey } = ed25519.keygen();
  return { publicKey: bytesToHex(publicKey), secretKey };
}

export function signingPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(ed25519.getPublicKey(secretKey));
}

const signingWrapAad = (publicKey: string) =>
  utf8ToBytes(JSON.stringify(["atlas-signing-key-wrap", 1, publicKey.toLowerCase()]));

export function wrapSigningKey(secretKey: Uint8Array, dek: Uint8Array): WrappedSigningKey {
  return { v: 1, ...encryptAesGcm(dek, secretKey, signingWrapAad(signingPublicKey(secretKey))) };
}

/**
 * Open a stored signing key published as `publicKey`; throws if the DEK does not open it for that
 * key or it is not that key's secret half.
 */
export function unwrapSigningKey(
  wrapped: { iv: string; ct: string },
  dek: Uint8Array,
  publicKey: string,
): Uint8Array {
  const secretKey = decryptAesGcm(dek, wrapped, signingWrapAad(publicKey));
  if (secretKey.byteLength !== 32) throw new Error("the signing key is not 32 bytes");
  if (signingPublicKey(secretKey) !== publicKey.toLowerCase()) {
    throw new Error("the stored signing key does not match the published one");
  }
  return secretKey;
}

export interface DeliveryFields {
  projectId: string;
  recipientId: string;
  keyId: string;
  sealed: SealedKey;
}

const DELIVERY_DOMAIN = "atlas-key-delivery-v1";

function lengthPrefixed(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + 4 + p.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const part of parts) {
    view.setUint32(at, part.length);
    out.set(part, at + 4);
    at += 4 + part.length;
  }
  return out;
}

/**
 * The signed bytes: each field length-prefixed (u32 big-endian) so no two deliveries encode alike;
 * ids lowercased; the sealed key as bytes, not JSON.
 */
export function deliveryMessage(fields: DeliveryFields): Uint8Array {
  return lengthPrefixed([
    utf8ToBytes(DELIVERY_DOMAIN),
    utf8ToBytes(fields.projectId.toLowerCase()),
    utf8ToBytes(fields.recipientId.toLowerCase()),
    utf8ToBytes(fields.keyId),
    hexToBytes(fields.sealed.ephemeralPublicKey),
    base64ToBytes(fields.sealed.encryptedKey.iv),
    base64ToBytes(fields.sealed.encryptedKey.ct),
  ]);
}

export function signDelivery(secretKey: Uint8Array, fields: DeliveryFields): string {
  return bytesToHex(ed25519.sign(deliveryMessage(fields), secretKey));
}

export function verifyDelivery(
  publicKey: string,
  signature: string,
  fields: DeliveryFields,
): boolean {
  try {
    return ed25519.verify(hexToBytes(signature), deliveryMessage(fields), hexToBytes(publicKey));
  } catch {
    return false;
  }
}

export function sealDelivery(
  pek: Uint8Array,
  opts: {
    projectId: string;
    recipientId: string;
    recipientPublicKey: string;
    keyId: string;
    signingKey: Uint8Array;
  },
): { sealed: SealedKey; signature: string } {
  const sealed = sealKey(pek, opts.recipientPublicKey);
  const signature = signDelivery(opts.signingKey, {
    projectId: opts.projectId,
    recipientId: opts.recipientId,
    keyId: opts.keyId,
    sealed,
  });
  return { sealed, signature };
}

export interface IdentityKeys {
  userId: string;
  publicKey: string;
  signingKey: string;
}

const SAFETY_NUMBER_VERSION = new Uint8Array([0, 1]);
const SAFETY_NUMBER_ITERATIONS = 5200;

function fingerprintDigits(side: IdentityKeys): string {
  const keys = new Uint8Array(64);
  keys.set(hexToBytes(side.publicKey), 0);
  keys.set(hexToBytes(side.signingKey), 32);
  const id = utf8ToBytes(side.userId.toLowerCase());
  const first = new Uint8Array(SAFETY_NUMBER_VERSION.length + keys.length + id.length);
  first.set(SAFETY_NUMBER_VERSION, 0);
  first.set(keys, SAFETY_NUMBER_VERSION.length);
  first.set(id, SAFETY_NUMBER_VERSION.length + keys.length);
  let hash = sha512(first);
  const round = new Uint8Array(hash.length + keys.length);
  for (let i = 0; i < SAFETY_NUMBER_ITERATIONS; i++) {
    round.set(hash, 0);
    round.set(keys, hash.length);
    hash = sha512(round);
  }
  let digits = "";
  for (let chunk = 0; chunk < 6; chunk++) {
    let n = 0;
    for (let b = 0; b < 5; b++) n = n * 256 + hash[chunk * 5 + b]!;
    digits += String(n % 100000).padStart(5, "0");
  }
  return digits;
}

/**
 * The safety number of two accounts: 60 digits, the same from either side; changes with either
 * account's X25519 or Ed25519 key.
 */
export function safetyNumber(a: IdentityKeys, b: IdentityKeys): string {
  const sides = [fingerprintDigits(a), fingerprintDigits(b)].sort();
  return sides.join("");
}

export function safetyNumberGroups(number: string): string[] {
  return number.match(/\d{5}/g) ?? [];
}
