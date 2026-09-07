-- Omnicore Unified Commerce
-- Migration 006: Inventory Integrity Hardening (INV-001R3)
-- 1. Unique organization-scoped partial index on inventory_movements(organization_id, idempotency_key)
-- 2. Organization-scoped idempotency for inventory_reservations
-- 3. Database-level trigger immutability for inventory_transfer_events

-- 1. Replace non-unique idempotency index on inventory_movements with UNIQUE partial index
DROP INDEX IF EXISTS idx_inventory_movements_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_org_idempotency
  ON inventory_movements(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Add idempotency_key and unique partial index to inventory_reservations
ALTER TABLE inventory_reservations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservations_org_idempotency
  ON inventory_reservations(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Database-level trigger enforcing immutable append-only ledger for inventory_transfer_events
CREATE OR REPLACE FUNCTION prevent_transfer_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: inventory_transfer_events is an append-only audit ledger and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_transfer_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: inventory_transfer_events is an append-only audit ledger and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_transfer_events ON inventory_transfer_events;

CREATE TRIGGER trg_immutable_transfer_events
BEFORE UPDATE OR DELETE ON inventory_transfer_events
FOR EACH ROW
EXECUTE FUNCTION prevent_transfer_event_modification();
