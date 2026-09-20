-- AbaCha Unified Commerce
-- Migration 037: Discovery category governance
--
-- Forward-only. Category taxonomy is platform-owned. Merchants may only
-- consume active categories; platform discovery operators govern the taxonomy.

ALTER TABLE discovery_business_categories
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_discovery_category_active_parent_order
  ON discovery_business_categories(is_active, parent_id, display_order, name);

UPDATE discovery_business_categories
SET is_system = TRUE,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  'disc_cat_retail',
  'disc_cat_food',
  'disc_cat_services',
  'disc_cat_automotive',
  'disc_cat_electronics',
  'disc_cat_health',
  'disc_cat_fashion',
  'disc_cat_home',
  'disc_cat_professional'
);

CREATE TABLE IF NOT EXISTS discovery_category_events (
  id VARCHAR(64) PRIMARY KEY,
  category_id VARCHAR(64) NOT NULL REFERENCES discovery_business_categories(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  actor_user_id VARCHAR(64),
  from_state JSONB,
  to_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_category_events_category
  ON discovery_category_events(category_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_category_events_type
  ON discovery_category_events(event_type, created_at DESC);
