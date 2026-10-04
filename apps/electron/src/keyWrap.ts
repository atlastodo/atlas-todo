/**
 * The OS key store bridge behind `atlasDesktop.safeStorage`: the renderer wraps its session key set
 * with Electron's `safeStorage` instead of a WebCrypto key in the same browser profile. Free of
 * `electron` imports so it unit-tests under Node. It answers `null` rather than throwing, so the
 * renderer falls back to its WebCrypto wrap when the key store is unusable.
 */

/** The part of Electron's `safeStorage` used here. */
export interface SafeStorageApi {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** The largest byte string the bridge encrypts; the session key set is well under 1 KiB. */
export const MAX_PLAIN_BYTES = 16 * 1024;
// Base64 grows the plain text by a third, and the OS adds a header, a nonce and a tag.
const MAX_SEALED_BYTES = 2 * MAX_PLAIN_BYTES;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Whether `safeStorage` protects anything here. Linux without a keyring (`basic_text`) uses a key
 * hard-coded into Chromium, and the backend is `unknown` before ready; both count as unusable.
 */
export function osKeyStoreUsable(safeStorage: SafeStorageApi, platform: string): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (platform !== "linux") return true;
    const backend = safeStorage.getSelectedStorageBackend();
    return backend !== "basic_text" && backend !== "unknown";
  } catch {
    return false;
  }
}

/** `plain` encrypted with the OS key store, or null when it cannot be (or is not a byte string). */
export function encryptBytes(
  safeStorage: SafeStorageApi,
  platform: string,
  plain: unknown,
): Uint8Array | null {
  if (!(plain instanceof Uint8Array) || plain.byteLength > MAX_PLAIN_BYTES) return null;
  if (!osKeyStoreUsable(safeStorage, platform)) return null;
  try {
    // `encryptString` takes text; base64 carries any bytes through.
    const sealed = safeStorage.encryptString(Buffer.from(plain).toString("base64"));
    return new Uint8Array(sealed);
  } catch {
    return null;
  }
}

/** The bytes `sealed` was made from by {@link encryptBytes}, or null when it does not open here. */
export function decryptBytes(
  safeStorage: SafeStorageApi,
  platform: string,
  sealed: unknown,
): Uint8Array | null {
  if (!(sealed instanceof Uint8Array) || sealed.byteLength > MAX_SEALED_BYTES) return null;
  if (!osKeyStoreUsable(safeStorage, platform)) return null;
  try {
    const text = safeStorage.decryptString(Buffer.from(sealed));
    if (!BASE64.test(text)) return null;
    return new Uint8Array(Buffer.from(text, "base64"));
  } catch {
    return null;
  }
}
