-- AbaCha Unified Commerce
-- Migration 024: Payment lifecycle integrity
--
-- Forward-only migration. Do not modify previously applied migrations.

-- A payment may have many failed charge attempts, but only one captured charge.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_posted_charge
  ON payment_transactions (organization_id, payment_id)
  WHERE transaction_type = 'CHARGE' AND status = 'POSTED';

-- Fast lookup for failed payment attempts during reconciliation.
CREATE INDEX IF NOT EXISTS idx_payment_transactions_failed_attempts
  ON payment_transactions (organization_id, payment_id, created_at DESC)
  WHERE transaction_type = 'CHARGE' AND status = 'FAILED';
