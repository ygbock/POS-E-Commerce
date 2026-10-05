-- TASK-MERCHANT-3: server-authoritative purchasing receipts and request idempotency.
-- Forward-only migration; do not modify previously applied migrations.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_org_idempotency
  ON purchase_orders(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  purchase_order_id VARCHAR(64) NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128),
  received_by VARCHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_purchase_receipts_org_number UNIQUE (organization_id, receipt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_receipts_org_idempotency
  ON purchase_receipts(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_org_po
  ON purchase_receipts(organization_id, purchase_order_id, received_at DESC);
