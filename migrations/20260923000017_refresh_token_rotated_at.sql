-- When /auth/refresh consumed the token to issue its successor. Left NULL by every other
-- revocation (logout, session revoke, password change, admin action), so a revoked token presented
-- again can be told apart: one rotated seconds ago is another tab of the same session losing the
-- rotation race, not a stolen token, and must not revoke the device's whole family.
ALTER TABLE refresh_tokens ADD COLUMN rotated_at TIMESTAMPTZ;
