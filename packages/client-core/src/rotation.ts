/**
 * Rotating a shared project's key after someone who held it left. The server asks the owners
 * (`GET /project-keys/rotations`) when a member is removed, leaves, declines a sent key, or is
 * purged. The first owner client mints a new key, stores its copy, delivers it signed to every
 * remaining member it has pinned, and completes the rotation: the new key becomes canonical and
 * older ones are retired (kept for reading). The member who left never receives it. Members this
 * owner never pinned get it from the owner who invited them via the usual missing-key delivery.
 */

import { apiErrorCode, type ApiClient } from "./api";
import { generatePek, projectKeyId, sealDelivery, wrapProjectKey, type Keyring } from "./crypto";
import {
  pinnedMemberKey,
  readKeyTrust,
  recordMintedKey,
  recordRetiredKey,
  type TrustWriter,
} from "./trust";

export type RotationTransport = Pick<
  ApiClient,
  | "listKeyRotations"
  | "putProjectKey"
  | "putMemberProjectKey"
  | "completeKeyRotation"
  | "listMembers"
>;

export interface RotationResult {
  rotated: string[];
  superseded: string[];
  failed: number;
  unpinned: number;
}

/**
 * Serve every pending rotation of a project this user owns (only `projectId`'s when given).
 * `removed` members must not get the new key even if still listed. Needs the signing key; without
 * it nothing is rotated.
 */
export async function performKeyRotations(
  api: RotationTransport,
  keyring: Keyring,
  store: TrustWriter,
  userId: string,
  opts: { projectId?: string; removed?: readonly string[] } = {},
): Promise<RotationResult> {
  const result: RotationResult = { rotated: [], superseded: [], failed: 0, unpinned: 0 };
  const signingKey = keyring.getSigningKey();
  if (!signingKey || !keyring.hasKeys()) return result;
  const pending = (await api.listKeyRotations()).filter(
    (r) => opts.projectId === undefined || r.project_id === opts.projectId,
  );
  for (const { project_id: projectId, request } of pending) {
    try {
      const pek = generatePek();
      const keyId = projectKeyId(pek);
      // Stored first: the server completes a rotation only with a key an owner holds.
      await api.putProjectKey(projectId, wrapProjectKey(pek, keyring.getDek(), projectId), keyId);
      keyring.addProjectKey(projectId, keyId, pek);
      const trust = readKeyTrust(store);
      for (const member of await api.listMembers(projectId)) {
        if (member.user_id === userId || opts.removed?.includes(member.user_id)) continue;
        const pinned = pinnedMemberKey(trust, projectId, member.user_id);
        if (!pinned) {
          result.unpinned++;
          continue;
        }
        // Sealed to the pinned key, not the listed one: only that member can open it.
        const { sealed, signature } = sealDelivery(pek, {
          projectId,
          recipientId: member.user_id,
          recipientPublicKey: pinned,
          keyId,
          signingKey,
        });
        try {
          await api.putMemberProjectKey(projectId, member.user_id, sealed, keyId, signature);
        } catch (err) {
          result.failed++;
          console.warn(`[atlas-e2ee] could not deliver the rotated key of ${projectId}:`, err);
        }
      }
      try {
        await api.completeKeyRotation(projectId, keyId, request);
      } catch (err) {
        if (apiErrorCode(err) === "rotation_not_pending") {
          result.superseded.push(projectId);
          continue;
        }
        throw err;
      }
      for (const { keyId: old } of keyring.projectKeys(projectId)) {
        if (old === keyId) continue;
        keyring.retireKey(projectId, old);
        recordRetiredKey(store, projectId, old);
      }
      keyring.setCanonical(projectId, keyId);
      if (trust.minted.has(projectId)) recordMintedKey(store, projectId, keyId);
      result.rotated.push(projectId);
    } catch (err) {
      result.failed++;
      console.warn(`[atlas-e2ee] could not rotate the key of ${projectId}:`, err);
    }
  }
  return result;
}
