-- Migration 069: Preserve Discovery listing creator role provenance.
-- The creator's current users.role may change after a listing is created. Moderation
-- policy must use the role at creation time for separation-of-duties decisions.
ALTER TABLE discovery_businesses
  ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(64);

UPDATE discovery_businesses b
   SET created_by_role = u.role
  FROM users u
 WHERE b.created_by_user_id = u.id
   AND b.created_by_role IS NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_business_creator_role
  ON discovery_businesses(created_by_role);
