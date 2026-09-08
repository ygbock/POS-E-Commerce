-- AbaCha Unified Commerce
-- Migration 010: POS States Simplification

-- Drop the old constraint allowing SUSPENDED/CLOSING
ALTER TABLE pos_sessions DROP CONSTRAINT IF EXISTS pos_sessions_status_check;

-- Add the new constraint allowing only OPEN and CLOSED
ALTER TABLE pos_sessions ADD CONSTRAINT pos_sessions_status_check CHECK (status IN ('OPEN', 'CLOSED'));
