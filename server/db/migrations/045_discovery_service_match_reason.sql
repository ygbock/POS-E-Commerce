-- Forward-only migration: persist the server-authoritative reason for each service-request match.
ALTER TABLE discovery_service_request_matches
  ADD COLUMN IF NOT EXISTS match_reason VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_discovery_request_matches_reason
  ON discovery_service_request_matches(request_id, match_reason);
