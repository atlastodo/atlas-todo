-- The retention purge (OP_RETENTION_DAYS, see crates/atlas-server/src/retention.rs) deletes
-- expired operations by age; without this index every pass would scan the whole append-only log.
-- Plain CREATE INDEX (not CONCURRENTLY) matches the other migrations here; on an existing database
-- it only takes a write lock for the duration of the index build.
CREATE INDEX operations_created_at_idx ON operations(created_at);
