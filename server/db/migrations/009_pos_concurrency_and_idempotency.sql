-- AbaCha Unified Commerce
-- Migration 009: POS Concurrency and Idempotency Hardening

-- 1. Create a unique partial index to enforce that only one OPEN session can exist per organization, location, and terminal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_pos_session
ON pos_sessions (organization_id, location_id, terminal_id)
WHERE (status = 'OPEN');

-- 2. Drop the global unique constraint on orders.idempotency_key to allow multi-tenant isolation.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;

-- 3. Create a tenant-scoped unique index for orders idempotency keys.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_org_idempotency
ON orders (organization_id, idempotency_key)
WHERE (idempotency_key IS NOT NULL);

-- 4. Add idempotency_key column to pos_returns table.
ALTER TABLE pos_returns ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- 5. Create a tenant-scoped unique index for pos_returns idempotency keys.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_returns_org_idempotency
ON pos_returns (organization_id, idempotency_key)
WHERE (idempotency_key IS NOT NULL);
