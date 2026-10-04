-- M5 fan-out: a shared-project op is replicated into every member's partition, so the same op_id
-- now legitimately appears once per member. Idempotency therefore keys on (user_id, op_id), not a
-- global op_id. Drop the global unique and replace it with the per-user one.
ALTER TABLE operations DROP CONSTRAINT operations_op_id_key;
ALTER TABLE operations ADD CONSTRAINT operations_user_op_key UNIQUE (user_id, op_id);
