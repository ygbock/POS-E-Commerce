-- AbaCha Unified Commerce
-- Migration 013: Audit and Security Hardening
-- Adds result column, composite query indexes, and append-only database immutability trigger for audit_events

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS';

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_result_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_result_check
  CHECK (result IN ('SUCCESS', 'FAILED', 'DENIED'));

CREATE INDEX IF NOT EXISTS idx_audit_org_timestamp
  ON audit_events(organization_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_org_severity
  ON audit_events(organization_id, severity, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_org_action
  ON audit_events(organization_id, action);

CREATE INDEX IF NOT EXISTS idx_audit_org_entity
  ON audit_events(organization_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_audit_org_result
  ON audit_events(organization_id, result);

-- Append-only immutability trigger
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: audit_events is an append-only audit ledger and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_events ON audit_events;

CREATE TRIGGER trg_immutable_audit_events
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_events_mutation();

-- Ensure organization slug is automatically derived if omitted during creation
CREATE OR REPLACE FUNCTION set_default_org_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(trim(both '-' from regexp_replace(COALESCE(NEW.code, NEW.id), '[^a-zA-Z0-9]+', '-', 'g')));
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
      NEW.slug := 'tenant-' || left(md5(NEW.id), 12);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_default_org_slug ON organizations;

CREATE TRIGGER trg_default_org_slug
BEFORE INSERT ON organizations
FOR EACH ROW
EXECUTE FUNCTION set_default_org_slug();
