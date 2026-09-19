-- AbaCha Unified Commerce
-- Migration 027: Discovery identity and analytics hardening.
-- Forward-only. Never modify previously applied migrations.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS auth_user_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_auth_user_org
  ON customers(organization_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_auth_user
  ON customers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE discovery_analytics_events
  ADD CONSTRAINT ck_discovery_analytics_metadata_size
  CHECK (pg_column_size(metadata) <= 8192);
