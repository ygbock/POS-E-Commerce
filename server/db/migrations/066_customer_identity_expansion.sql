-- AbaCha Unified Commerce
-- Migration 066: Customer identity expansion.
-- Adds optional phone column to the users table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(64);

COMMENT ON COLUMN users.phone IS 'Optional contact phone number for the user identity.';
