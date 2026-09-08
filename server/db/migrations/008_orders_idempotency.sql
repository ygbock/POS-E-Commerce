-- AbaCha Unified Commerce
-- Migration 008: Orders Idempotency Support

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128) UNIQUE;
