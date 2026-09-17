-- AbaCha Unified Commerce
-- Migration 022: Discovery marketplace, search projections, moderation and analytics.
-- Forward-only. Never modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_services (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  service_type VARCHAR(128),
  price_from NUMERIC(15,2),
  price_to NUMERIC(15,2),
  currency VARCHAR(16) NOT NULL DEFAULT 'SLE',
  duration_minutes INTEGER,
  service_area_text VARCHAR(500),
  booking_mode VARCHAR(32) NOT NULL DEFAULT 'REQUEST' CHECK (booking_mode IN ('REQUEST','BOOKING','QUOTE')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_discovery_service_business_slug UNIQUE (business_id, slug),
  CONSTRAINT ck_discovery_service_prices CHECK (price_from IS NULL OR price_from >= 0),
  CONSTRAINT ck_discovery_service_price_range CHECK (price_to IS NULL OR price_from IS NULL OR price_to >= price_from),
  CONSTRAINT ck_discovery_service_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);
CREATE INDEX IF NOT EXISTS idx_discovery_services_business_active ON discovery_services(business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_discovery_services_type ON discovery_services(service_type, is_active);

CREATE TABLE IF NOT EXISTS discovery_service_requests (
  id VARCHAR(64) PRIMARY KEY,
  customer_user_id VARCHAR(64),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64),
  customer_email VARCHAR(255),
  description TEXT NOT NULL,
  city VARCHAR(128),
  district VARCHAR(128),
  region VARCHAR(128),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  preferred_date DATE,
  budget_from NUMERIC(15,2),
  budget_to NUMERIC(15,2),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','MATCHED','QUOTED','ACCEPTED','CANCELLED','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_request_coordinates CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_discovery_service_requests_status ON discovery_service_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_service_requests_area ON discovery_service_requests(city, district, region);

CREATE TABLE IF NOT EXISTS discovery_service_request_matches (
  request_id VARCHAR(64) NOT NULL REFERENCES discovery_service_requests(id) ON DELETE CASCADE,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  match_score NUMERIC(6,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id, business_id)
);
CREATE INDEX IF NOT EXISTS idx_discovery_request_matches_business ON discovery_service_request_matches(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_service_quotes (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL REFERENCES discovery_service_requests(id) ON DELETE CASCADE,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  service_id VARCHAR(64) REFERENCES discovery_services(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(16) NOT NULL DEFAULT 'SLE',
  message TEXT,
  estimated_duration_minutes INTEGER,
  valid_until DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','ACCEPTED','DECLINED','EXPIRED','WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_discovery_quotes_request ON discovery_service_quotes(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_quotes_business ON discovery_service_quotes(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_reviews (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  reviewer_user_id VARCHAR(64),
  reviewer_name VARCHAR(255) NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(255),
  body TEXT,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
  verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PENDING','PUBLISHED','REJECTED','HIDDEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_discovery_reviews_business_status ON discovery_reviews(business_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_verified_review_order ON discovery_reviews(order_id) WHERE order_id IS NOT NULL AND verified_purchase = TRUE;

CREATE TABLE IF NOT EXISTS discovery_business_claims (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  claimant_user_id VARCHAR(64) NOT NULL,
  claimant_name VARCHAR(255) NOT NULL,
  claimant_email VARCHAR(255),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  reviewed_by_user_id VARCHAR(64),
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_discovery_claims_business_status ON discovery_business_claims(business_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_pending_claim_per_user ON discovery_business_claims(business_id, claimant_user_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS discovery_reports (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  service_id VARCHAR(64) REFERENCES discovery_services(id) ON DELETE CASCADE,
  reporter_user_id VARCHAR(64),
  reason_code VARCHAR(64) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED')),
  resolved_by_user_id VARCHAR(64),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_report_target CHECK (business_id IS NOT NULL OR service_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_discovery_reports_status ON discovery_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_analytics_events (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  product_id VARCHAR(64),
  service_id VARCHAR(64) REFERENCES discovery_services(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL CHECK (event_type IN ('SEARCH','IMPRESSION','VIEW','CONTACT','DIRECTION_CLICK','STORE_CLICK','PRODUCT_VIEW','SERVICE_VIEW','SERVICE_REQUEST','ORDER_CLICK')),
  session_hash VARCHAR(128),
  actor_user_id VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_discovery_analytics_business_time ON discovery_analytics_events(business_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_analytics_event_time ON discovery_analytics_events(event_type, created_at DESC);

-- Public search performance. PostgreSQL full-text search stays additive to the canonical tables.
CREATE INDEX IF NOT EXISTS idx_discovery_business_name_lower ON discovery_businesses(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_discovery_business_published_verified ON discovery_businesses(listing_status, is_discoverable, verification_status);
CREATE INDEX IF NOT EXISTS idx_discovery_location_city_region ON discovery_business_locations(city, district, region, is_active);
CREATE INDEX IF NOT EXISTS idx_products_discovery_channels ON products(status, channels_ecommerce, organization_id);
CREATE INDEX IF NOT EXISTS idx_variants_discovery_product ON product_variants(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_discovery_available ON inventory_balances(organization_id, variant_id, available);

-- Maintain business rating counters without exposing raw review data publicly.
CREATE OR REPLACE FUNCTION discovery_refresh_business_rating()
RETURNS TRIGGER AS $$
DECLARE target_business VARCHAR(64);
BEGIN
  target_business := COALESCE(NEW.business_id, OLD.business_id);
  UPDATE discovery_businesses b
  SET updated_at = CURRENT_TIMESTAMP
  WHERE b.id = target_business;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discovery_review_touch_business ON discovery_reviews;
CREATE TRIGGER trg_discovery_review_touch_business
AFTER INSERT OR UPDATE OR DELETE ON discovery_reviews
FOR EACH ROW EXECUTE FUNCTION discovery_refresh_business_rating();
