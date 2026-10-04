-- Drop the relational entity tables from before the sync op log. Clients have read and written
-- entities only through the op log (`operations`, `entity_fields`, `entity_tombstones`) since the
-- REST entity CRUD was removed, so nothing reads or writes these tables any more.
--
-- Dependency order: the join table first, then each table before the ones it references. No
-- CASCADE, so a dependency added outside these migrations fails the migration instead of being
-- dropped with it. `project_members`, `project_keys` and `blobs` hold project ids as bare UUIDs
-- with no foreign key into `projects`, so they are unaffected.
DROP TABLE IF EXISTS task_labels;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS labels;
DROP TABLE IF EXISTS sections;
DROP TABLE IF EXISTS projects;
