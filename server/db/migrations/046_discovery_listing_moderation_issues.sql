-- AbaCha Unified Commerce
-- Migration 046: Discovery listing moderation issues.
-- Forward-only. Never modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_listing_moderation_issues (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  listing_event_id VARCHAR(64) REFERENCES discovery_listing_events(id) ON DELETE SET NULL,
  issue_key VARCHAR(64) NOT NULL,
  detail TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id VARCHAR(64),
  CONSTRAINT ck_discovery_listing_moderation_issue_status CHECK (status IN ('OPEN','RESOLVED','SUPERSEDED')),
  CONSTRAINT ck_discovery_listing_moderation_issue_key CHECK (issue_key IN ('identity','description','contact','category','location','coordinates','offering','store'))
);

CREATE INDEX IF NOT EXISTS idx_discovery_listing_moderation_issues_business
  ON discovery_listing_moderation_issues(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_listing_moderation_issues_open
  ON discovery_listing_moderation_issues(business_id, status, created_at DESC);
