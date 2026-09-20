-- AbaCha Unified Commerce
-- Migration 038: Discovery location quality, provenance and geo-search hardening
--
-- Forward-only. Never modify previously applied migrations.

ALTER TABLE discovery_business_locations
  ADD COLUMN IF NOT EXISTS location_quality_status VARCHAR(16) NOT NULL DEFAULT 'LOW'
    CHECK (location_quality_status IN ('LOW','MEDIUM','HIGH','VERIFIED')),
  ADD COLUMN IF NOT EXISTS location_source VARCHAR(16) NOT NULL DEFAULT 'MANUAL'
    CHECK (location_source IN ('MANUAL','GPS','GEOCODED','IMPORTED','VERIFIED')),
  ADD COLUMN IF NOT EXISTS address_completeness_score SMALLINT NOT NULL DEFAULT 0
    CHECK (address_completeness_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS coordinate_accuracy_m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS location_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_verified_by_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS quality_notes VARCHAR(1000);

CREATE INDEX IF NOT EXISTS idx_discovery_location_quality
  ON discovery_business_locations(location_quality_status, is_active);

CREATE INDEX IF NOT EXISTS idx_discovery_location_source
  ON discovery_business_locations(location_source);

CREATE INDEX IF NOT EXISTS idx_discovery_location_geo_active
  ON discovery_business_locations(is_active, latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Keep quality deterministic for existing records. Coordinates are the strongest
-- existing signal; a complete city/district/region address is the next fallback.
UPDATE discovery_business_locations
SET address_completeness_score =
  CASE
    WHEN COALESCE(NULLIF(TRIM(address_line_1),''),'') <> ''
     AND COALESCE(NULLIF(TRIM(city),''),'') <> ''
     AND COALESCE(NULLIF(TRIM(district),''),'') <> ''
     AND COALESCE(NULLIF(TRIM(region),''),'') <> '' THEN 100
    WHEN COALESCE(NULLIF(TRIM(city),''),'') <> ''
     AND COALESCE(NULLIF(TRIM(region),''),'') <> '' THEN 75
    WHEN COALESCE(NULLIF(TRIM(city),''),'') <> '' THEN 50
    ELSE 0
  END,
  location_quality_status =
  CASE
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL
     AND COALESCE(NULLIF(TRIM(address_line_1),''),'') <> ''
     AND COALESCE(NULLIF(TRIM(city),''),'') <> '' THEN 'HIGH'
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL
      OR (COALESCE(NULLIF(TRIM(city),''),'') <> '' AND COALESCE(NULLIF(TRIM(region),''),'') <> '') THEN 'MEDIUM'
    ELSE 'LOW'
  END
WHERE TRUE;

-- Service-area locations represent coverage rather than a conventional storefront.
-- Require a positive service radius and coordinates when a radius is supplied.
ALTER TABLE discovery_business_locations
  DROP CONSTRAINT IF EXISTS ck_discovery_service_area_radius;

ALTER TABLE discovery_business_locations
  ADD CONSTRAINT ck_discovery_service_area_radius CHECK (
    location_type <> 'SERVICE_AREA'
    OR (service_radius_km IS NOT NULL AND service_radius_km > 0)
  );
