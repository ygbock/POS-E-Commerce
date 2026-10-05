-- AbaCha Unified Commerce
-- Migration 061: Authentication identity boundaries.
-- Separates platform operators, business owners, tenant staff, and customers
-- from the legacy single-role interpretation.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_type VARCHAR(32);

UPDATE users
SET identity_type = CASE
  WHEN role IN ('system_owner','platform_admin','platform_support','platform_finance') THEN 'platform'
  WHEN role = 'business_owner' THEN 'business_owner'
  WHEN role = 'viewer' AND email LIKE '%@customer.abacha.internal' THEN 'customer'
  ELSE 'staff'
END
WHERE identity_type IS NULL;

ALTER TABLE users
  ALTER COLUMN identity_type SET DEFAULT 'staff';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_identity_type_check;

ALTER TABLE users
  ADD CONSTRAINT users_identity_type_check
  CHECK (identity_type IN ('platform','business_owner','staff','customer'));

CREATE INDEX IF NOT EXISTS idx_users_identity_type_active
  ON users(identity_type, is_active);

CREATE INDEX IF NOT EXISTS idx_users_identity_type_email
  ON users(identity_type, email);

COMMENT ON COLUMN users.identity_type IS
  'Authentication realm: platform control-plane operator, business owner, tenant staff, or customer. Server authoritative.';
