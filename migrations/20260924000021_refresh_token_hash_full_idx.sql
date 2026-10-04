-- Index every refresh token by hash, not only the live ones. The reuse check in /auth/refresh and
-- the family revocation in /auth/logout look up tokens that are already revoked; with the partial
-- index (WHERE revoked_at IS NULL) those lookups were sequential scans of a table that gains a row
-- per login and per refresh.
DROP INDEX IF EXISTS refresh_tokens_token_hash_idx;
CREATE INDEX refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);
