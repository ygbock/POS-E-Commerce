-- AbaCha Unified Commerce
-- Migration 025: Reporting query indexes
-- Forward-only migration. Do not modify previously applied migrations.

CREATE INDEX IF NOT EXISTS idx_orders_org_created_at
  ON orders(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_org_status_created_at
  ON orders(organization_id, payment_status, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_payments_org_created_at
  ON payments(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_org_order_status
  ON payments(organization_id, order_id, status);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_org
  ON inventory_balances(organization_id);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_org_closed_at
  ON pos_sessions(organization_id, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_session_created
  ON pos_cash_movements(session_id, created_at DESC);
