-- Initial schema: users, per-device refresh tokens, and the sync operation log.
-- Entity projection tables (projects, tasks, …) are added in milestone M1.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Users authenticate with email + Argon2 password hash (see atlas-server auth module).
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per signed-in device; enables long-lived offline clients and per-device revocation.
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id   UUID NOT NULL,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

-- Append-only sync log. Each row is one field Set or Delete, ordered by its HLC components.
-- Clients push their local ops here and pull others' ops since a server cursor (server_seq).
CREATE TABLE operations (
    server_seq   BIGSERIAL PRIMARY KEY,
    op_id        UUID NOT NULL UNIQUE,          -- client-generated; idempotency key
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity       TEXT NOT NULL,                 -- EntityKind (task, project, …)
    entity_id    UUID NOT NULL,
    field        TEXT,                          -- NULL for deletes
    value        JSONB,                         -- NULL for deletes
    is_delete    BOOLEAN NOT NULL DEFAULT FALSE,
    hlc_wall_ms  BIGINT NOT NULL,
    hlc_counter  INTEGER NOT NULL,
    hlc_node     UUID NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX operations_user_seq_idx ON operations(user_id, server_seq);
CREATE INDEX operations_entity_idx ON operations(entity, entity_id);

-- Requires the citext extension for case-insensitive emails.
