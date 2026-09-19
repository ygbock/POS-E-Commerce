-- Discovery search analytics indexes.
-- Forward-only migration: do not modify previously applied migrations.

CREATE INDEX IF NOT EXISTS idx_discovery_analytics_event_type_created_at
  ON discovery_analytics_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_analytics_business_created_at
  ON discovery_analytics_events(business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_analytics_search_query_hash
  ON discovery_analytics_events((metadata->>'queryHash'), created_at DESC)
  WHERE event_type = 'SEARCH';
