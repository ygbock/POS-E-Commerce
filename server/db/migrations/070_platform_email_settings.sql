CREATE TABLE IF NOT EXISTS platform_email_settings (
  id TEXT PRIMARY KEY CHECK (id = 'resend'),
  api_key_ciphertext TEXT,
  api_key_iv TEXT,
  api_key_auth_tag TEXT,
  from_email TEXT NOT NULL,
  updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (api_key_ciphertext IS NULL AND api_key_iv IS NULL AND api_key_auth_tag IS NULL)
    OR
    (api_key_ciphertext IS NOT NULL AND api_key_iv IS NOT NULL AND api_key_auth_tag IS NOT NULL)
  )
);
