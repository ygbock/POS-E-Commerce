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
