-- AbaCha Unified Commerce
-- Migration 047: Discovery request workload indexes.
-- Forward-only. Never modify previously applied migrations.

-- Customer request inboxes filter by owner and then sort by recency.
CREATE INDEX IF NOT EXISTS idx_discovery_service_requests_customer_updated
  ON discovery_service_requests(customer_user_id, updated_at DESC, created_at DESC);

-- Provider request inboxes join matches by business and then sort/filter request rows.
CREATE INDEX IF NOT EXISTS idx_discovery_request_matches_business_request_created
  ON discovery_service_request_matches(business_id, request_id, created_at DESC);

-- Quote inbox/detail workloads frequently filter a request's quotes by status and recency.
CREATE INDEX IF NOT EXISTS idx_discovery_quotes_request_status_created
  ON discovery_service_quotes(request_id, status, created_at DESC);
