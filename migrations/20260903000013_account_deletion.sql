-- Account deletion with 30-day grace period

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_deletion_scheduled_idx
    ON users(deletion_scheduled_at)
    WHERE deletion_scheduled_at IS NOT NULL;
