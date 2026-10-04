-- M6 focus/time-tracking: an optional per-task time estimate in minutes, shown against tracked
-- focus time. Nullable (most tasks have no estimate). Mirrors the recurrence/assignee column adds.
ALTER TABLE tasks ADD COLUMN estimate_min INTEGER;
