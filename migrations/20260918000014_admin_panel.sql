-- The admin panel beyond crash reports: user management, runtime instance settings, signup
-- invites, and the audit trail of admin actions.
--
-- `disabled_at` is a soft ban: a disabled account cannot sign in, refresh, or call the API with a
-- still-valid access token (the `AuthUser` extractor re-checks the column), and disabling revokes
-- every refresh token so the effect is immediate. It is reversible by design -- distinct from the
-- existing self-service `deletion_scheduled_at`, which an admin can also trigger on a user's behalf.
--
-- `last_login_at` feeds the admin user list; it is stamped at signup and on every login.
--
-- `instance_settings` holds runtime overrides for flags that would otherwise require an env edit +
-- restart (`SIGNUP_ENABLED` first). A missing row means "use the env default", so existing deploys
-- change nothing, and dropping a row reverts to the env-configured behaviour.
--
-- `invites` are single-use signup codes: on a closed instance a valid, unexpired, unrevoked code
-- still lets one person create an account (the OpenReplay/Langfuse model -- self-hosters should not
-- have to briefly open registration to the whole internet to add one colleague).
--
-- `admin_actions` is the minimal audit trail: who did what to whom, when. Append-only; read back in
-- the panel. Actors/targets are `ON DELETE SET NULL` so deleting a user preserves the history.

ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

CREATE TABLE instance_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE invites (
    id         UUID PRIMARY KEY,
    -- 256 bits of entropy, hex-encoded (the refresh-token generator); uniqueness is the lookup.
    code       TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    used_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ
);

-- The admin invite list is newest-first.
CREATE INDEX invites_created_idx ON invites (created_at DESC);

CREATE TABLE admin_actions (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action         TEXT NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The audit list is newest-first, keyset-paginated on the monotonic identity id.
CREATE INDEX admin_actions_created_idx ON admin_actions (created_at DESC);
