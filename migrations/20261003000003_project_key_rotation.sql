-- Rotating a shared project's key when someone who held it leaves.
--
-- Removing a member, a member leaving, declining an invite that had a key, or the account of a
-- member being purged bumps `rotation_requested`. The next active owner whose client connects mints
-- a new key, delivers it (signed) to the remaining members, and completes the rotation, which
-- sets `rotation_done` to the request it served and makes the new key canonical. A rotation is
-- pending while `rotation_requested > rotation_done`, so a removal that lands while one is under
-- way asks for another.
--
-- `canonical_key_id`, once set, names the project's canonical key instead of the derivation from
-- the earliest owner's copies (`projects::CANONICAL_KEYS`). Like the other key tables, `project_id`
-- is a bare UUID.
CREATE TABLE project_key_state (
    project_id         UUID PRIMARY KEY,
    canonical_key_id   TEXT,
    rotated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    rotated_at         TIMESTAMPTZ,
    rotation_requested BIGINT NOT NULL DEFAULT 0,
    rotation_done      BIGINT NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keys a rotation superseded. They still decrypt what was written under them, but clients no
-- longer encrypt new content with them.
CREATE TABLE project_retired_keys (
    project_id UUID NOT NULL,
    key_id     TEXT NOT NULL,
    retired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, key_id)
);
