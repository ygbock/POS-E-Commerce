-- AbaCha Unified Commerce
-- Migration 063: Secure email verification token lifecycle.
--
-- Never stores verification tokens in plaintext. The application stores only
-- a SHA-256 digest and receives the raw token through the verification URL.

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_snapshot VARCHAR(320) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user_created
  ON email_verification_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_expiry
  ON email_verification_tokens(expires_at);

-- Only one active verification challenge may exist for an account at a time.
-- Issuing a new challenge must first consume/revoke the previous active one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_verification_active_user
  ON email_verification_tokens(user_id)
  WHERE used_at IS NULL;

COMMENT ON TABLE email_verification_tokens IS
  'One-time email verification challenges. Raw verification tokens are never persisted.';
