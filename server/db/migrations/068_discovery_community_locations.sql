-- =============================================================================
-- Migration 068: Discovery localities (communities, neighborhoods and villages)
-- =============================================================================
-- Extends the platform-managed geography hierarchy to:
-- Region -> District -> City/Town -> Community/Neighborhood/Village.
-- Location data remains database-driven and editable through Platform Discovery.
-- =============================================================================

ALTER TABLE discovery_geo_locations
  DROP CONSTRAINT IF EXISTS discovery_geo_locations_location_type_check;

ALTER TABLE discovery_geo_locations
  ADD CONSTRAINT discovery_geo_locations_location_type_check
  CHECK (location_type IN ('REGION', 'DISTRICT', 'CITY', 'COMMUNITY'));

CREATE INDEX IF NOT EXISTS idx_discovery_geo_locations_active_parent
  ON discovery_geo_locations(parent_id, is_active, display_order, name);

-- Initial Freetown communities. The taxonomy is intentionally extensible: platform
-- administrators can add verified communities and villages for every town/district.
INSERT INTO discovery_geo_locations
  (id, parent_id, location_type, name, slug, display_order, is_active, is_system)
VALUES
  ('geo_com_wellington', 'geo_city_freetown', 'COMMUNITY', 'Wellington', 'wellington', 10, TRUE, TRUE),
  ('geo_com_lumley', 'geo_city_freetown', 'COMMUNITY', 'Lumley', 'lumley', 20, TRUE, TRUE),
  ('geo_com_aberdeen', 'geo_city_freetown', 'COMMUNITY', 'Aberdeen', 'aberdeen', 30, TRUE, TRUE),
  ('geo_com_new_england_ville', 'geo_city_freetown', 'COMMUNITY', 'New England Ville', 'new-england-ville', 40, TRUE, TRUE),
  ('geo_com_hill_station', 'geo_city_freetown', 'COMMUNITY', 'Hill Station', 'hill-station', 50, TRUE, TRUE),
  ('geo_com_brookfields', 'geo_city_freetown', 'COMMUNITY', 'Brookfields', 'brookfields', 60, TRUE, TRUE),
  ('geo_com_congo_cross', 'geo_city_freetown', 'COMMUNITY', 'Congo Cross', 'congo-cross', 70, TRUE, TRUE),
  ('geo_com_congo_town', 'geo_city_freetown', 'COMMUNITY', 'Congo Town', 'congo-town', 80, TRUE, TRUE),
  ('geo_com_kissy', 'geo_city_freetown', 'COMMUNITY', 'Kissy', 'kissy', 90, TRUE, TRUE),
  ('geo_com_calaba_town', 'geo_city_freetown', 'COMMUNITY', 'Calaba Town', 'calaba-town', 100, TRUE, TRUE),
  ('geo_com_jui', 'geo_city_freetown', 'COMMUNITY', 'Jui', 'jui', 110, TRUE, TRUE),
  ('geo_com_leicester', 'geo_city_freetown', 'COMMUNITY', 'Leicester', 'leicester', 120, TRUE, TRUE),
  ('geo_com_regent', 'geo_city_freetown', 'COMMUNITY', 'Regent', 'regent', 130, TRUE, TRUE),
  ('geo_com_goderich', 'geo_city_freetown', 'COMMUNITY', 'Goderich', 'goderich', 140, TRUE, TRUE),
  ('geo_com_juba', 'geo_city_freetown', 'COMMUNITY', 'Juba', 'juba', 150, TRUE, TRUE),
  ('geo_com_mambo', 'geo_city_freetown', 'COMMUNITY', 'Mambo', 'mambo', 160, TRUE, TRUE),
  ('geo_com_tengbeh_town', 'geo_city_freetown', 'COMMUNITY', 'Tengbeh Town', 'tengbeh-town', 170, TRUE, TRUE),
  ('geo_com_wilberforce', 'geo_city_freetown', 'COMMUNITY', 'Wilberforce', 'wilberforce', 180, TRUE, TRUE),
  ('geo_com_murray_town', 'geo_city_freetown', 'COMMUNITY', 'Murray Town', 'murray-town', 190, TRUE, TRUE),
  ('geo_com_cline_town', 'geo_city_freetown', 'COMMUNITY', 'Cline Town', 'cline-town', 200, TRUE, TRUE),
  ('geo_com_fourah_bay', 'geo_city_freetown', 'COMMUNITY', 'Fourah Bay', 'fourah-bay', 210, TRUE, TRUE),
  ('geo_com_kroo_bay', 'geo_city_freetown', 'COMMUNITY', 'Kroo Bay', 'kroo-bay', 220, TRUE, TRUE),
  ('geo_com_susans_bay', 'geo_city_freetown', 'COMMUNITY', 'Susan’s Bay', 'susans-bay', 230, TRUE, TRUE),
  ('geo_com_kingtom', 'geo_city_freetown', 'COMMUNITY', 'Kingtom', 'kingtom', 240, TRUE, TRUE),
  ('geo_com_wilkinson_road', 'geo_city_freetown', 'COMMUNITY', 'Wilkinson Road', 'wilkinson-road', 250, TRUE, TRUE),
  ('geo_com_spur_road', 'geo_city_freetown', 'COMMUNITY', 'Spur Road', 'spur-road', 260, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;
