-- AbaCha Unified Commerce
-- Migration 018: Canonical Default Storefront Tenant Bootstrap
--
-- Production must not depend on demo seeds for the public default storefront.
-- This migration creates/repairs the canonical org_default tenant and its
-- storefront identity using production-safe, idempotent operations.

INSERT INTO organizations (id, name, code, is_active)
VALUES ('org_default', 'AbaCha Global Retail Ltd', 'ABACHA_DEFAULT', TRUE)
ON CONFLICT (id) DO UPDATE
SET is_active = TRUE;

-- Migration 012 derives a slug from the organization code. The public
-- canonical storefront contract is instead the stable slug "default".
UPDATE organizations
SET slug = 'default'
WHERE id = 'org_default';

-- Ensure storefront defaults exist even when the tenant predates migration 017.
UPDATE organizations
SET
  currency_code = COALESCE(currency_code, 'USD'),
  currency_symbol = COALESCE(currency_symbol, '$'),
  locale = COALESCE(locale, 'en-US'),
  timezone = COALESCE(timezone, 'UTC')
WHERE id = 'org_default';

-- Keep the canonical tenant available through the platform storefront.
UPDATE organizations
SET custom_domain = NULL
WHERE id = 'org_default'
  AND custom_domain = 'abacha-app.onrender.com';
