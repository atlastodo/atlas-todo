import { describe, expect, it, vi } from "vitest";
import {
  decryptBytes,
  encryptBytes,
  MAX_PLAIN_BYTES,
  osKeyStoreUsable,
  type SafeStorageApi,
  UNAVAILABLE_RETRY_MS,
} from "./keyWrap";

const UNAVAILABLE = "safeStorage.decryptStringAsync is temporarily unavailable. Please try again.";

/**
 * A stand-in for Electron's asynchronous `safeStorage`: "encrypts" by prefixing and reversing,
 * which is enough to tell a sealed value from its plain text and to reject what it did not make.
 * `tag` is the key's version prefix (`v10` is Chromium's hard-coded fallback key on Linux); `rotated`
 * reports every decrypt as under an old key; `unavailableFor` fails that many decrypts as
 * temporarily unavailable first.
 */
function fakeSafeStorage(
  opts: {
    available?: boolean;
    backend?: string;
    failEncrypt?: boolean;
    rotated?: boolean;
    unavailableFor?: number;
    tag?: string;
  } = {},
) {
  let unavailable = opts.unavailableFor ?? 0;
  const tag = opts.tag ?? "v11";
  const api = {
    isAsyncEncryptionAvailable: async () => opts.available ?? true,
    getSelectedStorageBackend: () => opts.backend ?? "gnome_libsecret",
    encryptStringAsync: async (plainText: string) => {
      if (opts.failEncrypt) throw new Error("keychain locked");
      return Buffer.from(`${tag}${[...plainText].reverse().join("")}`, "latin1");
    },
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
      if (unavailable > 0) {
        unavailable--;
        throw new Error(UNAVAILABLE);
      }
      const text = encrypted.toString("latin1");
      if (!text.startsWith(tag)) throw new Error("Error while decrypting the ciphertext");
      return {
        shouldReEncrypt: opts.rotated ?? false,
        result: [...text.slice(3)].reverse().join(""),
      };
    }),
  } satisfies SafeStorageApi;
  return api;
}

const BYTES = new Uint8Array([0, 1, 2, 250, 255, 10, 13, 34]);
const noWait = async () => {};

describe("osKeyStoreUsable", () => {
  it("uses the OS key store wherever it is available, off Linux", async () => {
    expect(await osKeyStoreUsable(fakeSafeStorage(), "darwin")).toBe(true);
    expect(await osKeyStoreUsable(fakeSafeStorage(), "win32")).toBe(true);
    expect(await osKeyStoreUsable(fakeSafeStorage({ available: false }), "darwin")).toBe(false);
  });

  it("refuses Linux's plain-text backend, and a backend not known yet", async () => {
    const usable = (backend: string, platform = "linux") =>
      osKeyStoreUsable(fakeSafeStorage({ backend }), platform);
    expect(await usable("gnome_libsecret")).toBe(true);
    expect(await usable("kwallet6")).toBe(true);
    expect(await usable("basic_text")).toBe(false);
    expect(await usable("unknown")).toBe(false);
    // The backend only matters on Linux.
    expect(await usable("basic_text", "darwin")).toBe(true);
  });

  it("counts a throwing key store as unusable", async () => {
    const broken = {
      ...fakeSafeStorage(),
      isAsyncEncryptionAvailable: () => Promise.reject(new Error("not ready")),
    };
    expect(await osKeyStoreUsable(broken, "win32")).toBe(false);
  });
});

describe("encryptBytes / decryptBytes", () => {
  it("round-trips any bytes, and the sealed form is not the plain text", async () => {
    const ss = fakeSafeStorage();
    const sealed = (await encryptBytes(ss, "linux", BYTES))!;
    expect(sealed).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(sealed).includes(Buffer.from(BYTES))).toBe(false);
    expect(await decryptBytes(ss, "linux", sealed)).toEqual({ plain: BYTES, reseal: false });
  });

  it("asks for a fresh seal when the OS key was rotated", async () => {
    const sealed = (await encryptBytes(fakeSafeStorage(), "darwin", BYTES))!;
    expect(await decryptBytes(fakeSafeStorage({ rotated: true }), "darwin", sealed)).toEqual({
      plain: BYTES,
      reseal: true,
    });
  });

  it("answers null where the key store is unusable, both ways", async () => {
    const sealed = (await encryptBytes(fakeSafeStorage(), "linux", BYTES))!;
    const plainText = fakeSafeStorage({ backend: "basic_text" });
    expect(await encryptBytes(plainText, "linux", BYTES)).toBeNull();
    expect(await decryptBytes(plainText, "linux", sealed)).toBeNull();
    const unavailable = fakeSafeStorage({ available: false });
    expect(await encryptBytes(unavailable, "win32", BYTES)).toBeNull();
    expect(await decryptBytes(unavailable, "win32", sealed)).toBeNull();
  });

  it("refuses Linux's hard-coded fallback key, which the async API uses when the keyring is out of reach", async () => {
    const fallback = fakeSafeStorage({ tag: "v10" });
    expect(await encryptBytes(fallback, "linux", BYTES)).toBeNull();
    expect(await encryptBytes(fakeSafeStorage({ tag: "v12" }), "linux", BYTES)).not.toBeNull();
    // macOS and Windows tag their real Keychain and DPAPI keys v10.
    const sealed = (await encryptBytes(fallback, "darwin", BYTES))!;
    expect(sealed).not.toBeNull();
    expect(await decryptBytes(fallback, "win32", sealed)).toEqual({ plain: BYTES, reseal: false });
  });

  it("answers null instead of throwing when the key store fails", async () => {
    expect(await encryptBytes(fakeSafeStorage({ failEncrypt: true }), "darwin", BYTES)).toBeNull();
    const ss = fakeSafeStorage();
    expect(await decryptBytes(ss, "darwin", new Uint8Array([1, 2, 3]), [10], noWait)).toBeNull();
    // A plain failure is not retried.
    expect(ss.decryptStringAsync).toHaveBeenCalledTimes(1);
  });

  it("retries a temporarily unavailable key store, then gives up", async () => {
    const sealed = (await encryptBytes(fakeSafeStorage(), "darwin", BYTES))!;
    const wait = vi.fn(noWait);

    const slow = fakeSafeStorage({ unavailableFor: 2 });
    expect(await decryptBytes(slow, "darwin", sealed, [5, 10, 20], wait)).toEqual({
      plain: BYTES,
      reseal: false,
    });
    expect(wait.mock.calls).toEqual([[5], [10]]);

    wait.mockClear();
    const gone = fakeSafeStorage({ unavailableFor: 99 });
    expect(await decryptBytes(gone, "darwin", sealed, [5, 10], wait)).toBeNull();
    expect(gone.decryptStringAsync).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[5], [10]]);
  });

  it("waits about two seconds in all by default", () => {
    const total = UNAVAILABLE_RETRY_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(1500);
    expect(total).toBeLessThanOrEqual(2500);
  });

  it("takes only a byte string of bounded size", async () => {
    const ss = fakeSafeStorage();
    for (const junk of ["text", 42, null, undefined, { length: 3 }, [1, 2, 3]]) {
      expect(await encryptBytes(ss, "darwin", junk)).toBeNull();
      expect(await decryptBytes(ss, "darwin", junk)).toBeNull();
    }
    expect(await encryptBytes(ss, "darwin", new Uint8Array(MAX_PLAIN_BYTES))).not.toBeNull();
    expect(await encryptBytes(ss, "darwin", new Uint8Array(MAX_PLAIN_BYTES + 1))).toBeNull();
  });

  it("refuses a decrypted value that is not one of its own", async () => {
    const ss = fakeSafeStorage();
    // Decrypts, but to text that encryptBytes never produces.
    const foreign = new Uint8Array(await ss.encryptStringAsync("not base64!"));
    expect(await decryptBytes(ss, "darwin", foreign)).toBeNull();
  });
});
