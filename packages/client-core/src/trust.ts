/**
 * What this account trusts about key distribution, stored where the server cannot forge it: fields
 * of one `preference` entity, encrypted under the personal key and synced across the user's devices.
 * The server's key rows, canonical-key choice and member public keys are unauthenticated, so the
 * client acts on them only within what the user did: accepted invites (`accepted:<projectId>`),
 * keys the user minted (`minted:<projectId>`), pinned public keys (`pin:...`, `identity:<userId>`),
 * verified safety numbers (`verified:<userId>`), rotation-retired keys (`retired:...`), and
 * migration baselines. Each fact is its own field, so devices recording different facts never
 * overwrite each other. The sync decoder accepts only current-format values for this entity.
 */

import type { Keyring } from "./crypto";
import type { LocalStore } from "./store";

export const KEY_TRUST_ID = "00000000-0000-4000-8000-00000000e2ee";

export interface PinnedIdentity {
  publicKey: string;
  signingKey: string | null;
}

export interface KeyTrust {
  initialized: boolean;
  legacyMigrated: boolean;
  accepted: ReadonlySet<string>;
  minted: ReadonlyMap<string, string>;
  pins: ReadonlyMap<string, string>;
  firstKeyMembers: ReadonlyMap<string, ReadonlySet<string>>;
  identities: ReadonlyMap<string, PinnedIdentity>;
  verified: ReadonlyMap<string, string>;
  retired: ReadonlySet<string>;
}

export const EMPTY_KEY_TRUST: KeyTrust = {
  initialized: false,
  legacyMigrated: false,
  accepted: new Set(),
  minted: new Map(),
  pins: new Map(),
  firstKeyMembers: new Map(),
  identities: new Map(),
  verified: new Map(),
  retired: new Set(),
};

const HEX64 = /^[0-9a-f]{64}$/;

function parseIdentity(value: string): PinnedIdentity | null {
  const [publicKey, signingKey, ...rest] = value.split(":");
  if (rest.length > 0 || !publicKey || !HEX64.test(publicKey)) return null;
  if (signingKey && !HEX64.test(signingKey)) return null;
  return { publicKey, signingKey: signingKey || null };
}

type TrustStore = Pick<LocalStore, "get">;
export type TrustWriter = Pick<LocalStore, "get" | "set">;

export function readKeyTrust(store: TrustStore): KeyTrust {
  const fields = store.get("preference", KEY_TRUST_ID);
  if (!fields) return EMPTY_KEY_TRUST;
  const accepted = new Set<string>();
  const minted = new Map<string, string>();
  const pins = new Map<string, string>();
  const firstKeyMembers = new Map<string, ReadonlySet<string>>();
  const identities = new Map<string, PinnedIdentity>();
  const verified = new Map<string, string>();
  const retired = new Set<string>();
  for (const [field, value] of Object.entries(fields)) {
    if (field.startsWith("accepted:") && value === true) {
      accepted.add(field.slice("accepted:".length));
    } else if (field.startsWith("minted:") && typeof value === "string") {
      minted.set(field.slice("minted:".length), value);
    } else if (field.startsWith("pin:") && typeof value === "string") {
      pins.set(field.slice("pin:".length), value);
    } else if (field.startsWith("first_key_members:") && typeof value === "string") {
      const ids = value.split(",").filter((id) => id !== "");
      firstKeyMembers.set(field.slice("first_key_members:".length), new Set(ids));
    } else if (field.startsWith("identity:") && typeof value === "string") {
      const identity = parseIdentity(value);
      if (identity) identities.set(field.slice("identity:".length), identity);
    } else if (field.startsWith("verified:") && typeof value === "string") {
      verified.set(field.slice("verified:".length), value);
    } else if (field.startsWith("retired:") && value === true) {
      retired.add(field.slice("retired:".length));
    }
  }
  return {
    initialized: fields.keys_initialized === true,
    legacyMigrated: fields.legacy_migrated === true,
    accepted,
    minted,
    pins,
    firstKeyMembers,
    identities,
    verified,
    retired,
  };
}

function write(store: TrustWriter, field: string, value: unknown): void {
  if (store.get("preference", KEY_TRUST_ID)?.[field] === value) return;
  store.set("preference", KEY_TRUST_ID, field, value);
}

/**
 * Record that the user accepted `projectId`'s invite. Refused for the user's own project, or a
 * server-made-up invite could replace its key.
 */
export function recordAcceptedProject(
  store: Pick<LocalStore, "get" | "set" | "list">,
  projectId: string,
): boolean {
  if (readKeyTrust(store).minted.has(projectId)) return false;
  const unsharedOwn =
    store.get("project", projectId) !== null &&
    !store.list("project_member").some((e) => e.fields.project_id === projectId);
  if (unsharedOwn) return false;
  write(store, `accepted:${projectId}`, true);
  return true;
}

export function recordMintedKey(store: TrustWriter, projectId: string, keyId: string): void {
  write(store, `minted:${projectId}`, keyId);
}

/**
 * Record the members of a project shared before project keys existed, as they stand at its first
 * key: only these are pinned on first delivery; later members went through an invite.
 */
export function recordFirstKeyMembers(
  store: TrustWriter,
  projectId: string,
  userIds: readonly string[],
): void {
  write(store, `first_key_members:${projectId}`, [...userIds].sort().join(","));
}

export function pinMemberKey(
  store: TrustWriter,
  projectId: string,
  userId: string,
  publicKey: string,
): void {
  write(store, `pin:${projectId}:${userId}`, publicKey);
}

export function unpinMemberKey(store: TrustWriter, projectId: string, userId: string): void {
  const field = `pin:${projectId}:${userId}`;
  if (store.get("preference", KEY_TRUST_ID)?.[field] == null) return;
  store.set("preference", KEY_TRUST_ID, field, null);
}

export function pinnedMemberKey(
  trust: KeyTrust,
  projectId: string,
  userId: string,
): string | undefined {
  return trust.pins.get(`${projectId}:${userId}`);
}

/**
 * Record once per account the shares joined before invites were recorded: each project where the
 * user is a non-owner active member becomes `accepted`. Trusts memberships as they stand at the
 * upgrade; run only on a synced store. Returns whether it recorded anything.
 */
export function recordLegacySharesAccepted(
  store: Pick<LocalStore, "get" | "set" | "list">,
  userId: string,
): boolean {
  if (store.get("preference", KEY_TRUST_ID)?.legacy_shares_recorded === true) return false;
  const trust = readKeyTrust(store);
  let recorded = false;
  for (const e of store.list("project_member")) {
    const projectId = e.fields.project_id;
    if (typeof projectId !== "string" || e.fields.user_id !== userId) continue;
    if (e.fields.state !== "active" || e.fields.role === "owner") continue;
    if (trust.minted.has(projectId) || trust.accepted.has(projectId)) continue;
    write(store, `accepted:${projectId}`, true);
    recorded = true;
  }
  write(store, "legacy_shares_recorded", true);
  return recorded;
}

export type IdentityStatus = "trusted" | "changed" | "unknown";

export interface IdentityObservation {
  status: IdentityStatus;
  pinned: PinnedIdentity | null;
}

/**
 * Compare the identity keys published for `userId` with the pin, pinning on first use and filling
 * in a later-published signing key. A changed or missing pinned key is `changed` and the pin keeps
 * the old keys. With a null `store`, nothing is pinned.
 */
export function observeIdentity(
  store: TrustWriter | null,
  trust: KeyTrust,
  userId: string,
  published: { publicKey?: string | null; signingKey?: string | null },
): IdentityObservation {
  const publicKey = published.publicKey?.toLowerCase() || null;
  const signingKey = published.signingKey?.toLowerCase() || null;
  const stored = store?.get("preference", KEY_TRUST_ID)?.[`identity:${userId}`];
  const pinned = store
    ? typeof stored === "string"
      ? parseIdentity(stored)
      : null
    : (trust.identities.get(userId) ?? null);
  if (!pinned) {
    if (!publicKey || !HEX64.test(publicKey)) return { status: "unknown", pinned: null };
    const identity = {
      publicKey,
      signingKey: signingKey && HEX64.test(signingKey) ? signingKey : null,
    };
    if (store) write(store, `identity:${userId}`, formatIdentity(identity));
    return { status: "trusted", pinned: identity };
  }
  if (publicKey !== pinned.publicKey) return { status: "changed", pinned };
  if (pinned.signingKey) {
    return signingKey === pinned.signingKey
      ? { status: "trusted", pinned }
      : { status: "changed", pinned };
  }
  if (signingKey && HEX64.test(signingKey)) {
    const identity = { publicKey: pinned.publicKey, signingKey };
    if (store) write(store, `identity:${userId}`, formatIdentity(identity));
    return { status: "trusted", pinned: identity };
  }
  return { status: "trusted", pinned };
}

function formatIdentity(identity: PinnedIdentity): string {
  return `${identity.publicKey}:${identity.signingKey ?? ""}`;
}

/** Forget `userId`'s identity pin and verification, so a new invite pins afresh. */
export function forgetIdentity(store: TrustWriter, userId: string): void {
  for (const field of [`identity:${userId}`, `verified:${userId}`]) {
    if (store.get("preference", KEY_TRUST_ID)?.[field] != null) {
      store.set("preference", KEY_TRUST_ID, field, null);
    }
  }
}

export function recordVerified(store: TrustWriter, userId: string, number: string | null): void {
  const field = `verified:${userId}`;
  if (number === null) {
    if (store.get("preference", KEY_TRUST_ID)?.[field] != null) {
      store.set("preference", KEY_TRUST_ID, field, null);
    }
    return;
  }
  write(store, field, number);
}

export function isVerified(trust: KeyTrust, userId: string, number: string): boolean {
  return trust.verified.get(userId) === number;
}

export function recordRetiredKey(store: TrustWriter, projectId: string, keyId: string): void {
  write(store, `retired:${projectId}:${keyId}`, true);
}

export function recordLegacyMigrated(store: TrustWriter): void {
  write(store, "legacy_migrated", true);
}

/**
 * Record once per account the keys an upgraded account already uses: `minted` when the user owns
 * the project, else `accepted`. Trusts the distribution as it stands at the upgrade.
 */
export function recordKeyTrustBaseline(
  store: Pick<LocalStore, "get" | "set" | "list">,
  keyring: Keyring,
  userId: string,
): void {
  const trust = readKeyTrust(store);
  if (trust.initialized) return;
  for (const projectId of keyring.projectIds()) {
    const keyId = keyring.canonicalKeyId(projectId);
    if (!keyId || !keyring.getProjectKey(projectId)) continue;
    const mine = store
      .list("project_member")
      .find((e) => e.fields.project_id === projectId && e.fields.user_id === userId);
    const owner = !mine || (mine.fields.role === "owner" && mine.fields.state === "active");
    if (owner) {
      if (!trust.minted.has(projectId) && !trust.accepted.has(projectId)) {
        recordMintedKey(store, projectId, keyId);
      }
    } else if (!trust.minted.has(projectId)) {
      write(store, `accepted:${projectId}`, true);
    }
  }
  write(store, "keys_initialized", true);
}
