-- Migration 073: Protect append-only audit ledger from TRUNCATE.
-- Row-level UPDATE/DELETE triggers do not fire for TRUNCATE, which is a statement-level operation.
-- Reuse the existing immutable-record exception function to reject bulk truncation too.
DROP TRIGGER IF EXISTS trg_immutable_audit_events_truncate ON audit_events;

CREATE TRIGGER trg_immutable_audit_events_truncate
BEFORE TRUNCATE ON audit_events
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_audit_events_mutation();
