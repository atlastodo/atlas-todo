-- Each account's Ed25519 identity signing key. The public half is published next to the X25519
-- `public_key`: other members pin it on first use and check an owner's key deliveries against it.
-- The private half is stored wrapped under the account's DEK (not the password-derived key), so a
-- password change, a recovery or a KDF upgrade leaves it untouched.
--
-- Set once: `PUT /auth/signing-key` refuses to replace a key already stored, so the server cannot
-- be asked to swap it later. NULL marks an account created before these keys; its client
-- generates and uploads one the next time it holds the account's keys.
ALTER TABLE users
    ADD COLUMN signing_public_key TEXT,
    ADD COLUMN encrypted_signing_key JSONB;
