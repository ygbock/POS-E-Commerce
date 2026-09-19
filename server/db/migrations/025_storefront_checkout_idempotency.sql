-- AbaCha Unified Commerce
-- Migration 025: Storefront checkout transaction idempotency
--
-- Claims a checkout request before any order/inventory mutation. The claim and
-- the resulting inventory reservation/order are committed atomically.

CREATE TABLE IF NOT EXISTS checkout_idempotency (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'COMPLETED')),
  checkout_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_checkout_idempotency_org_key UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_checkout_idempotency_order
  ON checkout_idempotency (organization_id, checkout_id)
  WHERE checkout_id IS NOT NULL;
