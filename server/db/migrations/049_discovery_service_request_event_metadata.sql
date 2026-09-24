-- AbaCha Unified Commerce
-- Migration 049: Discovery service-request event metadata and notification-ready audit trail.
-- Forward-only. Never modify previously applied migrations.

ALTER TABLE discovery_service_request_events
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(64) NOT NULL DEFAULT 'STATUS_CHANGED',
  ADD COLUMN IF NOT EXISTS business_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS quote_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_discovery_request_events_request_type_created
  ON discovery_service_request_events(request_id, event_type, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_discovery_request_events_business_created
  ON discovery_service_request_events(business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_request_events_quote
  ON discovery_service_request_events(quote_id)
  WHERE quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION discovery_service_request_event_type()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_type = 'STATUS_CHANGED' THEN
    NEW.event_type := CASE
      WHEN NEW.from_status IS NULL AND NEW.to_status = 'OPEN' THEN 'REQUEST_CREATED'
      WHEN NEW.from_status = 'OPEN' AND NEW.to_status = 'MATCHED' THEN 'REQUEST_MATCHED'
      WHEN NEW.to_status = 'QUOTED' THEN 'QUOTE_SUBMITTED'
      WHEN NEW.from_status = 'QUOTED' AND NEW.to_status = 'ACCEPTED' THEN 'QUOTE_ACCEPTED'
      WHEN NEW.from_status = 'QUOTED' AND NEW.to_status = 'MATCHED' THEN 'QUOTES_DECLINED'
      ELSE 'STATUS_CHANGED'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discovery_service_request_event_type
  ON discovery_service_request_events;

CREATE TRIGGER trg_discovery_service_request_event_type
BEFORE INSERT ON discovery_service_request_events
FOR EACH ROW EXECUTE FUNCTION discovery_service_request_event_type();

UPDATE discovery_service_request_events
SET event_type = CASE
  WHEN from_status IS NULL AND to_status = 'OPEN' THEN 'REQUEST_CREATED'
  WHEN from_status = 'OPEN' AND to_status = 'MATCHED' THEN 'REQUEST_MATCHED'
  WHEN to_status = 'QUOTED' THEN 'QUOTE_SUBMITTED'
  WHEN from_status = 'QUOTED' AND to_status = 'ACCEPTED' THEN 'QUOTE_ACCEPTED'
  WHEN from_status = 'QUOTED' AND to_status = 'MATCHED' THEN 'QUOTES_DECLINED'
  ELSE 'STATUS_CHANGED'
END
WHERE event_type = 'STATUS_CHANGED';
