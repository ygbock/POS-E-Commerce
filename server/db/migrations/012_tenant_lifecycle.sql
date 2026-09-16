-- AbaCha Unified Commerce
-- Migration 012: Tenant lifecycle controls
-- Adds a server-authoritative tenant slug and plan tier for platform lifecycle management.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug VARCHAR(128);

UPDATE organizations
SET slug = lower(trim(both '-' from regexp_replace(code, '[^a-zA-Z0-9]+', '-', 'g')))
WHERE slug IS NULL OR slug = '';

UPDATE organizations
SET slug = 'tenant-' || left(md5(id), 12)
WHERE slug IS NULL OR slug = '';

ALTER TABLE organizations
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_slug
  ON organizations(slug);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(32) NOT NULL DEFAULT 'starter';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('starter', 'professional', 'enterprise'));

CREATE INDEX IF NOT EXISTS idx_organizations_active_created
  ON organizations(is_active, created_at DESC);
