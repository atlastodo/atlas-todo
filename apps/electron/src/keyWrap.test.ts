import { describe, expect, it } from "vitest";
import {
  decryptBytes,
  encryptBytes,
  MAX_PLAIN_BYTES,
  osKeyStoreUsable,
  type SafeStorageApi,
} from "./keyWrap";

/**
 * A stand-in for Electron's `safeStorage`: "encrypts" by prefixing and reversing, which is enough to
 * tell a sealed value from its plain text and to reject what it did not make.
 */
function fakeSafeStorage(
  opts: { available?: boolean; backend?: string; failEncrypt?: boolean } = {},
): SafeStorageApi {
  const available = opts.available ?? true;
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => opts.backend ?? "gnome_libsecret",
    encryptString: (plainText) => {
      if (opts.failEncrypt) throw new Error("keychain locked");
      return Buffer.from(`v11${[...plainText].reverse().join("")}`, "latin1");
    },
    decryptString: (encrypted) => {
      const text = encrypted.toString("latin1");
      if (!text.startsWith("v11")) throw new Error("Error while decrypting the ciphertext");
      return [...text.slice(3)].reverse().join("");
    },
  };
}

const BYTES = new Uint8Array([0, 1, 2, 250, 255, 10, 13, 34]);

describe("osKeyStoreUsable", () => {
  it("uses the OS key store wherever it is available, off Linux", () => {
    expect(osKeyStoreUsable(fakeSafeStorage(), "darwin")).toBe(true);
    expect(osKeyStoreUsable(fakeSafeStorage(), "win32")).toBe(true);
    expect(osKeyStoreUsable(fakeSafeStorage({ available: false }), "darwin")).toBe(false);
  });

  it("refuses Linux's plain-text backend, and a backend not known yet", () => {
    expect(osKeyStoreUsable(fakeSafeStorage({ backend: "gnome_libsecret" }), "linux")).toBe(true);
    expect(osKeyStoreUsable(fakeSafeStorage({ backend: "kwallet6" }), "linux")).toBe(true);
    expect(osKeyStoreUsable(fakeSafeStorage({ backend: "basic_text" }), "linux")).toBe(false);
    expect(osKeyStoreUsable(fakeSafeStorage({ backend: "unknown" }), "linux")).toBe(false);
    // The backend only matters on Linux.
    expect(osKeyStoreUsable(fakeSafeStorage({ backend: "basic_text" }), "darwin")).toBe(true);
  });

  it("counts a throwing key store as unusable", () => {
    const broken = {
      ...fakeSafeStorage(),
      isEncryptionAvailable: () => {
        throw new Error("not ready");
      },
    };
    expect(osKeyStoreUsable(broken, "win32")).toBe(false);
  });
});

describe("encryptBytes / decryptBytes", () => {
  it("round-trips any bytes, and the sealed form is not the plain text", () => {
    const ss = fakeSafeStorage();
    const sealed = encryptBytes(ss, "linux", BYTES)!;
    expect(sealed).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(sealed).includes(Buffer.from(BYTES))).toBe(false);
    expect(decryptBytes(ss, "linux", sealed)).toEqual(BYTES);
  });

  it("answers null where the key store is unusable, both ways", () => {
    const sealed = encryptBytes(fakeSafeStorage(), "linux", BYTES)!;
    const plainText = fakeSafeStorage({ backend: "basic_text" });
    expect(encryptBytes(plainText, "linux", BYTES)).toBeNull();
    expect(decryptBytes(plainText, "linux", sealed)).toBeNull();
    const unavailable = fakeSafeStorage({ available: false });
    expect(encryptBytes(unavailable, "win32", BYTES)).toBeNull();
    expect(decryptBytes(unavailable, "win32", sealed)).toBeNull();
  });

  it("answers null instead of throwing when the key store fails", () => {
    expect(encryptBytes(fakeSafeStorage({ failEncrypt: true }), "darwin", BYTES)).toBeNull();
    expect(decryptBytes(fakeSafeStorage(), "darwin", new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("takes only a byte string of bounded size", () => {
    const ss = fakeSafeStorage();
    for (const junk of ["text", 42, null, undefined, { length: 3 }, [1, 2, 3]]) {
      expect(encryptBytes(ss, "darwin", junk)).toBeNull();
      expect(decryptBytes(ss, "darwin", junk)).toBeNull();
    }
    expect(encryptBytes(ss, "darwin", new Uint8Array(MAX_PLAIN_BYTES))).not.toBeNull();
    expect(encryptBytes(ss, "darwin", new Uint8Array(MAX_PLAIN_BYTES + 1))).toBeNull();
  });

  it("refuses a decrypted value that is not one of its own", () => {
    const ss = fakeSafeStorage();
    // Decrypts, but to text that encryptBytes never produces.
    const foreign = new Uint8Array(ss.encryptString("not base64!"));
    expect(decryptBytes(ss, "darwin", foreign)).toBeNull();
  });
});
