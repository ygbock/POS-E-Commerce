-- AbaCha Unified Commerce
-- Migration 048: Discovery search filter/index hardening.
-- Forward-only. Never modify previously applied migrations.

-- Category filtering joins map rows by business and category.
CREATE INDEX IF NOT EXISTS idx_discovery_business_category_map_business_category
  ON discovery_business_category_map(business_id, category_id);

-- Business search frequently filters published/discoverable rows before ranking.
CREATE INDEX IF NOT EXISTS idx_discovery_business_search_visibility
  ON discovery_businesses(listing_status, is_discoverable, verification_status, id);

-- Public search resolves one active location per business and may filter by location.
CREATE INDEX IF NOT EXISTS idx_discovery_location_business_active_primary
  ON discovery_business_locations(business_id, is_active, is_primary DESC, created_at, id);

-- Open-now search checks active hours by location/day.
CREATE INDEX IF NOT EXISTS idx_discovery_hours_location_day_open
  ON discovery_business_hours(location_id, day_of_week, is_closed, opens_at, closes_at);

-- Active aliases are searched by entity and normalized alias.
CREATE INDEX IF NOT EXISTS idx_discovery_search_aliases_business_active_normalized
  ON discovery_search_aliases(entity_id, normalized_alias)
  WHERE entity_type='BUSINESS' AND is_active=TRUE;
