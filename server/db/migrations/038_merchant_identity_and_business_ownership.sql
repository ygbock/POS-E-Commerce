-- AbaCha Unified Commerce
-- Migration 038: Merchant identity and business ownership
--
-- Business-owner accounts are platform identities. A discovery-only business can
-- remain tenantless while its owner still has a private merchant workspace.

CREATE TABLE IF NOT EXISTS discovery_business_memberships (
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'OWNER'
    CHECK (role IN ('OWNER','MANAGER','STAFF')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_business_memberships_user
  ON discovery_business_memberships(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_discovery_business_memberships_business
  ON discovery_business_memberships(business_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_business_owner
  ON discovery_business_memberships(business_id)
  WHERE role = 'OWNER' AND is_active = TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_verified
  ON users(email, is_active);

COMMENT ON TABLE discovery_business_memberships IS
  'Business-level ownership and membership independent of tenant organization membership.';
