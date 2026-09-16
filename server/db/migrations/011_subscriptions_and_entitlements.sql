-- AbaCha Unified Commerce
-- Migration 011: SaaS Subscriptions, Plan Limits & Feature Entitlements
-- Establishes server-authoritative plans, organization subscriptions, feature gating, and quota enforcement.

CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_locations INTEGER NOT NULL DEFAULT 1,
  max_products INTEGER NOT NULL DEFAULT 500,
  max_monthly_orders INTEGER NOT NULL DEFAULT 1000,
  max_monthly_pos_transactions INTEGER NOT NULL DEFAULT 1000,
  max_storage_bytes BIGINT NOT NULL DEFAULT 1073741824,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  plan_id VARCHAR(64) NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_subscriptions_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Populate Standard Tier Plans
INSERT INTO plans (id, code, name, description, max_users, max_locations, max_products, max_monthly_orders, max_monthly_pos_transactions, max_storage_bytes, features)
VALUES
  ('plan_starter', 'starter', 'Starter Plan', 'Entry-level tier for single-location small businesses', 3, 1, 100, 200, 500, 1073741824, '{
    "pos": true,
    "inventory": true,
    "ecommerce": false,
    "storefront": false,
    "advanced_reports": false,
    "multi_location": false,
    "staff_management": true,
    "audit_logs": false,
    "api_access": false,
    "export": false,
    "advanced_analytics": false
  }'::jsonb),
  ('plan_professional', 'professional', 'Professional Plan', 'Full feature tier for growing multi-location retailers', 25, 5, 5000, 5000, 10000, 10737418240, '{
    "pos": true,
    "inventory": true,
    "ecommerce": true,
    "storefront": true,
    "advanced_reports": true,
    "multi_location": true,
    "staff_management": true,
    "audit_logs": true,
    "api_access": false,
    "export": true,
    "advanced_analytics": false
  }'::jsonb),
  ('plan_enterprise', 'enterprise', 'Enterprise Plan', 'Unrestricted tier for high-volume enterprise operations', 1000, 100, 100000, 100000, 500000, 107374182400, '{
    "pos": true,
    "inventory": true,
    "ecommerce": true,
    "storefront": true,
    "advanced_reports": true,
    "multi_location": true,
    "staff_management": true,
    "audit_logs": true,
    "api_access": true,
    "export": true,
    "advanced_analytics": true
  }'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  features = EXCLUDED.features,
  max_users = EXCLUDED.max_users,
  max_locations = EXCLUDED.max_locations,
  max_products = EXCLUDED.max_products,
  max_monthly_orders = EXCLUDED.max_monthly_orders,
  max_monthly_pos_transactions = EXCLUDED.max_monthly_pos_transactions,
  max_storage_bytes = EXCLUDED.max_storage_bytes;

-- Ensure default tenant org_default has an active enterprise subscription
INSERT INTO subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end)
SELECT 'sub_org_default', 'org_default', 'plan_enterprise', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 years'
WHERE EXISTS (SELECT 1 FROM organizations WHERE id = 'org_default')
ON CONFLICT (organization_id) DO NOTHING;
