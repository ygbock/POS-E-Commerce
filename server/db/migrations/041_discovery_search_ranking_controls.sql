-- AbaCha Unified Commerce
-- Migration 041: Configurable Discovery search ranking controls.
-- Forward-only. Never modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_search_ranking_config (
  id VARCHAR(32) PRIMARY KEY,
  text_match_weight NUMERIC(8,3) NOT NULL DEFAULT 100,
  exact_match_weight NUMERIC(8,3) NOT NULL DEFAULT 40,
  prefix_match_weight NUMERIC(8,3) NOT NULL DEFAULT 25,
  verified_weight NUMERIC(8,3) NOT NULL DEFAULT 20,
  rating_weight NUMERIC(8,3) NOT NULL DEFAULT 4,
  review_count_weight NUMERIC(8,3) NOT NULL DEFAULT 2,
  fuzzy_match_weight NUMERIC(8,3) NOT NULL DEFAULT 35,
  distance_penalty_weight NUMERIC(8,3) NOT NULL DEFAULT 0.10,
  availability_weight NUMERIC(8,3) NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by_user_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_ranking_weights_non_negative CHECK (
    text_match_weight >= 0 AND exact_match_weight >= 0 AND prefix_match_weight >= 0
    AND verified_weight >= 0 AND rating_weight >= 0 AND review_count_weight >= 0
    AND fuzzy_match_weight >= 0 AND distance_penalty_weight >= 0 AND availability_weight >= 0
  )
);

INSERT INTO discovery_search_ranking_config(id)
VALUES ('default')
ON CONFLICT(id) DO NOTHING;
