-- M5 task assignees: a task may be assigned to a project member. Nullable + ON DELETE SET NULL so
-- removing a user unassigns their tasks. Mirrors the `recurrence` column addition (M4).
ALTER TABLE tasks ADD COLUMN assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX tasks_assignee_idx ON tasks(assignee_id) WHERE deleted_at IS NULL AND is_completed = FALSE;
