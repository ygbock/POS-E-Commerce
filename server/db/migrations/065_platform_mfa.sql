-- Phase 3D: platform MFA foundation
-- TOTP secrets are encrypted at rest; recovery codes are stored only as hashes.
CREATE TABLE IF NOT EXISTS platform_mfa_credentials (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  secret_iv VARCHAR(64) NOT NULL,
  secret_auth_tag VARCHAR(64) NOT NULL,
  algorithm VARCHAR(16) NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6 CHECK (digits IN (6,8)),
  period_seconds INTEGER NOT NULL DEFAULT 30 CHECK (period_seconds BETWEEN 15 AND 120),
  enabled_at TIMESTAMPTZ,
  last_used_counter BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_mfa_recovery_codes (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  code_salt VARCHAR(64) NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_mfa_recovery_code_hash
  ON platform_mfa_recovery_codes(code_hash);

CREATE INDEX IF NOT EXISTS idx_platform_mfa_recovery_user
  ON platform_mfa_recovery_codes(user_id, used_at);

CREATE TABLE IF NOT EXISTS platform_mfa_challenges (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_mfa_challenge_user
  ON platform_mfa_challenges(user_id, expires_at DESC);
