-- Auth token lookups on the hot path -- /auth/refresh (rotate) and /auth/logout (revoke) -- filter
-- refresh_tokens by token_hash, but the table was only indexed on user_id, so each was a sequential
-- scan. The table is tiny today (this is NOT the cause of the occasional multi-second write stalls,
-- which are homelab WAL-fsync spikes), but it is append-only -- a row per login/refresh, and revoked
-- rows are never deleted -- so index token_hash defensively. Partial on the active (unrevoked) rows,
-- which is exactly what both queries match (`revoked_at IS NULL`), keeping the index small as tokens
-- are revoked. Mirrors the partial-index convention used across the tasks/projects tables.
CREATE INDEX refresh_tokens_token_hash_idx
    ON refresh_tokens (token_hash)
    WHERE revoked_at IS NULL;
