/**
 * Reloads project keys (PEKs) into the keyring after each unlock. The row's shape, not the
 * server's `kind` label, decides how it opens.
 *
 * Anyone can seal a key to the user and the server names the canonical key, so a sealed key loads
 * only with its owner's signature under the owner's pinned key, per the trust state (`trust.ts`,
 * docs/architecture.md#key-trust). Retired keys still open old content but are never canonical.
 */

import {
  unsealKey,
  unwrapProjectKey,
  verifyDelivery,
  wrapProjectKey,
  projectKeyId,
  type EncryptedPayload,
  type Keyring,
  type SealedKey,
  type WrappedProjectKey,
} from "./crypto";
import {
  EMPTY_KEY_TRUST,
  observeIdentity,
  pinMemberKey,
  recordMintedKey,
  recordRetiredKey,
  type KeyTrust,
  type TrustWriter,
} from "./trust";
import type { ProjectKeyRow, ProjectKeysResponse } from "./types";

export interface ProjectKeysTransport {
  listProjectKeys(): Promise<ProjectKeysResponse>;
  putProjectKey(
    projectId: string,
    encryptedPek: WrappedProjectKey | EncryptedPayload,
    keyId: string,
  ): Promise<void>;
}

export interface HydrateProjectKeysOptions {
  /** Before the trust state exists, an owned project's sole held key is canonical when the server names none. */
  isCreator?: (projectId: string) => boolean;
  /** Without a state (pre-upgrade account) keys load as they used to. */
  trust?: KeyTrust;
  userId?: string;
  /** Without it nothing is recorded and signers must already be pinned. */
  trustWriter?: TrustWriter | null;
}

export interface HydrateProjectKeysResult {
  added: number;
  failed: number;
  backfilled: number;
  /** Refused: invite not accepted, unsigned delivery of an unheld key, or a bad signature. */
  rejected: number;
  signerChanged: string[];
  changed: boolean;
}

const HEX64 = /^[0-9a-f]{64}$/i;

function isPayload(v: unknown): v is EncryptedPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.iv === "string" && typeof o.ct === "string";
}

function asSealed(v: unknown): SealedKey | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ephemeralPublicKey === "string" && isPayload(o.encryptedKey)) {
    return { ephemeralPublicKey: o.ephemeralPublicKey, encryptedKey: o.encryptedKey };
  }
  if (isPayload(v) && HEX64.test(v.iv)) {
    let inner: unknown;
    try {
      inner = JSON.parse(v.ct);
    } catch {
      return null;
    }
    if (isPayload(inner)) return { ephemeralPublicKey: v.iv, encryptedKey: inner };
  }
  return null;
}

export function isSealedKeyRow(encryptedPek: unknown): boolean {
  let value = encryptedPek;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return asSealed(value) !== null;
}

/** Throws when nothing opens it or it is the user's copy of another project's key. */
export function openProjectKeyRow(
  encryptedPek: unknown,
  keyring: Keyring,
  projectId: string,
): Uint8Array {
  let value = encryptedPek;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("unrecognised project key shape");
    }
  }
  const sealed = asSealed(value);
  const pek = sealed
    ? unsealKey(sealed, keyring.getUserPrivateKey())
    : isPayload(value)
      ? unwrapProjectKey(value, keyring.getDek(), projectId)
      : null;
  if (!pek) throw new Error("unrecognised project key shape");
  if (pek.byteLength !== 32) throw new Error(`project key is ${pek.byteLength} bytes`);
  return pek;
}

/** Idempotent; unopenable rows are logged and skipped. Throws only when the listing fails. */
export async function hydrateProjectKeys(
  api: ProjectKeysTransport,
  keyring: Keyring,
  opts: HydrateProjectKeysOptions = {},
): Promise<HydrateProjectKeysResult> {
  const response = await api.listProjectKeys();
  const trust = opts.trust ?? EMPTY_KEY_TRUST;
  const writer = opts.trustWriter ?? null;
  const result: HydrateProjectKeysResult = {
    added: 0,
    failed: 0,
    backfilled: 0,
    rejected: 0,
    signerChanged: [],
    changed: false,
  };
  const serverRetired = new Map<string, ReadonlySet<string>>(
    Object.entries(response.retired ?? {}).map(([projectId, ids]) => [projectId, new Set(ids)]),
  );
  const retiredHere = (projectId: string, keyId: string) =>
    serverRetired.get(projectId)?.has(keyId) === true || trust.retired.has(`${projectId}:${keyId}`);
  const takesSealed = (projectId: string, signer: string | null | undefined) =>
    trust.minted.has(projectId)
      ? // The user's own project: only from a co-owner they invited themselves.
        !!signer && trust.pins.has(`${projectId}:${signer}`)
      : trust.accepted.has(projectId) || !trust.initialized;
  const refuse = (row: ProjectKeyRow, why: string) => {
    result.rejected++;
    console.warn(`[atlas-e2ee] refused a key sealed for ${row.project_id}: ${why}`);
  };

  // Own fingerprinted, project-bound copies the server already has need no store.
  const stored = new Set<string>();
  for (const row of response.keys ?? []) {
    const bound = isPayload(row.encrypted_pek) && (row.encrypted_pek as { v?: unknown }).v === 2;
    if (row.kind === "wrapped" && row.key_id !== "" && bound)
      stored.add(`${row.project_id}/${row.key_id}`);
  }

  // Own copies first, so an unsigned delivery can be checked against the keys they hold.
  const rows = [...((response.keys ?? []) as ProjectKeyRow[])];
  const sealedRow = new Map(rows.map((row) => [row, isSealedKeyRow(row.encrypted_pek)]));
  rows.sort((a, b) => Number(sealedRow.get(a)) - Number(sealedRow.get(b)));

  const toBackfill = new Map<string, { projectId: string; keyId: string; pek: Uint8Array }>();
  const opened = new Map<string, Set<string>>();
  for (const row of rows) {
    const sealed = sealedRow.get(row) === true;
    if (sealed && !takesSealed(row.project_id, row.signed_by)) {
      refuse(
        row,
        trust.minted.has(row.project_id)
          ? "not from a co-owner of the user's own project"
          : "invite not accepted",
      );
      continue;
    }
    let pek: Uint8Array;
    try {
      pek = openProjectKeyRow(row.encrypted_pek, keyring, row.project_id);
    } catch (err) {
      result.failed++;
      console.warn(`[atlas-e2ee] skipped a project key row for ${row.project_id}:`, err);
      continue;
    }
    const keyId = projectKeyId(pek);
    if (sealed) {
      const verdict = checkDelivery(row, keyId, opts.userId, trust, writer);
      if (verdict === "changed") result.signerChanged.push(row.signed_by!);
      if (verdict === "unsigned") {
        // From before deliveries were signed: only a key this device already holds.
        if (!keyring.projectKey(row.project_id, keyId)) refuse(row, "unsigned delivery");
        continue;
      }
      if (verdict !== "ok") {
        refuse(row, verdict === "changed" ? "the signer's keys changed" : "bad signature");
        continue;
      }
    }
    if (row.key_id !== "" && row.key_id !== keyId) {
      console.warn(
        `[atlas-e2ee] project key ${row.key_id} of ${row.project_id} is really ${keyId}`,
      );
    }
    if (keyring.addProjectKey(row.project_id, keyId, pek)) result.added++;
    let ids = opened.get(row.project_id);
    if (!ids) opened.set(row.project_id, (ids = new Set()));
    ids.add(keyId);
    const slot = `${row.project_id}/${keyId}`;
    if (!stored.has(slot)) toBackfill.set(slot, { projectId: row.project_id, keyId, pek });
  }

  const choose = (projectId: string, keyId: string) => {
    if (keyring.canonicalKeyId(projectId) === keyId) return;
    keyring.setCanonical(projectId, keyId);
    result.changed = true;
  };
  const canonical = response.canonical ?? {};
  // The user's own project keeps the key they minted until a rotation retires it and the device
  // holds its replacement.
  for (const [projectId, keyId] of trust.minted) {
    const next = canonical[projectId];
    if (
      retiredHere(projectId, keyId) &&
      next !== undefined &&
      next !== keyId &&
      !retiredHere(projectId, next) &&
      keyring.projectKey(projectId, next)
    ) {
      choose(projectId, next);
      if (writer) {
        recordMintedKey(writer, projectId, next);
        recordRetiredKey(writer, projectId, keyId);
      }
    } else if (keyring.projectKey(projectId, keyId)) {
      choose(projectId, keyId);
    }
  }
  for (const [projectId, keyId] of Object.entries(canonical)) {
    if (trust.minted.has(projectId)) continue;
    if (!trust.accepted.has(projectId) && trust.initialized) continue;
    if (trust.retired.has(`${projectId}:${keyId}`)) {
      console.warn(`[atlas-e2ee] the server names a retired key of ${projectId} canonical`);
      continue;
    }
    choose(projectId, keyId);
    // Once the new key is here, the ones it replaced are never canonical again.
    if (writer && keyring.projectKey(projectId, keyId)) {
      for (const old of serverRetired.get(projectId) ?? []) {
        if (old !== keyId && keyring.projectKey(projectId, old)) {
          recordRetiredKey(writer, projectId, old);
        }
      }
    }
  }
  if (!trust.initialized) {
    for (const [projectId, ids] of opened) {
      if (projectId in canonical || ids.size !== 1) continue;
      if (keyring.canonicalKeyId(projectId) !== undefined) continue;
      if (!opts.isCreator?.(projectId)) continue;
      choose(projectId, [...ids][0]!);
    }
  }
  if (result.added > 0) result.changed = true;

  // What is history now: nothing opened with these keys is re-encrypted.
  const retiredProjects = new Set([
    ...serverRetired.keys(),
    ...[...trust.retired].map((slot) => slot.slice(0, slot.lastIndexOf(":"))),
  ]);
  for (const projectId of retiredProjects) {
    const ids = new Set(serverRetired.get(projectId) ?? []);
    for (const slot of trust.retired) {
      const at = slot.lastIndexOf(":");
      if (slot.slice(0, at) === projectId) ids.add(slot.slice(at + 1));
    }
    const current = keyring.canonicalKeyId(projectId);
    if (current !== undefined) ids.delete(current);
    keyring.setRetiredKeys(projectId, ids);
  }

  for (const { projectId, keyId, pek } of toBackfill.values()) {
    try {
      await api.putProjectKey(projectId, wrapProjectKey(pek, keyring.getDek(), projectId), keyId);
      result.backfilled++;
    } catch (err) {
      console.warn(`[atlas-e2ee] could not store project key ${keyId} of ${projectId}:`, err);
    }
  }
  return result;
}

/**
 * Checks the signer's pinned identity key (pinned on first sight) over project, user, fingerprint
 * and sealed bytes. A verified delivery also pins the signer's public key.
 */
function checkDelivery(
  row: ProjectKeyRow,
  keyId: string,
  userId: string | undefined,
  trust: KeyTrust,
  writer: TrustWriter | null,
): "ok" | "unsigned" | "changed" | "bad" {
  if (!row.signature) return "unsigned";
  const signer = row.signed_by;
  if (!signer || !userId || signer === userId || row.key_id !== keyId) return "bad";
  const sealed = sealedOf(row.encrypted_pek);
  if (!sealed) return "bad";
  const identity = observeIdentity(writer, trust, signer, {
    publicKey: row.signer_public_key,
    signingKey: row.signer_signing_key,
  });
  if (identity.status === "changed") return "changed";
  const signingKey = identity.pinned?.signingKey;
  if (!signingKey) return "bad";
  const valid = verifyDelivery(signingKey, row.signature, {
    projectId: row.project_id,
    recipientId: userId,
    keyId,
    sealed,
  });
  if (!valid) return "bad";
  const pin = `${row.project_id}:${signer}`;
  if (writer && !trust.minted.has(row.project_id) && !trust.pins.has(pin)) {
    pinMemberKey(writer, row.project_id, signer, identity.pinned!.publicKey);
  }
  return "ok";
}

function sealedOf(encryptedPek: unknown): SealedKey | null {
  let value = encryptedPek;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return asSealed(value);
}
