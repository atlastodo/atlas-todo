-- M5 collaboration: shared-project membership with roles and pending invites.
--
-- Projects created by the web app live only in the generic sync store (entity_fields), not the
-- relational `projects` table, so `project_id` here is a bare UUID with NO foreign key — it refers
-- to a project entity in the sync log. A project with no rows in this table stays private to its
-- creator (unchanged single-user behaviour); membership only activates once the owner shares it.
CREATE TABLE project_members (
    project_id UUID NOT NULL,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter')),
    state      TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('pending', 'active')),
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- "Which projects can this user see?" (membership lookups, fan-out authorization).
CREATE INDEX project_members_user_idx ON project_members(user_id);
-- "Who are the members of this project?" (fan-out target set).
CREATE INDEX project_members_project_idx ON project_members(project_id);
