-- Zero-Knowledge E2EE extension to users and project keys

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS salt TEXT,
    ADD COLUMN IF NOT EXISTS public_key TEXT,
    ADD COLUMN IF NOT EXISTS encrypted_dek JSONB,
    ADD COLUMN IF NOT EXISTS encrypted_private_key JSONB,
    ADD COLUMN IF NOT EXISTS recovery_encrypted_dek JSONB,
    ADD COLUMN IF NOT EXISTS recovery_encrypted_private_key JSONB,
    ADD COLUMN IF NOT EXISTS is_e2ee BOOLEAN NOT NULL DEFAULT FALSE;

-- Fast salt lookups before login by email
CREATE INDEX IF NOT EXISTS users_email_salt_idx ON users(email);

-- Per-user project keys (owner copy and member copies)
CREATE TABLE IF NOT EXISTS project_keys (
    project_id   UUID NOT NULL,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_pek JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_keys_user_idx ON project_keys(user_id);
CREATE INDEX IF NOT EXISTS project_keys_project_idx ON project_keys(project_id);
