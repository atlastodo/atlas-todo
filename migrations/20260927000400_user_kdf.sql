-- Which password KDF the account's credential and password-wrapped keys derive from, and its
-- parameters. The client asks for them (with the salt) before it derives anything, so they are
-- per account: an account moves to a newer KDF when its owner next signs in, not all at once.
--
-- 1: PBKDF2-HMAC-SHA256 over the UTF-8 password as typed, `{"iterations": 600000}`. Every account
--    created before this column is version 1, which is what the defaults give existing rows.
-- 2: Argon2id (RFC 9106, v1.3) over the NFC-normalized UTF-8 password,
--    `{"iterations": t, "memory_kib": m, "parallelism": p}`.
--
-- Either way the output is the same 32-byte master key, which HKDF expands into the auth hash and
-- the key that wraps the DEK and private key. The server only stores and hands out these values.
ALTER TABLE users
    ADD COLUMN kdf_version SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN kdf_params JSONB NOT NULL DEFAULT '{"iterations": 600000}'::jsonb;
