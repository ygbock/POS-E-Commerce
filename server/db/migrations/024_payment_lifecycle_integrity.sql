-- AbaCha Unified Commerce
-- Migration 024: Payment lifecycle integrity
--
-- Forward-only migration. Do not modify previously applied migrations.

-- Captured and failed charge attempts are queried frequently during
-- reconciliation. The service layer serializes payment confirmation by
-- locking the payment row, so this index is intentionally non-unique:
-- historical data may contain more than one captured charge from earlier
-- application versions and the immutable ledger must never be rewritten.
CREATE INDEX IF NOT EXISTS idx_payment_transactions_posted_charges
  ON payment_transactions (organization_id, payment_id, created_at DESC)
  WHERE transaction_type = 'CHARGE' AND status = 'POSTED';

CREATE INDEX IF NOT EXISTS idx_payment_transactions_failed_attempts
  ON payment_transactions (organization_id, payment_id, created_at DESC)
  WHERE transaction_type = 'CHARGE' AND status = 'FAILED';
