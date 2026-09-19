-- AbaCha Unified Commerce
-- Migration 028: Discovery PostgreSQL full-text, trigram and filter indexes.
-- Forward-only. Never modify previously applied migrations.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

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

CREATE INDEX IF NOT EXISTS idx_discovery_business_name_trgm
  ON discovery_businesses
  USING GIN (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_discovery_business_description_trgm
  ON discovery_businesses
  USING GIN (lower(coalesce(short_description,'') || ' ' || coalesce(description,'')) gin_trgm_ops);

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

CREATE INDEX IF NOT EXISTS idx_products_discovery_name_trgm
  ON products
  USING GIN (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_variants_discovery_sku_trgm
  ON product_variants
  USING GIN (lower(coalesce(sku,'')) gin_trgm_ops);

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

CREATE INDEX IF NOT EXISTS idx_discovery_services_name_trgm
  ON discovery_services
  USING GIN (lower(name) gin_trgm_ops);

-- Category-aware discovery filters.
CREATE INDEX IF NOT EXISTS idx_discovery_category_name_trgm
  ON discovery_business_categories
  USING GIN (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_discovery_category_slug_lower
  ON discovery_business_categories(lower(slug));

-- Prefix/location filters used by the public search endpoint.
CREATE INDEX IF NOT EXISTS idx_discovery_location_city_lower
  ON discovery_business_locations(lower(city), is_active);

CREATE INDEX IF NOT EXISTS idx_discovery_location_district_lower
  ON discovery_business_locations(lower(district), is_active);

CREATE INDEX IF NOT EXISTS idx_discovery_location_region_lower
  ON discovery_business_locations(lower(region), is_active);
