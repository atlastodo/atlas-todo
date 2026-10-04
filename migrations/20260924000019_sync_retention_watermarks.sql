-- Retention measures a tombstone's age by when the server received the delete, never by the
-- client-supplied HLC: an ancient-HLC delete must not become purgeable the moment it lands. Rows
-- that predate this column count from the migration, which only delays their purge by one window.
ALTER TABLE entity_tombstones ADD COLUMN received_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX entity_tombstones_received_at_idx ON entity_tombstones(received_at);

-- Per-user high-water mark of purged operations (the largest purged server_seq). A pull cursor
-- below it may have skipped purged ops, so the server answers such a cursor with 410 and the
-- client re-bootstraps from the snapshot.
CREATE TABLE sync_purge_watermarks (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    purged_seq BIGINT NOT NULL
);
