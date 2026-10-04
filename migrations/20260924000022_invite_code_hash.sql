-- Store signup invite codes hashed. A code is a door into a closed instance for as long as it is
-- valid; keeping it in plaintext put every open invite in each database dump and in the admin
-- list. The server now looks invites up by hex SHA-256 of the code (the refresh-token hash) and
-- shows the code only in the response that creates it.
ALTER TABLE invites ADD COLUMN code_hash TEXT;
UPDATE invites SET code_hash = encode(sha256(convert_to(code, 'UTF8')), 'hex');
ALTER TABLE invites ALTER COLUMN code_hash SET NOT NULL;
ALTER TABLE invites ADD CONSTRAINT invites_code_hash_key UNIQUE (code_hash);
ALTER TABLE invites DROP COLUMN code;
