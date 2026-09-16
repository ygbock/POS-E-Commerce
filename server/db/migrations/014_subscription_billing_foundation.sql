-- AbaCha Unified Commerce
-- Migration 014: SaaS subscription & billing foundation (TASK-5.6.1)

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
  currency VARCHAR(16) NOT NULL DEFAULT 'SLE',
  billing_interval VARCHAR(16) NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'yearly')),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  plan_id VARCHAR(64) NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  provider VARCHAR(64),
  provider_customer_id VARCHAR(255),
  provider_subscription_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_org_subscription
  ON organization_subscriptions(organization_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'paused');

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status_period
  ON organization_subscriptions(status, current_period_end);

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_provider_subscription
  ON organization_subscriptions(provider, provider_subscription_id);

CREATE TABLE IF NOT EXISTS billing_events (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
  provider VARCHAR(64) NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_billing_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org_created
  ON billing_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_usage_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric VARCHAR(64) NOT NULL,
  usage_value NUMERIC(20, 4) NOT NULL DEFAULT 0 CHECK (usage_value >= 0),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_subscription_usage_snapshot UNIQUE (organization_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_org
  ON subscription_usage_snapshots(organization_id, metric);

INSERT INTO subscription_plans
  (id, code, name, description, amount, currency, billing_interval, trial_days, limits, features, display_order)
VALUES
  ('plan_starter', 'starter', 'Starter', 'Core commerce operations for small businesses.', 0.00, 'SLE', 'monthly', 14,
   '{"users": 5, "locations": 1, "products": 500, "monthly_orders": 1000}'::jsonb,
   '{"pos": true, "inventory": true, "storefront": true, "reports_basic": true}'::jsonb, 1),
  ('plan_professional', 'professional', 'Professional', 'Expanded operations for growing businesses.', 250.00, 'SLE', 'monthly', 14,
   '{"users": 25, "locations": 5, "products": 5000, "monthly_orders": 10000}'::jsonb,
   '{"pos": true, "inventory": true, "storefront": true, "reports_basic": true, "reports_advanced": true, "multi_location": true}'::jsonb, 2),
  ('plan_enterprise', 'enterprise', 'Enterprise', 'Advanced controls and scale for larger organizations.', 750.00, 'SLE', 'monthly', 30,
   '{"users": 100, "locations": 25, "products": 50000, "monthly_orders": 100000}'::jsonb,
   '{"pos": true, "inventory": true, "storefront": true, "reports_basic": true, "reports_advanced": true, "multi_location": true, "priority_support": true, "api_access": true}'::jsonb, 3)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  amount = EXCLUDED.amount,
  currency = EXCLUDED.currency,
  billing_interval = EXCLUDED.billing_interval,
  trial_days = EXCLUDED.trial_days,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  display_order = EXCLUDED.display_order,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO organization_subscriptions (
  id, organization_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, metadata
)
SELECT
  'sub_' || md5(o.id || ':initial'),
  o.id,
  COALESCE((SELECT sp.id FROM subscription_plans sp WHERE sp.code = lower(o.plan_tier) LIMIT 1), 'plan_starter'),
  'trialing',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '14 days',
  CURRENT_TIMESTAMP + INTERVAL '14 days',
  jsonb_build_object('source', 'migration_014', 'legacyPlanTier', o.plan_tier)
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM organization_subscriptions os WHERE os.organization_id = o.id
);
