-- Omnicore Unified Commerce
-- Migration 005: Transfer Event Immutability Trigger
-- Enforces append-only ledger integrity for inventory_transfer_events at the database engine level

CREATE OR REPLACE FUNCTION prevent_transfer_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: inventory_transfer_events is an append-only ledger and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_transfer_events ON inventory_transfer_events;

CREATE TRIGGER trg_immutable_transfer_events
BEFORE UPDATE OR DELETE ON inventory_transfer_events
FOR EACH ROW
EXECUTE FUNCTION prevent_transfer_event_mutation();
