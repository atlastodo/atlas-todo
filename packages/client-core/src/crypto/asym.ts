import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { encryptAesGcm, decryptAesGcm, type EncryptedPayload } from "./aes";
import { bytesToHex, hexToBytes, utf8ToBytes } from "./utils";

export interface UserKeypair {
  publicKey: string;
  secretKey: Uint8Array;
}

export interface SealedKey {
  ephemeralPublicKey: string;
  encryptedKey: EncryptedPayload;
}

export function generateUserKeypair(): UserKeypair {
  const { secretKey, publicKey } = x25519.keygen();
  return {
    publicKey: bytesToHex(publicKey),
    secretKey,
  };
}

export function getPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(x25519.getPublicKey(secretKey));
}

/**
 * Seals a symmetric key (e.g. a PEK) to a recipient's public key via ephemeral X25519 ECDH and
 * AES-256-GCM.
 */
export function sealKey(targetKey: Uint8Array, recipientPublicKeyHex: string): SealedKey {
  const ephemeral = x25519.keygen();
  const recipientPub = hexToBytes(recipientPublicKeyHex);
  const sharedSecret = x25519.getSharedSecret(ephemeral.secretKey, recipientPub);

  const aesKey = hkdf(sha256, sharedSecret, undefined, utf8ToBytes("atlas-seal-v1"), 32);
  const encryptedKey = encryptAesGcm(aesKey, targetKey);

  return {
    ephemeralPublicKey: bytesToHex(ephemeral.publicKey),
    encryptedKey,
  };
}

export function unsealKey(sealed: SealedKey, recipientSecretKey: Uint8Array): Uint8Array {
  const ephemeralPub = hexToBytes(sealed.ephemeralPublicKey);
  const sharedSecret = x25519.getSharedSecret(recipientSecretKey, ephemeralPub);

  const aesKey = hkdf(sha256, sharedSecret, undefined, utf8ToBytes("atlas-seal-v1"), 32);
  return decryptAesGcm(aesKey, sealed.encryptedKey);
}
