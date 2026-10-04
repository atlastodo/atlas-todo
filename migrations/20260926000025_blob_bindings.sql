-- Blob lifecycle bookkeeping for attachments.
--
-- `project_id` binds a blob to the project its attachment lives in, as its uploader (or a member
-- of that project) last pushed it. Only the uploader and the project's active members can hold a
-- reference that grants a download or keeps the blob from the GC, so an attachment op naming
-- someone else's sha grants nothing. NULL means private to the uploader. Like
-- `project_members.project_id` it is a bare UUID: projects live in the sync store, not a table.
--
-- `unreferenced_since` is when the GC first found no such reference. The grace window runs from
-- here rather than from `created_at`, so an attachment deleted long after its upload can still
-- be restored before its blob goes.
ALTER TABLE blobs ADD COLUMN project_id UUID;
ALTER TABLE blobs ADD COLUMN unreferenced_since TIMESTAMPTZ;

CREATE INDEX blobs_unreferenced_idx ON blobs (unreferenced_since)
    WHERE unreferenced_since IS NOT NULL;

-- Every download and every GC check looks references up by the blob address stored in the field
-- value. The primary key does not lead with the value, so without this each check scanned all
-- attachment fields.
CREATE INDEX entity_fields_attachment_sha_idx ON entity_fields ((value #>> '{}'))
    WHERE entity = 'attachment' AND field IN ('blob_sha', 'thumb_sha');
