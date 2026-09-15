-- AbaCha Unified Commerce
-- Migration 016: Durable tenant lifecycle state + platform idempotency
-- TASK-5.6.4 review hardening

-- is_active cannot distinguish a suspended tenant from an archived tenant.
-- lifecycle_status is the server-authoritative lifecycle state.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(32);

UPDATE organizations
SET lifecycle_status = CASE
  WHEN is_active THEN 'active'
  ELSE 'suspended'
END
WHERE lifecycle_status IS NULL;

ALTER TABLE organizations
  ALTER COLUMN lifecycle_status SET DEFAULT 'active';

ALTER TABLE organizations
  ALTER COLUMN lifecycle_status SET NOT NULL;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_lifecycle_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_lifecycle_status_check
  CHECK (lifecycle_status IN ('active', 'suspended', 'archived'));

CREATE INDEX IF NOT EXISTS idx_organizations_lifecycle_status
  ON organizations(lifecycle_status, created_at DESC);

-- Platform lifecycle/provisioning idempotency ledger.
-- A unique (operation, key) pair prevents duplicate privileged mutations.
CREATE TABLE IF NOT EXISTS platform_idempotency_keys (
  id VARCHAR(64) PRIMARY KEY,
  operation VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id VARCHAR(64),
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_platform_idempotency_operation_key
    UNIQUE (operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_idempotency_org_created
  ON platform_idempotency_keys(organization_id, created_at DESC);
