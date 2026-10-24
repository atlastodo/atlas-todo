/**
 * The OS key store bridge behind `atlasDesktop.safeStorage`: the renderer wraps its session key set
 * with Electron's `safeStorage` instead of a WebCrypto key in the same browser profile. Free of
 * `electron` imports so it unit-tests under Node. It answers `null` rather than throwing, so the
 * renderer falls back to its WebCrypto wrap when the key store is unusable.
 *
 * It uses the asynchronous `safeStorage` API (the synchronous one is gone in Electron 46), which
 * opens what the synchronous `encryptString` sealed, so existing sessions keep working.
 */

/** What `safeStorage.decryptStringAsync` resolves to. */
export interface DecryptedString {
  /** The OS key was rotated (or a stronger one is available): seal the plain text again. */
  shouldReEncrypt: boolean;
  result: string;
}

/** The part of Electron's `safeStorage` used here. */
export interface SafeStorageApi {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  getSelectedStorageBackend(): string;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<DecryptedString>;
}

/** What the decrypt bridge answers: the bytes, and whether the renderer should seal them again. */
export interface OpenedBytes {
  plain: Uint8Array;
  reseal: boolean;
}

/** The largest byte string the bridge encrypts; the session key set is well under 1 KiB. */
export const MAX_PLAIN_BYTES = 16 * 1024;
// Base64 grows the plain text by a third, and the OS adds a header, a nonce and a tag.
const MAX_SEALED_BYTES = 2 * MAX_PLAIN_BYTES;

/**
 * Waits between attempts at a decrypt the key store calls temporarily unavailable (a keyring still
 * unlocking at startup, say): about two seconds in all before the session reads as locked.
 */
export const UNAVAILABLE_RETRY_MS = [250, 500, 1250];

/**
 * The tag Chromium's asynchronous encryptor puts on Linux ciphertext made with its fallback key,
 * hard-coded into Chromium ("peanuts"). It is used when the selected keyring cannot be reached, even
 * with a `gnome_libsecret` or `kwallet*` backend, and the availability check still answers true. A
 * real key store tags `v11` (Secret Service) or `v12` (Secret Portal); macOS and Windows tag `v10`
 * with their real Keychain or DPAPI key.
 */
const LINUX_FALLBACK_TAG = "v10";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Whether `safeStorage` protects anything here. Linux without a keyring (`basic_text`) uses a key
 * hard-coded into Chromium, and the backend is `unknown` before ready; both count as unusable. The
 * backend is Chromium's `--password-store` choice, the same for the asynchronous API, whose
 * availability check alone answers true on any Linux once ready.
 */
export async function osKeyStoreUsable(
  safeStorage: SafeStorageApi,
  platform: string,
): Promise<boolean> {
  try {
    if (platform === "linux") {
      const backend = safeStorage.getSelectedStorageBackend();
      if (backend === "basic_text" || backend === "unknown") return false;
    }
    return await safeStorage.isAsyncEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * `plain` encrypted with the OS key store, or null when it cannot be (or is not a byte string), and
 * on Linux when the keyring was out of reach and Chromium's fallback key sealed it.
 */
export async function encryptBytes(
  safeStorage: SafeStorageApi,
  platform: string,
  plain: unknown,
): Promise<Uint8Array | null> {
  if (!(plain instanceof Uint8Array) || plain.byteLength > MAX_PLAIN_BYTES) return null;
  if (!(await osKeyStoreUsable(safeStorage, platform))) return null;
  try {
    // `encryptStringAsync` takes text; base64 carries any bytes through.
    const sealed = await safeStorage.encryptStringAsync(Buffer.from(plain).toString("base64"));
    if (platform === "linux" && sealed.subarray(0, 3).toString("latin1") === LINUX_FALLBACK_TAG) {
      return null;
    }
    return new Uint8Array(sealed);
  } catch {
    return null;
  }
}

/**
 * The bytes `sealed` was made from by {@link encryptBytes}, with whether to seal them again, or null
 * when it does not open here. A temporarily unavailable key store is retried before giving up.
 */
export async function decryptBytes(
  safeStorage: SafeStorageApi,
  platform: string,
  sealed: unknown,
  retryMs: readonly number[] = UNAVAILABLE_RETRY_MS,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<OpenedBytes | null> {
  if (!(sealed instanceof Uint8Array) || sealed.byteLength > MAX_SEALED_BYTES) return null;
  if (!(await osKeyStoreUsable(safeStorage, platform))) return null;
  for (let attempt = 0; ; attempt++) {
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(sealed));
      if (typeof result !== "string" || !BASE64.test(result)) return null;
      return { plain: new Uint8Array(Buffer.from(result, "base64")), reseal: !!shouldReEncrypt };
    } catch (e) {
      // Electron reports this case only in the message ("… is temporarily unavailable. …").
      const unavailable = e instanceof Error && /temporarily unavailable/i.test(e.message);
      if (!unavailable || attempt >= retryMs.length) return null;
      await wait(retryMs[attempt]!);
    }
  }
}
