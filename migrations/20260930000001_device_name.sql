-- Refresh-token families carry an optional human-readable device name (e.g. hostname, browser+OS,
-- or user-assigned nickname), surfaced in Settings -> Devices & sessions.
ALTER TABLE refresh_tokens ADD COLUMN device_name TEXT;
