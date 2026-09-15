-- AbaCha Unified Commerce
-- Migration 012: Platform Plans & Super Admin Subscription Management
-- Enhances plans with pricing, billing intervals, versioning, payment status, and subscription audit history.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_monthly NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_yearly NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(32) NOT NULL DEFAULT 'monthly';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) NOT NULL DEFAULT 'paid';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS subscription_history (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL,
  subscription_id VARCHAR(64),
  previous_plan_id VARCHAR(64),
  new_plan_id VARCHAR(64),
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  action VARCHAR(64) NOT NULL,
  reason TEXT,
  performed_by VARCHAR(64) NOT NULL,
  performed_by_role VARCHAR(64) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_history_org ON subscription_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_sub_history_created ON subscription_history(created_at);

-- Update default pricing for existing standard tier plans
UPDATE plans SET price_monthly = 29.00, price_yearly = 290.00 WHERE code = 'starter';
UPDATE plans SET price_monthly = 99.00, price_yearly = 990.00 WHERE code = 'professional';
UPDATE plans SET price_monthly = 299.00, price_yearly = 2990.00 WHERE code = 'enterprise';
