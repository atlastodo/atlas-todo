-- Tasks a move took out of a shared project, for each member of that project who cannot see where
-- the task went. The member's copy is hidden by a tombstone, but a tombstone yields to any later
-- write and retention purges it, so an edit the member made while away would bring the task back.
-- While a row exists and the task is not in a shared project the member is active in, the server
-- refuses the member's writes to it. The row is dropped once the task is back within reach.
CREATE TABLE revoked_tasks (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id    UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, task_id)
);
