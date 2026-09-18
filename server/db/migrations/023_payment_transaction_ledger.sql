-- AbaCha Unified Commerce
-- Migration 023: Immutable Payment Transaction Ledger
--
-- Forward-only migration. Do not modify previously applied migrations.

CREATE TABLE IF NOT EXISTS payment_transactions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  payment_id VARCHAR(64) NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE RESTRICT,
  transaction_type VARCHAR(32) NOT NULL CHECK (transaction_type IN ('CHARGE', 'REFUND', 'VOID')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(16) NOT NULL DEFAULT 'SLE',
  status VARCHAR(32) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'FAILED', 'VOIDED')),
  payment_method VARCHAR(64),
  reference VARCHAR(255),
  provider VARCHAR(128),
  idempotency_key VARCHAR(128),
  source_type VARCHAR(64),
  source_id VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_payment_transactions_idempotency
    UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_refund_source
  ON payment_transactions (organization_id, transaction_type, source_type, source_id)
  WHERE transaction_type = 'REFUND'
    AND source_type IS NOT NULL
    AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment
  ON payment_transactions (organization_id, payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order
  ON payment_transactions (organization_id, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_type_status
  ON payment_transactions (organization_id, transaction_type, status, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_payment_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PAYMENT_TRANSACTION_IMMUTABLE: payment transaction ledger rows cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_transactions_immutable ON payment_transactions;

CREATE TRIGGER trg_payment_transactions_immutable
BEFORE UPDATE OR DELETE ON payment_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_payment_transaction_mutation();

-- Backfill captured charges for existing completed/refunded payments.
-- Existing refunded payments retain their original charge in the ledger;
-- refund rows are created by the application from this point forward.
INSERT INTO payment_transactions (
  id, organization_id, payment_id, order_id, transaction_type, amount,
  currency, status, payment_method, reference, provider,
  source_type, source_id, metadata, performed_by
)
SELECT
  'pt_charge_' || p.id,
  p.organization_id,
  p.id,
  p.order_id,
  'CHARGE',
  p.amount,
  p.currency,
  'POSTED',
  p.payment_method,
  p.reference,
  p.provider,
  'payment_backfill',
  p.id,
  COALESCE(p.transaction_payload, '{}'::jsonb),
  'migration:023'
FROM payments p
WHERE p.status IN ('Completed', 'Refunded')
  AND p.amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM payment_transactions pt
    WHERE pt.payment_id = p.id
      AND pt.transaction_type = 'CHARGE'
  );
