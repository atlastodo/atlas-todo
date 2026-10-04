-- Folders / project grouping: a project may nest under a parent project of kind 'folder'.
-- A 'folder' groups child projects/folders (Todoist folders / Things areas); a 'project' holds
-- tasks. Tasks must not attach directly to a folder (enforced in the API layer).

ALTER TABLE projects
    ADD COLUMN parent_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('project', 'folder'));

CREATE INDEX projects_parent_idx ON projects(parent_id) WHERE deleted_at IS NULL;
