-- AbaCha Unified Commerce
-- Migration 028: Discovery PostgreSQL full-text, trigram and filter indexes.
-- Forward-only. Never modify previously applied migrations.

-- Business discovery search.
CREATE INDEX IF NOT EXISTS idx_discovery_business_search_fts
  ON discovery_businesses
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(name,'') || ' ' ||
      coalesce(legal_name,'') || ' ' ||
      coalesce(short_description,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(business_type,'')
    )
  );

-- Product discovery search. Product visibility is still enforced by the API query.
CREATE INDEX IF NOT EXISTS idx_products_discovery_search_fts
  ON products
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(name,'') || ' ' ||
      coalesce(short_description,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(slug,'')
    )
  );

-- Service discovery search.
CREATE INDEX IF NOT EXISTS idx_discovery_services_search_fts
  ON discovery_services
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(name,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(service_type,'') || ' ' ||
      coalesce(service_area_text,'')
    )
  );

-- Category-aware discovery filters.
CREATE INDEX IF NOT EXISTS idx_discovery_category_slug_lower
  ON discovery_business_categories(lower(slug));

-- Prefix/location filters used by the public search endpoint.
CREATE INDEX IF NOT EXISTS idx_discovery_location_city_lower
  ON discovery_business_locations(lower(city), is_active);

CREATE INDEX IF NOT EXISTS idx_discovery_location_district_lower
  ON discovery_business_locations(lower(district), is_active);

CREATE INDEX IF NOT EXISTS idx_discovery_location_region_lower
  ON discovery_business_locations(lower(region), is_active);
