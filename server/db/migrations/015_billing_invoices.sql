-- AbaCha Unified Commerce
-- Migration 015: billing invoices, invoice history, and payment settlement records (TASK-5.6.4)

CREATE SEQUENCE IF NOT EXISTS billing_invoice_number_seq;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  subscription_id VARCHAR(64) REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'paid', 'past_due', 'void', 'uncollectible')),
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency VARCHAR(16) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  provider VARCHAR(64),
  provider_invoice_id VARCHAR(255),
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_billing_provider_invoice UNIQUE (provider, provider_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_org_created
  ON billing_invoices(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_status_due
  ON billing_invoices(status, due_at);

CREATE TABLE IF NOT EXISTS billing_invoice_status_history (
  id VARCHAR(64) PRIMARY KEY,
  invoice_id VARCHAR(64) NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  source VARCHAR(64) NOT NULL,
  provider_event_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_status_history_invoice
  ON billing_invoice_status_history(invoice_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_status_provider_event
  ON billing_invoice_status_history(invoice_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
