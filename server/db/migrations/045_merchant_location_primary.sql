-- TASK-MERCHANT-2: authoritative primary commerce location per tenant.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing tenants keep deterministic primary locations without creating duplicates.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY is_active DESC, created_at ASC, id ASC) AS rn
    FROM locations
)
UPDATE locations l
   SET is_primary = TRUE
  FROM ranked r
 WHERE l.id = r.id
   AND r.rn = 1
   AND NOT EXISTS (
     SELECT 1 FROM locations x
      WHERE x.organization_id = l.organization_id
        AND x.is_primary = TRUE
   );

CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_org_primary
  ON locations(organization_id)
  WHERE is_primary = TRUE;
