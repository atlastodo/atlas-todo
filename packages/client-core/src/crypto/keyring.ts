import { sha256 } from "@noble/hashes/sha2.js";
import { signingPublicKey } from "./identity";
import { bytesToHex, utf8ToBytes } from "./utils";

export const DEK_KEY_ID = "dek";

const KEY_ID_DOMAIN = utf8ToBytes("atlas-pek-id-v1");

/**
 * The non-secret fingerprint of a project key: hex of the first 16 bytes of
 * SHA-256("atlas-pek-id-v1" || PEK). The server stores and names canonical keys by it.
 */
export function projectKeyId(pek: Uint8Array): string {
  const input = new Uint8Array(KEY_ID_DOMAIN.length + pek.length);
  input.set(KEY_ID_DOMAIN, 0);
  input.set(pek, KEY_ID_DOMAIN.length);
  return bytesToHex(sha256(input).subarray(0, 16));
}

/**
 * A shared project's key is not on this device. Encrypting with anything else would fork the
 * project or hide the value from co-members, so the caller must defer.
 */
export class MissingScopeKey extends Error {
  constructor(public readonly projectId: string) {
    super(`no key for shared project ${projectId}`);
    this.name = "MissingScopeKey";
  }
}

export interface HeldKey {
  projectId: string | null;
  keyId: string;
  key: Uint8Array;
}

/**
 * In-memory manager for decrypted keys during a session; never persisted unencrypted and zeroed on
 * logout or lock. A project can hold several keys: the canonical one for new content, and older
 * ones only to decrypt. Keys a rotation retired stay decrypt-only: what they opened is history.
 */
export class Keyring {
  private dek: Uint8Array | null = null;
  private userPrivateKey: Uint8Array | null = null;
  private userPublicKey: string | null = null;
  private signingKey: Uint8Array | null = null;
  private signingPublic: string | null = null;
  private readonly peks = new Map<string, Map<string, Uint8Array>>();
  private readonly canonical = new Map<string, string>();
  private readonly retired = new Map<string, Set<string>>();

  constructor(opts?: {
    dek?: Uint8Array;
    userPrivateKey?: Uint8Array;
    userPublicKey?: string;
    privateKey?: Uint8Array;
    publicKey?: string;
    signingKey?: Uint8Array;
  }) {
    if (opts?.dek) this.setDek(opts.dek);
    const priv = opts?.userPrivateKey ?? opts?.privateKey;
    const pub = opts?.userPublicKey ?? opts?.publicKey;
    if (priv && pub) {
      this.setUserKeypair(pub, priv);
    } else if (priv) {
      this.userPrivateKey = new Uint8Array(priv);
    }
    if (opts?.signingKey) this.setSigningKey(opts.signingKey);
  }

  setDek(dek: Uint8Array): void {
    if (dek.byteLength !== 32) throw new Error("DEK must be 32 bytes");
    this.dek = new Uint8Array(dek);
  }

  getDek(): Uint8Array {
    if (!this.dek) throw new Error("DEK not unlocked in Keyring");
    return this.dek;
  }

  setUserKeypair(publicKey: string, privateKey: Uint8Array): void {
    if (privateKey.byteLength !== 32) throw new Error("User private key must be 32 bytes");
    this.userPublicKey = publicKey;
    this.userPrivateKey = new Uint8Array(privateKey);
  }

  getUserPublicKey(): string | null {
    return this.userPublicKey;
  }

  getUserPrivateKey(): Uint8Array {
    if (!this.userPrivateKey) throw new Error("User private key not unlocked in Keyring");
    return this.userPrivateKey;
  }

  getPrivateKey(): Uint8Array | null {
    return this.userPrivateKey;
  }

  setSigningKey(secretKey: Uint8Array): void {
    if (secretKey.byteLength !== 32) throw new Error("Signing key must be 32 bytes");
    this.signingKey?.fill(0);
    this.signingKey = new Uint8Array(secretKey);
    this.signingPublic = signingPublicKey(this.signingKey);
  }

  getSigningKey(): Uint8Array | null {
    return this.signingKey;
  }

  getSigningPublicKey(): string | null {
    return this.signingPublic;
  }

  addProjectKey(projectId: string, keyId: string, pek: Uint8Array): boolean {
    if (pek.byteLength !== 32) throw new Error("PEK must be 32 bytes");
    let keys = this.peks.get(projectId);
    if (!keys) {
      keys = new Map();
      this.peks.set(projectId, keys);
    }
    const isNew = !keys.has(keyId);
    keys.set(keyId, new Uint8Array(pek));
    return isNew;
  }

  /**
   * Name the key new content of `projectId` is encrypted with, possibly one not held yet; writes
   * then wait rather than fork.
   */
  setCanonical(projectId: string, keyId: string): void {
    this.canonical.set(projectId, keyId);
  }

  canonicalKeyId(projectId: string): string | undefined {
    return this.canonical.get(projectId);
  }

  setProjectKey(projectId: string, pek: Uint8Array): string {
    const keyId = projectKeyId(pek);
    this.addProjectKey(projectId, keyId, pek);
    this.setCanonical(projectId, keyId);
    return keyId;
  }

  getProjectKey(projectId: string): Uint8Array | undefined {
    const keyId = this.canonical.get(projectId);
    return keyId === undefined ? undefined : this.peks.get(projectId)?.get(keyId);
  }

  projectKey(projectId: string, keyId: string): Uint8Array | undefined {
    return this.peks.get(projectId)?.get(keyId);
  }

  setRetiredKeys(projectId: string, keyIds: Iterable<string>): void {
    const ids = new Set(keyIds);
    if (ids.size === 0) this.retired.delete(projectId);
    else this.retired.set(projectId, ids);
  }

  retireKey(projectId: string, keyId: string): void {
    let ids = this.retired.get(projectId);
    if (!ids) this.retired.set(projectId, (ids = new Set()));
    ids.add(keyId);
  }

  /** Whether a rotation retired `keyId`: it opens history and nothing is re-encrypted from it. */
  isRetired(projectId: string, keyId: string): boolean {
    return this.retired.get(projectId)?.has(keyId) ?? false;
  }

  projectIds(): string[] {
    return [...this.peks.keys()];
  }

  projectsWithKey(keyId: string): string[] {
    return [...this.peks].filter(([, keys]) => keys.has(keyId)).map(([projectId]) => projectId);
  }

  /**
   * Forget every project key and canonical choice, keeping the DEK and keypair, to reload under
   * rules that may reject some.
   */
  clearProjectKeys(): void {
    for (const keys of this.peks.values()) {
      for (const key of keys.values()) key.fill(0);
    }
    this.peks.clear();
    this.canonical.clear();
    this.retired.clear();
  }

  projectKeys(projectId: string): { keyId: string; key: Uint8Array }[] {
    return [...(this.peks.get(projectId) ?? [])].map(([keyId, key]) => ({ keyId, key }));
  }

  allKeys(): HeldKey[] {
    const out: HeldKey[] = [];
    if (this.dek) out.push({ projectId: null, keyId: DEK_KEY_ID, key: this.dek });
    for (const [projectId, keys] of this.peks) {
      for (const [keyId, key] of keys) out.push({ projectId, keyId, key });
    }
    return out;
  }

  /**
   * The key new content is encrypted with: the project's canonical key if held, else the DEK for
   * personal or unshared content. A shared project without its key throws {@link MissingScopeKey}.
   */
  getKeyForScope(projectId: string | null | undefined, shared: boolean): Uint8Array {
    if (projectId) {
      const pek = this.getProjectKey(projectId);
      if (pek) return pek;
      if (shared) throw new MissingScopeKey(projectId);
    }
    return this.getDek();
  }

  hasKeys(): boolean {
    return this.dek !== null;
  }

  clear(): void {
    if (this.dek) {
      this.dek.fill(0);
      this.dek = null;
    }
    if (this.userPrivateKey) {
      this.userPrivateKey.fill(0);
      this.userPrivateKey = null;
    }
    this.userPublicKey = null;
    if (this.signingKey) {
      this.signingKey.fill(0);
      this.signingKey = null;
    }
    this.signingPublic = null;
    for (const keys of this.peks.values()) {
      for (const key of keys.values()) key.fill(0);
    }
    this.peks.clear();
    this.canonical.clear();
    this.retired.clear();
  }
}
