-- Additive only: existing passwords, MFA factors, sessions and catalogue remain.
CREATE TABLE admin_passkey_identity (
  owner_id TEXT PRIMARY KEY,
  user_handle TEXT NOT NULL UNIQUE
);
CREATE TABLE admin_passkeys (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  label TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  last_claim TEXT
);
CREATE INDEX admin_passkeys_owner ON admin_passkeys(owner_id,rp_id,origin,revoked_at);
ALTER TABLE admin_auth_sessions ADD COLUMN passkey_id TEXT;
CREATE TABLE admin_passkey_ceremonies (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  challenge TEXT NOT NULL,
  binding_hash TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  user_handle TEXT NOT NULL,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  allowed_credentials TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER NOT NULL,
  consumed_by TEXT
);
CREATE INDEX admin_passkey_ceremonies_expiry ON admin_passkey_ceremonies(expires_at);
