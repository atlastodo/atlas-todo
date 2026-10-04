-- Crash and bug reports filed by the app, plus the admin flag that gates reading them.
--
-- The app had no error handling above the individual call site: an uncaught render throw was a blank
-- screen with nothing recorded anywhere. Reports carry diagnostics only -- the client builds an
-- allowlisted payload and redacts free text, so no task titles or notes reach this table.
--
-- `user_id` is nullable on purpose: a crash during startup, hydrate or on the login screen has no
-- session, and those are exactly the crashes that are otherwise impossible to debug. `id` is
-- client-generated (UUIDv7) so the app's offline retry queue is idempotent -- the insert is
-- ON CONFLICT DO NOTHING, and a flaky network cannot turn one crash into five rows.
--
-- `is_admin` lives on `users` rather than in an env allowlist so authorization has a single source of
-- truth in the database; the ADMIN_EMAILS env var only *applies* the desired state at startup.

ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE bug_reports (
    id          UUID PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('crash', 'manual')),
    message     TEXT NOT NULL,
    stack       TEXT,
    description TEXT,
    app_version TEXT NOT NULL,
    platform    TEXT NOT NULL,
    os_version  TEXT,
    route       TEXT,
    device_id   TEXT,
    diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
    breadcrumbs JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- When the crash happened, as against when the server heard about it. The client queues reports
    -- while offline or signed out, so the two can be days apart and only the first one is the bug.
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- The admin list is newest-first, and its default filter is "unresolved only"; a partial index
-- serves that view without scanning resolved history.
CREATE INDEX bug_reports_created_idx ON bug_reports (created_at DESC);
CREATE INDEX bug_reports_open_idx    ON bug_reports (created_at DESC) WHERE resolved_at IS NULL;
