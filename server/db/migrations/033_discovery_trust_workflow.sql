-- AbaCha Unified Commerce
-- Migration 033: Discovery trust, verification and moderation workflow.
-- Forward-only. Never modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_verification_applications (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  applicant_user_id VARCHAR(64) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  reviewed_by_user_id VARCHAR(64),
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_verification_evidence_object CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_pending_verification_application
  ON discovery_verification_applications(business_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_discovery_verification_business_status
  ON discovery_verification_applications(business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_verification_status_created
  ON discovery_verification_applications(status, created_at ASC);

CREATE TABLE IF NOT EXISTS discovery_trust_events (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL
    CHECK (entity_type IN ('BUSINESS','CLAIM','VERIFICATION','REVIEW','REPORT')),
  entity_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  from_status VARCHAR(64),
  to_status VARCHAR(64),
  actor_user_id VARCHAR(64),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_trust_event_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_discovery_trust_events_business_time
  ON discovery_trust_events(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_trust_events_entity_time
  ON discovery_trust_events(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_review_moderation_events (
  id VARCHAR(64) PRIMARY KEY,
  review_id VARCHAR(64) NOT NULL REFERENCES discovery_reviews(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_review_moderation_events_review
  ON discovery_review_moderation_events(review_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_report_events (
  id VARCHAR(64) PRIMARY KEY,
  report_id VARCHAR(64) NOT NULL REFERENCES discovery_reports(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_report_events_report
  ON discovery_report_events(report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_claims_status_created
  ON discovery_business_claims(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_discovery_reviews_status_created
  ON discovery_reviews(status, created_at ASC);
