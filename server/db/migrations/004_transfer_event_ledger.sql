-- Omnicore Unified Commerce
-- Migration 004: Multi-Location Stock Transfer Event Ledger and Constraints
-- Supports immutable transfer event audit history, item constraints, and organization idempotency

-- 1. Transfer Events Table (Append-only workflow audit ledger)
CREATE TABLE IF NOT EXISTS inventory_transfer_events (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  transfer_id VARCHAR(64) NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  transfer_item_id VARCHAR(64) REFERENCES inventory_transfer_items(id) ON DELETE SET NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN (
    'CREATED',
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'DISPATCHED',
    'IN_TRANSIT',
    'RECEIVED',
    'VARIANCE_RECORDED',
    'COMPLETED',
    'CANCELLED'
  )),
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  quantity NUMERIC(14, 4) DEFAULT 0.0000,
  actor_id VARCHAR(255) NOT NULL,
  source_location_id VARCHAR(64) REFERENCES locations(id) ON DELETE RESTRICT,
  destination_location_id VARCHAR(64) REFERENCES locations(id) ON DELETE RESTRICT,
  reference_type VARCHAR(64) DEFAULT 'inventory_transfer',
  reference_id VARCHAR(128),
  idempotency_key VARCHAR(128),
  reason VARCHAR(255),
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes for Transfer Events
CREATE INDEX IF NOT EXISTS idx_transfer_events_org ON inventory_transfer_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_transfer_events_transfer ON inventory_transfer_events(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_events_item ON inventory_transfer_events(transfer_item_id);
CREATE INDEX IF NOT EXISTS idx_transfer_events_type ON inventory_transfer_events(event_type);
CREATE INDEX IF NOT EXISTS idx_transfer_events_created ON inventory_transfer_events(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_events_org_idempotency
  ON inventory_transfer_events(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Enhance Transfers table with idempotency_key
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_org_idempotency
  ON inventory_transfers(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_org_status ON inventory_transfers(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_transfers_org_source ON inventory_transfers(organization_id, source_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_org_dest ON inventory_transfers(organization_id, destination_location_id);

-- 4. Constraint for Transfer Items: Unique variant per transfer
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_items_transfer_variant
  ON inventory_transfer_items(transfer_id, variant_id);
