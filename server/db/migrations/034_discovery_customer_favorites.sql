-- AbaCha Unified Commerce
-- Migration 034: Discovery customer favorites.
-- Forward-only. Never modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_business_favorites (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_discovery_business_favorite UNIQUE (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_business_favorites_user
  ON discovery_business_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_business_favorites_business
  ON discovery_business_favorites(business_id, created_at DESC);
