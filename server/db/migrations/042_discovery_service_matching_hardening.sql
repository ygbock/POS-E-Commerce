-- AbaCha Unified Commerce
-- Migration 042: Discovery service-request matching hardening.
-- Forward-only. Never modify previously applied migrations.

ALTER TABLE discovery_service_requests
  ADD COLUMN IF NOT EXISTS requested_service_id VARCHAR(64)
    REFERENCES discovery_services(id) ON DELETE SET NULL;

ALTER TABLE discovery_service_requests
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(128);

ALTER TABLE discovery_service_request_matches
  ADD COLUMN IF NOT EXISTS match_reason VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_discovery_requests_requested_service
  ON discovery_service_requests(requested_service_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_requests_service_type
  ON discovery_service_requests(service_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_request_matches_score
  ON discovery_service_request_matches(request_id, match_score DESC, created_at DESC);
