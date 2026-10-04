import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";

export { bytesToHex, hexToBytes, randomBytes };

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Node's `Buffer`, where the runtime has one; the browser and Hermes use the fallbacks below. */
type NodeBufferCtor = {
  from(
    data: ArrayBufferLike | string,
    offsetOrEncoding?: number | "base64",
    length?: number,
  ): Uint8Array & { toString(encoding: "base64"): string };
};

export function bytesToBase64(bytes: Uint8Array): string {
  const Buf = (globalThis as { Buffer?: NodeBufferCtor }).Buffer;
  if (Buf) {
    return Buf.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const Buf = (globalThis as { Buffer?: NodeBufferCtor }).Buffer;
  if (Buf) {
    const buf = Buf.from(b64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = globalThis.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
