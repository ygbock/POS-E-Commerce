-- =============================================================================
-- Migration 055: Discovery Geography Taxonomy (Regions, Districts, Cities)
-- =============================================================================
-- Platform-authoritative geographic taxonomy for the main discovery search
-- and location selectors (Region -> District -> City).
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery_geo_locations (
  id VARCHAR(64) PRIMARY KEY,
  parent_id VARCHAR(64) REFERENCES discovery_geo_locations(id) ON DELETE CASCADE,
  location_type VARCHAR(32) NOT NULL CHECK (location_type IN ('REGION', 'DISTRICT', 'CITY')),
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(128) NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_geo_locations_parent ON discovery_geo_locations(parent_id, display_order, name);
CREATE INDEX IF NOT EXISTS idx_discovery_geo_locations_type_active ON discovery_geo_locations(location_type, is_active, display_order);

-- Seed default Regions / Provinces
INSERT INTO discovery_geo_locations (id, parent_id, location_type, name, slug, display_order, is_active, is_system) VALUES
  ('geo_reg_western', NULL, 'REGION', 'Western Area', 'western-area', 10, TRUE, TRUE),
  ('geo_reg_eastern', NULL, 'REGION', 'Eastern Province', 'eastern-province', 20, TRUE, TRUE),
  ('geo_reg_northern', NULL, 'REGION', 'Northern Province', 'northern-province', 30, TRUE, TRUE),
  ('geo_reg_southern', NULL, 'REGION', 'Southern Province', 'southern-province', 40, TRUE, TRUE),
  ('geo_reg_northwest', NULL, 'REGION', 'North West Province', 'north-west-province', 50, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed default Districts under Regions
INSERT INTO discovery_geo_locations (id, parent_id, location_type, name, slug, display_order, is_active, is_system) VALUES
  ('geo_dist_western_urban', 'geo_reg_western', 'DISTRICT', 'Western Area Urban', 'western-area-urban', 11, TRUE, TRUE),
  ('geo_dist_western_rural', 'geo_reg_western', 'DISTRICT', 'Western Area Rural', 'western-area-rural', 12, TRUE, TRUE),
  ('geo_dist_kenema', 'geo_reg_eastern', 'DISTRICT', 'Kenema District', 'kenema-district', 21, TRUE, TRUE),
  ('geo_dist_kono', 'geo_reg_eastern', 'DISTRICT', 'Kono District', 'kono-district', 22, TRUE, TRUE),
  ('geo_dist_kailahun', 'geo_reg_eastern', 'DISTRICT', 'Kailahun District', 'kailahun-district', 23, TRUE, TRUE),
  ('geo_dist_bombali', 'geo_reg_northern', 'DISTRICT', 'Bombali District', 'bombali-district', 31, TRUE, TRUE),
  ('geo_dist_tonkolili', 'geo_reg_northern', 'DISTRICT', 'Tonkolili District', 'tonkolili-district', 32, TRUE, TRUE),
  ('geo_dist_koinadugu', 'geo_reg_northern', 'DISTRICT', 'Koinadugu District', 'koinadugu-district', 33, TRUE, TRUE),
  ('geo_dist_falaba', 'geo_reg_northern', 'DISTRICT', 'Falaba District', 'falaba-district', 34, TRUE, TRUE),
  ('geo_dist_bo', 'geo_reg_southern', 'DISTRICT', 'Bo District', 'bo-district', 41, TRUE, TRUE),
  ('geo_dist_moyamba', 'geo_reg_southern', 'DISTRICT', 'Moyamba District', 'moyamba-district', 42, TRUE, TRUE),
  ('geo_dist_pujehun', 'geo_reg_southern', 'DISTRICT', 'Pujehun District', 'pujehun-district', 43, TRUE, TRUE),
  ('geo_dist_bonthe', 'geo_reg_southern', 'DISTRICT', 'Bonthe District', 'bonthe-district', 44, TRUE, TRUE),
  ('geo_dist_port_loko', 'geo_reg_northwest', 'DISTRICT', 'Port Loko District', 'port-loko-district', 51, TRUE, TRUE),
  ('geo_dist_kambia', 'geo_reg_northwest', 'DISTRICT', 'Kambia District', 'kambia-district', 52, TRUE, TRUE),
  ('geo_dist_karene', 'geo_reg_northwest', 'DISTRICT', 'Karene District', 'karene-district', 53, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed default Cities under Districts
INSERT INTO discovery_geo_locations (id, parent_id, location_type, name, slug, display_order, is_active, is_system) VALUES
  ('geo_city_freetown', 'geo_dist_western_urban', 'CITY', 'Freetown', 'freetown', 1, TRUE, TRUE),
  ('geo_city_waterloo', 'geo_dist_western_rural', 'CITY', 'Waterloo', 'waterloo', 2, TRUE, TRUE),
  ('geo_city_kenema', 'geo_dist_kenema', 'CITY', 'Kenema', 'kenema', 3, TRUE, TRUE),
  ('geo_city_koidu', 'geo_dist_kono', 'CITY', 'Koidu', 'koidu', 4, TRUE, TRUE),
  ('geo_city_kailahun', 'geo_dist_kailahun', 'CITY', 'Kailahun', 'kailahun', 5, TRUE, TRUE),
  ('geo_city_makeni', 'geo_dist_bombali', 'CITY', 'Makeni', 'makeni', 6, TRUE, TRUE),
  ('geo_city_magburaka', 'geo_dist_tonkolili', 'CITY', 'Magburaka', 'magburaka', 7, TRUE, TRUE),
  ('geo_city_kabala', 'geo_dist_koinadugu', 'CITY', 'Kabala', 'kabala', 8, TRUE, TRUE),
  ('geo_city_bo', 'geo_dist_bo', 'CITY', 'Bo', 'bo', 9, TRUE, TRUE),
  ('geo_city_moyamba', 'geo_dist_moyamba', 'CITY', 'Moyamba', 'moyamba', 10, TRUE, TRUE),
  ('geo_city_pujehun', 'geo_dist_pujehun', 'CITY', 'Pujehun', 'pujehun', 11, TRUE, TRUE),
  ('geo_city_bonthe', 'geo_dist_bonthe', 'CITY', 'Bonthe', 'bonthe', 12, TRUE, TRUE),
  ('geo_city_port_loko', 'geo_dist_port_loko', 'CITY', 'Port Loko', 'port-loko', 13, TRUE, TRUE),
  ('geo_city_lunsar', 'geo_dist_port_loko', 'CITY', 'Lunsar', 'lunsar', 14, TRUE, TRUE),
  ('geo_city_kambia', 'geo_dist_kambia', 'CITY', 'Kambia', 'kambia', 15, TRUE, TRUE),
  ('geo_city_kamakwie', 'geo_dist_karene', 'CITY', 'Kamakwie', 'kamakwie', 16, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;
