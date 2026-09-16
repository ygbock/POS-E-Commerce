-- AbaCha Unified Commerce
-- Migration 017: Complete storefront tenant slug backfill and uniqueness hardening
--
-- Migration 011 is immutable because it has already been applied in production.
-- These corrective operations therefore live in a new forward-only migration.

-- Backfill the canonical default tenant first.
UPDATE organizations
SET slug = 'default'
WHERE id = 'org_default'
  AND (slug IS NULL OR slug = '');

-- Backfill existing organizations from their unique code where possible.
UPDATE organizations
SET slug = LOWER(REGEXP_REPLACE(code, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE (slug IS NULL OR slug = '')
  AND code IS NOT NULL
  AND code <> '';

-- Fall back to the organization id when no usable code exists.
UPDATE organizations
SET slug = LOWER(REGEXP_REPLACE(id, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Resolve any pre-existing collisions deterministically before enforcing uniqueness.
UPDATE organizations o
SET slug = o.slug || '-' || SUBSTRING(MD5(o.id) FROM 1 FOR 6)
WHERE o.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY slug
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM organizations
    WHERE slug IS NOT NULL
  ) duplicates
  WHERE rn > 1
);

-- The original migration used column-level UNIQUE constraints. These indexes
-- make the uniqueness contract explicit and remain safe if the indexes already exist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_slug
  ON organizations (slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_custom_domain
  ON organizations (custom_domain)
  WHERE custom_domain IS NOT NULL;
