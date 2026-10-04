-- An owner's key delivery (a `sealed` row) carries the owner's Ed25519 signature over the project
-- id, the recipient, the key id and the sealed bytes, and names who signed it. The recipient checks
-- the signature against the signing key it pinned for that owner; the server only stores it.
--
-- `signed_by` is set by the server to the delivering owner, never taken from the request. Rows
-- stored before signing existed keep both NULL: a client loads such a delivery only when it already
-- holds the key, and owners re-deliver them signed. A `wrapped` row (the user's own copy) needs no
-- signature, so storing one clears both.
ALTER TABLE project_keys
    ADD COLUMN signature TEXT,
    ADD COLUMN signed_by UUID REFERENCES users(id) ON DELETE SET NULL;
