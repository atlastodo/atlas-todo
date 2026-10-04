import { gcm } from "@noble/ciphers/aes.js";
import { base64ToBytes, bytesToBase64, bytesToUtf8, randomBytes, utf8ToBytes } from "./utils";

export interface EncryptedPayload {
  iv: string;
  ct: string;
}

/**
 * AES-256-GCM encryption with a fresh 12-byte IV. `aad` is authenticated but not encrypted:
 * decryption fails unless the same bytes are supplied.
 */
export function encryptAesGcm(
  key: Uint8Array,
  plaintext: Uint8Array | string,
  aad?: Uint8Array,
): EncryptedPayload {
  if (key.byteLength !== 32) {
    throw new Error(`AES-256 key must be 32 bytes, got ${key.byteLength}`);
  }
  const iv = randomBytes(12);
  const data = typeof plaintext === "string" ? utf8ToBytes(plaintext) : plaintext;
  const cipher = gcm(key, iv, aad);
  const ciphertextWithTag = cipher.encrypt(data);

  return {
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ciphertextWithTag),
  };
}

export function decryptAesGcm(
  key: Uint8Array,
  payload: EncryptedPayload,
  aad?: Uint8Array,
): Uint8Array {
  if (key.byteLength !== 32) {
    throw new Error(`AES-256 key must be 32 bytes, got ${key.byteLength}`);
  }
  const iv = base64ToBytes(payload.iv);
  const ciphertextWithTag = base64ToBytes(payload.ct);
  const cipher = gcm(key, iv, aad);
  return cipher.decrypt(ciphertextWithTag);
}

export function encryptJson(key: Uint8Array, data: unknown): EncryptedPayload {
  const jsonStr = JSON.stringify(data);
  return encryptAesGcm(key, jsonStr);
}

export function decryptJson<T = unknown>(key: Uint8Array, payload: EncryptedPayload): T {
  const decryptedBytes = decryptAesGcm(key, payload);
  const jsonStr = bytesToUtf8(decryptedBytes);
  return JSON.parse(jsonStr) as T;
}
