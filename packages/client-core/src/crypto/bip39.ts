import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "./utils";
import type { UserKeypair } from "./asym";

export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 256);
}

export function validateRecoveryPhrase(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  return validateMnemonic(normalized, wordlist);
}

function recoverySeed(phrase: string): Uint8Array {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateRecoveryPhrase(normalized)) {
    throw new Error("Invalid BIP-39 recovery phrase");
  }
  return mnemonicToSeedSync(normalized);
}

/**
 * Derives a 32-byte recovery encryption key from the recovery mnemonic phrase and the user's salt
 * using standard BIP-39 seed generation and HKDF expansion. It wraps the recovery copies of the
 * DEK and the private key.
 */
export function deriveRecoveryKey(phrase: string, saltHex: string): Uint8Array {
  return deriveRecoveryKeys(phrase, saltHex).wrapKey;
}

/**
 * The X25519 keypair the server seals version-2 recovery challenges to:
 * `HKDF-SHA256(ikm = BIP-39 seed, salt = account salt bytes, info = "atlas-recovery-auth-v1")` is
 * the secret. Only the phrase yields it, unlike the account keypair, which every signed-in device
 * holds, so a recovery challenge answers to the phrase alone.
 */
export function deriveRecoveryAuthKeypair(phrase: string, saltHex: string): UserKeypair {
  return deriveRecoveryKeys(phrase, saltHex).auth;
}

export function deriveRecoveryKeys(
  phrase: string,
  saltHex: string,
): { wrapKey: Uint8Array; auth: UserKeypair } {
  const seed = recoverySeed(phrase);
  const salt = hexToBytes(saltHex);
  const wrapKey = hkdf(sha256, seed, salt, utf8ToBytes("atlas-recovery-v1"), 32);
  const secretKey = hkdf(sha256, seed, salt, utf8ToBytes("atlas-recovery-auth-v1"), 32);
  return { wrapKey, auth: { secretKey, publicKey: bytesToHex(x25519.getPublicKey(secretKey)) } };
}
