-- AbaCha Unified Commerce
-- Migration 062: Secure authentication sessions.
-- Adds durable server-side sessions and rotating refresh-token families while
-- retaining legacy JWT revocation during the controlled authentication migration.

CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR(128) NOT NULL,
  identity_type VARCHAR(32) NOT NULL CHECK (identity_type IN ('platform','business_owner','staff','customer')),
  role VARCHAR(64) NOT NULL,
  refresh_token_hash VARCHAR(128) NOT NULL,
  refresh_token_family_id VARCHAR(128) NOT NULL,
  access_jti VARCHAR(128) NOT NULL UNIQUE,
  device_id VARCHAR(128),
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(255),
  replaced_by_session_id VARCHAR(128)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_refresh_hash
  ON auth_sessions(refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions(user_id, revoked_at, refresh_expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_family
  ON auth_sessions(refresh_token_family_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_org
  ON auth_sessions(organization_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_access_jti
  ON auth_sessions(access_jti);

COMMENT ON TABLE auth_sessions IS
  'Server-authoritative authentication sessions. Refresh tokens are stored only as SHA-256 hashes; plaintext refresh tokens never persist.';
