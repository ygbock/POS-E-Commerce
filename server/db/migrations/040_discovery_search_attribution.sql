-- AbaCha Unified Commerce
-- Migration 040: Discovery search attribution and conversion telemetry.
-- Forward-only. Never modify previously applied migrations.

ALTER TABLE discovery_analytics_events
  ADD COLUMN IF NOT EXISTS search_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS result_position INTEGER,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(16),
  ADD COLUMN IF NOT EXISTS entity_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS attribution_source VARCHAR(32);

ALTER TABLE discovery_analytics_events
  ADD CONSTRAINT ck_discovery_analytics_result_position
  CHECK (result_position IS NULL OR result_position > 0);

ALTER TABLE discovery_analytics_events
  ADD CONSTRAINT ck_discovery_analytics_entity_type
  CHECK (entity_type IS NULL OR entity_type IN ('BUSINESS','PRODUCT','SERVICE'));

CREATE INDEX IF NOT EXISTS idx_discovery_analytics_search_id
  ON discovery_analytics_events(search_id, created_at DESC)
  WHERE search_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_analytics_entity_attribution
  ON discovery_analytics_events(entity_type, entity_id, event_type, created_at DESC)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_analytics_search_conversion
  ON discovery_analytics_events(search_id, event_type, result_position)
  WHERE search_id IS NOT NULL;
