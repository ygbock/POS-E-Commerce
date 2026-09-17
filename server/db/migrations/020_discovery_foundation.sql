-- AbaCha Unified Commerce
-- Migration 020: Discovery foundation
--
-- IMPORTANT: this is a forward-only migration. Do not modify previously applied
-- migration files. Discovery businesses are independent of tenants; a business may
-- remain discovery-only or later attach to an organization/tenant for commerce.

-- 1. Platform-wide discovery business categories.
CREATE TABLE IF NOT EXISTS discovery_business_categories (
  id VARCHAR(64) PRIMARY KEY,
  parent_id VARCHAR(64) REFERENCES discovery_business_categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  icon_name VARCHAR(128),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_discovery_category_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_discovery_category_parent
  ON discovery_business_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_discovery_category_active_order
  ON discovery_business_categories(is_active, display_order);

-- 2. Canonical business identity. organization_id is optional by design:
--    DISCOVERY_ONLY -> no tenant
--    DISCOVERY_AND_STORE -> organization/tenant attached
CREATE TABLE IF NOT EXISTS discovery_businesses (
  id VARCHAR(64) PRIMARY KEY,
  public_id VARCHAR(64) NOT NULL UNIQUE,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  slug VARCHAR(255) NOT NULL,
  business_type VARCHAR(64),
  short_description VARCHAR(500),
  description TEXT,
  phone VARCHAR(64),
  email VARCHAR(255),
  whatsapp VARCHAR(64),
  website TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  business_mode VARCHAR(32) NOT NULL DEFAULT 'DISCOVERY_ONLY'
    CHECK (business_mode IN ('DISCOVERY_ONLY', 'DISCOVERY_AND_STORE')),
  listing_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (listing_status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'PAUSED', 'SUSPENDED', 'ARCHIVED')),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id VARCHAR(64),
  published_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_business_mode_tenant CHECK (
    (business_mode = 'DISCOVERY_ONLY' AND organization_id IS NULL)
    OR
    (business_mode = 'DISCOVERY_AND_STORE' AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_business_slug_lower
  ON discovery_businesses(LOWER(slug));
CREATE INDEX IF NOT EXISTS idx_discovery_business_listing
  ON discovery_businesses(listing_status, is_discoverable);
CREATE INDEX IF NOT EXISTS idx_discovery_business_verification
  ON discovery_businesses(verification_status);
CREATE INDEX IF NOT EXISTS idx_discovery_business_org
  ON discovery_businesses(organization_id);

-- 3. A business can belong to multiple discovery categories.
CREATE TABLE IF NOT EXISTS discovery_business_category_map (
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  category_id VARCHAR(64) NOT NULL REFERENCES discovery_business_categories(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_business_category_category
  ON discovery_business_category_map(category_id, business_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_business_primary_category
  ON discovery_business_category_map(business_id)
  WHERE is_primary = TRUE;

-- 4. Business locations. Discovery supports physical branches and service-area
--    businesses without requiring a commerce tenant.
CREATE TABLE IF NOT EXISTS discovery_business_locations (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  location_type VARCHAR(32) NOT NULL DEFAULT 'STORE'
    CHECK (location_type IN ('STORE', 'OFFICE', 'BRANCH', 'WAREHOUSE', 'HOME_BASED', 'MOBILE', 'SERVICE_AREA')),
  address_line_1 VARCHAR(255),
  address_line_2 VARCHAR(255),
  city VARCHAR(128),
  district VARCHAR(128),
  region VARCHAR(128),
  country VARCHAR(128) NOT NULL DEFAULT 'Sierra Leone',
  postal_code VARCHAR(32),
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  service_radius_km NUMERIC(8, 2),
  phone VARCHAR(64),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_location_latitude CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT ck_discovery_location_longitude CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT ck_discovery_location_radius CHECK (service_radius_km IS NULL OR service_radius_km >= 0),
  CONSTRAINT ck_discovery_location_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_discovery_location_business
  ON discovery_business_locations(business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_discovery_location_city_district
  ON discovery_business_locations(city, district, is_active);
CREATE INDEX IF NOT EXISTS idx_discovery_location_coordinates
  ON discovery_business_locations(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_primary_location
  ON discovery_business_locations(business_id)
  WHERE is_primary = TRUE;

-- 5. Weekly opening hours. day_of_week follows ISO convention: 1=Monday..7=Sunday.
CREATE TABLE IF NOT EXISTS discovery_business_hours (
  id VARCHAR(64) PRIMARY KEY,
  location_id VARCHAR(64) NOT NULL REFERENCES discovery_business_locations(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  opens_at TIME,
  closes_at TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_discovery_location_day UNIQUE (location_id, day_of_week),
  CONSTRAINT ck_discovery_hours_times CHECK (
    (is_closed = TRUE AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (is_closed = FALSE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
  )
);

CREATE INDEX IF NOT EXISTS idx_discovery_hours_location
  ON discovery_business_hours(location_id, day_of_week);

-- 6. Exceptional opening hours / holidays.
CREATE TABLE IF NOT EXISTS discovery_business_special_hours (
  id VARCHAR(64) PRIMARY KEY,
  location_id VARCHAR(64) NOT NULL REFERENCES discovery_business_locations(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  opens_at TIME,
  closes_at TIME,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_discovery_special_hours_date UNIQUE (location_id, service_date),
  CONSTRAINT ck_discovery_special_hours_times CHECK (
    (is_closed = TRUE AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (is_closed = FALSE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
  )
);

-- 7. Business-level public discovery controls. Operational inventory/product data
--    must never become public merely because a tenant exists.
CREATE TABLE IF NOT EXISTS discovery_business_settings (
  business_id VARCHAR(64) PRIMARY KEY REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  show_products BOOLEAN NOT NULL DEFAULT TRUE,
  show_prices BOOLEAN NOT NULL DEFAULT TRUE,
  show_stock_status BOOLEAN NOT NULL DEFAULT FALSE,
  allow_phone_contact BOOLEAN NOT NULL DEFAULT TRUE,
  allow_whatsapp_contact BOOLEAN NOT NULL DEFAULT TRUE,
  allow_directions BOOLEAN NOT NULL DEFAULT TRUE,
  allow_service_requests BOOLEAN NOT NULL DEFAULT TRUE,
  allow_reviews BOOLEAN NOT NULL DEFAULT TRUE,
  allow_public_store_link BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Listing lifecycle history. This is an immutable business-domain history table;
--    the generic audit log remains the cross-platform compliance log.
CREATE TABLE IF NOT EXISTS discovery_listing_events (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  reason TEXT,
  actor_user_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_listing_events_business
  ON discovery_listing_events(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_listing_events_status
  ON discovery_listing_events(to_status, created_at DESC);

-- 9. Seed the minimum top-level taxonomy required by the initial onboarding UI.
--    IDs are stable platform identifiers so future migrations can safely reference them.
INSERT INTO discovery_business_categories (id, name, slug, description, display_order)
VALUES
  ('disc_cat_retail', 'Retail', 'retail', 'Retail shops and stores', 10),
  ('disc_cat_food', 'Food & Dining', 'food-dining', 'Restaurants, food vendors and dining businesses', 20),
  ('disc_cat_services', 'Services', 'services', 'General consumer and business services', 30),
  ('disc_cat_automotive', 'Automotive', 'automotive', 'Vehicle sales, repair, parts and related services', 40),
  ('disc_cat_electronics', 'Electronics & Technology', 'electronics-technology', 'Electronics, computers, phones and technology services', 50),
  ('disc_cat_health', 'Health & Wellness', 'health-wellness', 'Health, wellness and personal care businesses', 60),
  ('disc_cat_fashion', 'Fashion & Beauty', 'fashion-beauty', 'Fashion, clothing, beauty and personal care', 70),
  ('disc_cat_home', 'Home & Construction', 'home-construction', 'Home improvement, construction and property services', 80),
  ('disc_cat_professional', 'Professional Services', 'professional-services', 'Professional, consulting and business services', 90)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  updated_at = CURRENT_TIMESTAMP;
