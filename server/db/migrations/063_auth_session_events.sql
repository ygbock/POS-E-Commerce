-- AbaCha Unified Commerce
-- Migration 063: Authentication session lifecycle events.

CREATE TABLE IF NOT EXISTS auth_session_events (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(128),
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_auth_session_events_user_time
  ON auth_session_events(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_session_events_session_time
  ON auth_session_events(session_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_session_events_type_time
  ON auth_session_events(event_type, occurred_at DESC);
