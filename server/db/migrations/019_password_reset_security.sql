-- AbaCha Unified Commerce
-- Migration 019: Password reset security foundation
--
-- Never stores reset tokens in plaintext. The application stores a SHA-256
-- digest and receives the raw token only through the reset URL.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
  ON password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expiry
  ON password_reset_tokens(expires_at);

-- A token is usable only once. This partial index also prevents accidental
-- duplicate active reset records for the same user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_active_user
  ON password_reset_tokens(user_id)
  WHERE used_at IS NULL;

-- Remove expired/used records opportunistically from application jobs.
-- No destructive trigger is required; reset history is retained until cleanup.
