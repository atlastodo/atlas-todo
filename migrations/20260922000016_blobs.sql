-- Attachments blob registry (phase 1 of the attachments plan).
--
-- `blobs` tracks the ciphertext objects stored by `PUT /attachments/blobs/:sha256`: one row per
-- content-addressed blob, written at PUT time (the FS mirror under BLOB_DIR is keyed by the same
-- sha). Attachment *metadata* syncs through the op log as `EntityKind::Attachment`; this table is
-- purely the server-side lifecycle record: size + uploader (quota accounting) and created_at (the
-- GC grace clock). Rows are deleted by the blob-GC task together with their files when no live
-- attachment op references the sha in ANY partition (tombstone-aware; see `attachments.rs`).
--
-- Additive and self-contained: the historical `tasks`/`projects`/`sections`/`labels` tables are
-- write-orphaned and are never touched here.
CREATE TABLE blobs (
    sha256  TEXT PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size    BIGINT NOT NULL CHECK (size >= 0),
    uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-uploader quota accounting scans by uploader on every PUT.
CREATE INDEX blobs_uploader_idx ON blobs (uploader_id);

-- GC candidates are aged rows in `created_at` order (bounded batches, like the retention purge).
CREATE INDEX blobs_gc_idx ON blobs (created_at);
