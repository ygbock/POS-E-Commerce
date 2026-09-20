-- Discovery merchant review responses
CREATE TABLE IF NOT EXISTS discovery_review_responses (
  id VARCHAR(64) PRIMARY KEY,
  review_id VARCHAR(64) NOT NULL REFERENCES discovery_reviews(id) ON DELETE CASCADE,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  responder_user_id VARCHAR(64) NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_discovery_review_response UNIQUE (review_id),
  CONSTRAINT ck_discovery_review_response_text CHECK (length(trim(response)) > 0 AND length(response) <= 5000)
);

CREATE INDEX IF NOT EXISTS idx_discovery_review_responses_business
  ON discovery_review_responses(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_review_responses_review
  ON discovery_review_responses(review_id);
