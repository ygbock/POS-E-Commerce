-- AbaCha Unified Commerce
-- Migration 032: Discovery service-request lifecycle integrity.
-- Forward-only. Never modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_service_request_events (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL REFERENCES discovery_service_requests(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(64),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_request_events_request
  ON discovery_service_request_events(request_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_accepted_quote_per_request
  ON discovery_service_quotes(request_id)
  WHERE status = 'ACCEPTED';

CREATE INDEX IF NOT EXISTS idx_discovery_quotes_status_validity
  ON discovery_service_quotes(status, valid_until, created_at DESC);

ALTER TABLE discovery_service_requests
  ADD CONSTRAINT ck_discovery_request_budgets
  CHECK (budget_from IS NULL OR budget_from >= 0);

ALTER TABLE discovery_service_requests
  ADD CONSTRAINT ck_discovery_request_budget_range
  CHECK (budget_to IS NULL OR budget_to >= COALESCE(budget_from, 0));

ALTER TABLE discovery_service_requests
  ADD CONSTRAINT ck_discovery_request_preferred_date
  CHECK (preferred_date IS NULL OR preferred_date >= CURRENT_DATE);
