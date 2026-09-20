-- AbaCha Unified Commerce
-- Migration 039: normalize Discovery location types used by the merchant UI.
-- Forward-only.

ALTER TABLE discovery_business_locations
  DROP CONSTRAINT IF EXISTS discovery_business_locations_location_type_check;

ALTER TABLE discovery_business_locations
  ADD CONSTRAINT ck_discovery_location_type CHECK (
    location_type IN ('STORE','OFFICE','BRANCH','WAREHOUSE','HOME_BASED','MOBILE','SERVICE_AREA','KIOSK','OTHER')
  );
