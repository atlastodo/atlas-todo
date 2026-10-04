/**
 * Password to 32-byte master key, which HKDF expands into the auth hash and the MEK. Each account
 * names its version and parameters (`GET /auth/salt`).
 *
 * - 1: PBKDF2-HMAC-SHA256, 600 000 iterations, over the password as typed. Upgraded at sign-in.
 * - 2: Argon2id (RFC 9106, 0x13) over the NFC-normalized password, so differently composed
 *   accents derive the same key. Version 1 cannot normalize without locking such passwords out.
 */
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "./utils";

export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

export interface Pbkdf2Kdf {
  version: 1;
  iterations: number;
}

export interface Argon2idKdf {
  version: 2;
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

export type PasswordKdf = Pbkdf2Kdf | Argon2idKdf;

export const LEGACY_KDF: Pbkdf2Kdf = Object.freeze({
  version: 1,
  iterations: DEFAULT_PBKDF2_ITERATIONS,
});

/**
 * Argon2id, 64 MiB, 3 passes, 1 lane (clients run lanes serially, so extra lanes only help an
 * attacker); about 1-2 s on a mid-range phone. Must change together with `Kdf::CURRENT` in
 * `atlas-server/src/auth/kdf.rs`.
 */
export const CURRENT_KDF: Argon2idKdf = Object.freeze({
  version: 2,
  memoryKib: 65_536,
  iterations: 3,
  parallelism: 1,
});

/**
 * Accepted server parameters, inclusive. The floor is {@link CURRENT_KDF}: weaker ones would let a
 * malicious server collect a cheaply brute-forceable credential. The ceiling spares phones.
 */
const ARGON2ID_BOUNDS = {
  memoryKib: [65_536, 262_144],
  iterations: [3, 10],
  parallelism: [1, 4],
} as const;

export class UnsupportedKdfError extends Error {
  constructor(detail: string) {
    super(`unsupported password KDF: ${detail}`);
    this.name = "UnsupportedKdfError";
  }
}

export interface KdfWire {
  kdf_version: number;
  kdf_params: Record<string, number>;
}

/** `null` for a server predating per-account KDFs. Throws {@link UnsupportedKdfError} on unknown or out-of-bounds values. */
export function kdfFromWire(version: unknown, params: unknown): PasswordKdf | null {
  if (version === undefined || version === null) {
    if (params === undefined || params === null) return null;
    throw new UnsupportedKdfError("kdf_params without kdf_version");
  }
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new UnsupportedKdfError(`version ${String(version)} without kdf_params`);
  }
  const fields = params as Record<string, unknown>;
  const names = Object.keys(fields).sort().join(",");
  const int = (name: string): number => {
    const value = fields[name];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw new UnsupportedKdfError(`${name} is not an integer`);
    }
    return value;
  };
  const bounded = (name: string, [min, max]: readonly [number, number]): number => {
    const value = int(name);
    if (value < min || value > max) throw new UnsupportedKdfError(`${name} ${value} out of bounds`);
    return value;
  };
  if (version === 1) {
    if (names !== "iterations" || int("iterations") !== DEFAULT_PBKDF2_ITERATIONS) {
      throw new UnsupportedKdfError("version 1 parameters");
    }
    return LEGACY_KDF;
  }
  if (version === 2) {
    if (names !== "iterations,memory_kib,parallelism") {
      throw new UnsupportedKdfError("version 2 parameters");
    }
    return {
      version: 2,
      memoryKib: bounded("memory_kib", ARGON2ID_BOUNDS.memoryKib),
      iterations: bounded("iterations", ARGON2ID_BOUNDS.iterations),
      parallelism: bounded("parallelism", ARGON2ID_BOUNDS.parallelism),
    };
  }
  throw new UnsupportedKdfError(`version ${String(version)}`);
}

export function kdfToWire(kdf: PasswordKdf): KdfWire {
  return kdf.version === 1
    ? { kdf_version: 1, kdf_params: { iterations: kdf.iterations } }
    : {
        kdf_version: 2,
        kdf_params: {
          iterations: kdf.iterations,
          memory_kib: kdf.memoryKib,
          parallelism: kdf.parallelism,
        },
      };
}

export function sameKdf(a: PasswordKdf, b: PasswordKdf): boolean {
  const x = kdfToWire(a);
  const y = kdfToWire(b);
  return (
    x.kdf_version === y.kdf_version && JSON.stringify(x.kdf_params) === JSON.stringify(y.kdf_params)
  );
}

/** A server naming none predates per-account KDFs, so only a version-1 credential keeps the account usable. */
export function kdfForNewCredential(saltLookup: { kdf_version?: number | null }): PasswordKdf {
  return saltLookup.kdf_version === undefined || saltLookup.kdf_version === null
    ? LEGACY_KDF
    : CURRENT_KDF;
}

export interface DerivedKeys {
  authHash: string;
  mek: Uint8Array;
}

export function generateSalt(): string {
  return bytesToHex(randomBytes(16));
}

/**
 * Version 1 in synchronous pure JS: seconds-slow on a phone and it blocks the JS thread. Prefer
 * {@link deriveAuthAndMekAsync}.
 */
export function deriveAuthAndMek(
  password: string,
  saltHex: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): DerivedKeys {
  const salt = hexToBytes(saltHex);
  const masterKey = pbkdf2(sha256, password, salt, { c: iterations, dkLen: 32 });
  return expandDerivedKeys(masterKey);
}

/** Platform hook; must match the pure-JS output byte for byte, or the account becomes unloggable. */
export type Pbkdf2Provider = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
) => Promise<Uint8Array>;

let pbkdf2Provider: Pbkdf2Provider | null = null;

export function setPbkdf2Provider(provider: Pbkdf2Provider | null): void {
  pbkdf2Provider = provider;
}

export type Argon2idParams = Omit<Argon2idKdf, "version">;

/** Platform hook (type 2, 0x13, no secret or AD); must match {@link argon2idPortable} byte for byte. */
export type Argon2idProvider = (
  password: Uint8Array,
  salt: Uint8Array,
  params: Argon2idParams,
  keyLength: number,
) => Promise<Uint8Array>;

let argon2idProvider: Argon2idProvider | null = null;

export function setArgon2idProvider(provider: Argon2idProvider | null): void {
  argon2idProvider = provider;
}

/**
 * Argon2id in pure JS (@noble/hashes) where no provider is registered (iOS, tests). Very slow on
 * Hermes; the async variant yields to the event loop between chunks.
 */
export function argon2idPortable(
  password: Uint8Array,
  salt: Uint8Array,
  params: Argon2idParams,
  keyLength: number,
): Promise<Uint8Array> {
  return argon2idAsync(password, salt, {
    t: params.iterations,
    m: params.memoryKib,
    p: params.parallelism,
    dkLen: keyLength,
  });
}

/** A provider that throws falls back to portable: slow beats none. */
export async function deriveAuthAndMekAsync(
  password: string,
  saltHex: string,
  kdf: PasswordKdf,
): Promise<DerivedKeys> {
  const salt = hexToBytes(saltHex);
  const masterKey =
    kdf.version === 1
      ? await pbkdf2MasterKey(utf8ToBytes(password), salt, kdf.iterations)
      : await argon2idMasterKey(utf8ToBytes(password.normalize("NFC")), salt, kdf);
  return expandDerivedKeys(masterKey);
}

async function pbkdf2MasterKey(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  if (pbkdf2Provider) {
    try {
      return await pbkdf2Provider(passwordBytes, salt, iterations, 32);
    } catch (err) {
      console.warn("[atlas-kdf] native PBKDF2 failed, falling back to pure JS:", err);
      return pbkdf2(sha256, passwordBytes, salt, { c: iterations, dkLen: 32 });
    }
  }
  const subtle = webCryptoSubtle();
  if (subtle) {
    // `as BufferSource`: our buffers are never SharedArrayBuffer-backed, but TS 5.7+
    // `Uint8Array<ArrayBufferLike>` is not assignable to the DOM's `BufferSource`.
    const key = await subtle.importKey("raw", passwordBytes as BufferSource, "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
      key,
      32 * 8,
    );
    return new Uint8Array(bits);
  }
  // No WebCrypto (plain-HTTP web on a non-localhost origin, or an engine without subtle).
  return pbkdf2(sha256, passwordBytes, salt, { c: iterations, dkLen: 32 });
}

async function argon2idMasterKey(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  kdf: Argon2idKdf,
): Promise<Uint8Array> {
  const params: Argon2idParams = {
    memoryKib: kdf.memoryKib,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
  };
  if (argon2idProvider) {
    try {
      const key = await argon2idProvider(passwordBytes, salt, params, 32);
      if (key.length === 32) return key;
      throw new Error(`Argon2id returned ${key.length} bytes`);
    } catch (err) {
      console.warn("[atlas-kdf] platform Argon2id failed, falling back to pure JS:", err);
    }
  }
  return argon2idPortable(passwordBytes, salt, params, 32);
}

function expandDerivedKeys(masterKey: Uint8Array): DerivedKeys {
  const authHashBytes = hkdf(sha256, masterKey, undefined, utf8ToBytes("atlas-auth-v1"), 32);
  const mek = hkdf(sha256, masterKey, undefined, utf8ToBytes("atlas-mek-v1"), 32);
  return {
    authHash: bytesToHex(authHashBytes),
    mek,
  };
}

function webCryptoSubtle(): SubtleCrypto | null {
  const c = globalThis.crypto as Crypto | undefined;
  return c && typeof c.subtle?.deriveBits === "function" ? c.subtle : null;
}
