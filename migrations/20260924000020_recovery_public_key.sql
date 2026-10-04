-- The public half of a recovery-only X25519 keypair the client derives from the 24-word recovery
-- phrase (HKDF over the BIP-39 seed and the account salt, info "atlas-recovery-auth-v1"). Account
-- recovery seals its challenge to this key, so answering it needs the phrase itself.
--
-- The alternative, the account's device keypair (`public_key`), is held by every signed-in device:
-- anyone who once got hold of a device could reset the password forever. NULL marks an account
-- created before this column; recovery falls back to `public_key` for it until the user re-enters
-- the phrase and the client registers the key (`PUT /auth/recovery-key`).
ALTER TABLE users ADD COLUMN recovery_public_key TEXT;
