-- AbaCha Unified Commerce
-- Migration 056: Authoritative platform and business-owner database roles.
-- Forward-only: extend the users role constraint to match server RBAC.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN (
    'super_admin',
    'admin',
    'manager',
    'cashier',
    'inventory_manager',
    'purchasing_manager',
    'sales_user',
    'viewer',
    'system_owner',
    'platform_admin',
    'platform_support',
    'platform_finance',
    'business_owner'
  ));
