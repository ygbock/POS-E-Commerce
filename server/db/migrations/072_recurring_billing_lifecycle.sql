-- Migration 016: recurring billing lifecycle idempotency.
-- One recurring invoice per subscription and renewal period; manual invoices remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_invoice_period
  ON billing_invoices (subscription_id, ((metadata->>'renewal_period_start')))
  WHERE subscription_id IS NOT NULL AND metadata->>'billing_cycle' = 'recurring';

CREATE INDEX IF NOT EXISTS idx_subscriptions_due_billing_cycle
  ON organization_subscriptions (current_period_end, status)
  WHERE status IN ('active', 'trialing', 'past_due');
