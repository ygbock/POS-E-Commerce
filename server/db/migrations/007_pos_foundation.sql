-- AbaCha Unified Commerce
-- Migration 007: POS Foundation Schema

CREATE TABLE IF NOT EXISTS pos_sessions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  terminal_id VARCHAR(64) NOT NULL,
  cashier_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUSPENDED', 'CLOSING', 'CLOSED')),
  opening_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  expected_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  counted_cash NUMERIC(15, 2),
  variance NUMERIC(15, 2),
  closing_actor VARCHAR(255),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_cash_movements (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL CHECK (type IN ('Cash In', 'Cash Out')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_session_id VARCHAR(64) REFERENCES pos_sessions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS pos_returns (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  refund_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (refund_amount >= 0),
  refund_method VARCHAR(64) NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_return_items (
  id VARCHAR(64) PRIMARY KEY,
  return_id VARCHAR(64) NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  refund_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (refund_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_org ON pos_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_loc ON pos_sessions(location_id);
CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_session ON pos_cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_pos_session ON orders(pos_session_id);
CREATE INDEX IF NOT EXISTS idx_pos_returns_order ON pos_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_return_items_return ON pos_return_items(return_id);
