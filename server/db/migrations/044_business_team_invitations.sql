-- AbaCha Unified Commerce
-- Migration 044: business team invitations and scoped membership administration

CREATE TABLE IF NOT EXISTS discovery_business_invitations (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  invited_email VARCHAR(320) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('MANAGER','STAFF')),
  invited_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_business_invitations_business
  ON discovery_business_invitations(business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_business_invitations_email
  ON discovery_business_invitations(lower(invited_email), status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_business_pending_invitation
  ON discovery_business_invitations(business_id, lower(invited_email))
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_discovery_business_memberships_role
  ON discovery_business_memberships(business_id, role, is_active);

COMMENT ON TABLE discovery_business_invitations IS
  'Pending business-team invitations scoped to a Discovery business.';
