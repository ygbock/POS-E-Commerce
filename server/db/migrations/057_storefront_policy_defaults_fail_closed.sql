-- AbaCha Unified Commerce
-- Migration 057: storefront policy defaults must fail closed
--
-- Migration 011/017 established legacy commercial policy defaults. Those
-- migrations are immutable because they may already be applied in production.
-- New organizations must not silently inherit platform-wide shipping prices or
-- fulfillment promises. Keep the column NOT NULL for schema compatibility,
-- but require explicit tenant policy configuration at the storefront boundary.

ALTER TABLE organizations
  ALTER COLUMN policies SET DEFAULT '{}'::jsonb;
