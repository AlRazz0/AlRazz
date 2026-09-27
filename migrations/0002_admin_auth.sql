-- Tokens are opaque in cookies; only hashes are persisted. Credential changes
-- invalidate sessions/challenges without resetting one-use factor history.
CREATE TABLE IF NOT EXISTS admin_auth_challenges (
  token_hash TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_by TEXT,
  email_send_id TEXT,
  email_code_hash TEXT,
  email_code_expires_at INTEGER,
  email_resend_after INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS admin_auth_challenges_expiry ON admin_auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS admin_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_auth_sessions_expiry ON admin_auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_auth_factors (
  factor_key TEXT PRIMARY KEY,
  claim_hash TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS admin_auth_factors_expiry ON admin_auth_factors(expires_at);
