-- Server-side materialized state derived from the operation log by field-level last-writer-wins.
-- The `operations` table (migration 0001) is the durable, append-only log that clients push/pull.
-- These two tables hold the *current* LWW-resolved value per field and per-entity delete
-- tombstones, so the server can answer "what is the state now" and enforce convergence.
--
-- HLC ordering is the lexicographic tuple (wall_ms, counter, node); Postgres row comparison
-- `(a,b,c) > (d,e,f)` implements exactly that, which is how the upserts below keep the winner.

CREATE TABLE entity_fields (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity      TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    field       TEXT NOT NULL,
    value       JSONB,
    hlc_wall_ms BIGINT NOT NULL,
    hlc_counter INTEGER NOT NULL,
    hlc_node    UUID NOT NULL,
    PRIMARY KEY (user_id, entity, entity_id, field)
);

CREATE TABLE entity_tombstones (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity      TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    hlc_wall_ms BIGINT NOT NULL,
    hlc_counter INTEGER NOT NULL,
    hlc_node    UUID NOT NULL,
    PRIMARY KEY (user_id, entity, entity_id)
);
