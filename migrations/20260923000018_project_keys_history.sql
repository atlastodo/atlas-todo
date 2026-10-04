-- Project keys become an append-only history per (project, user, key).
--
-- kind: 'wrapped' = the user's own copy, encrypted under their DEK (AES-GCM, 16-char base64 iv);
--       'sealed'  = an owner's delivery to that user, sealed to their X25519 public key (the iv slot
--                   carries the 64-hex ephemeral public key).
-- key_id: lowercase hex of the first 16 bytes of SHA-256("atlas-pek-id-v1" || PEK), computed by the
--         client and not secret. '' marks a row stored before keys were fingerprinted.
--
-- Keying rows by key_id means a user whose key forked keeps every PEK they ever held, so content
-- encrypted under any of them stays decryptable.

ALTER TABLE project_keys
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'wrapped' CHECK (kind IN ('wrapped', 'sealed')),
    ADD COLUMN key_id TEXT NOT NULL DEFAULT '';

-- Owner deliveries were stored as {iv: <ephemeral public key hex>, ct: <JSON of the AES payload>}.
UPDATE project_keys SET kind = 'sealed' WHERE length(encrypted_pek->>'iv') = 64;

ALTER TABLE project_keys DROP CONSTRAINT project_keys_pkey;
ALTER TABLE project_keys ADD PRIMARY KEY (project_id, user_id, key_id);
