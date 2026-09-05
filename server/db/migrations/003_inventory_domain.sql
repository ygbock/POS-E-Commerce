-- Omnicore Unified Commerce
-- Migration 003: Inventory Management Domain & Transactional Ledger
-- Establishes balance extensions (damaged, expired, in_transit), reservations,
-- stock transfers, stock counts, and expanded immutable movement types.

-- 1. Evolve inventory_balances table with damaged, expired, in_transit
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS damaged NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS expired NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS in_transit NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;

-- Drop and recreate generated available column to reflect on_hand - reserved - damaged - expired
ALTER TABLE inventory_balances DROP COLUMN IF EXISTS available;
ALTER TABLE inventory_balances ADD COLUMN available NUMERIC(14, 4) GENERATED ALWAYS AS (on_hand - reserved - damaged - expired) STORED;

-- Add index on (organization_id, location_id, variant_id) for rapid tenant-isolated lookups
CREATE INDEX IF NOT EXISTS idx_inventory_balances_org_loc_var ON inventory_balances(organization_id, location_id, variant_id);

-- 2. Evolve inventory_movements table
-- Drop existing movement_type check constraint and recreate with full domain types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'inventory_movements'::regclass
      AND conname = 'inventory_movements_movement_type_check'
  ) THEN
    ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_movement_type_check;
  END IF;
END $$;

ALTER TABLE inventory_movements ADD CONSTRAINT chk_inventory_movements_type CHECK (movement_type IN (
  'OPENING_BALANCE',
  'PURCHASE_RECEIVE',
  'POS_SALE',
  'ECOMMERCE_SALE',
  'WHOLESALE_SALE',
  'SALE_RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUSTMENT_DAMAGE',
  'ADJUSTMENT_EXPIRED',
  'ADJUSTMENT_STOCKTAKE',
  'ADJUSTMENT_CORRECTION',
  'DAMAGE_WRITE_OFF',
  'EXPIRY_WRITE_OFF',
  'INVENTORY_COUNT'
));

-- Add tracking and idempotency columns to inventory_movements
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS source_location_id VARCHAR(64) REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS destination_location_id VARCHAR(64) REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS source_system VARCHAR(64);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS source_reference VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_org ON inventory_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_idempotency ON inventory_movements(organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON inventory_movements(reference_type, reference_id);

-- 3. First-Class Inventory Reservations Table
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  reference_type VARCHAR(64) NOT NULL,
  reference_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED', 'FULFILLED', 'CANCELLED', 'EXPIRED')),
  notes TEXT,
  expires_at TIMESTAMPTZ,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_res_org_loc_var ON inventory_reservations(organization_id, location_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_ref ON inventory_reservations(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_status ON inventory_reservations(status);

-- 4. Multi-Location Stock Transfers
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  transfer_number VARCHAR(128) NOT NULL,
  source_location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  destination_location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL CHECK (status IN (
    'DRAFT',
    'REQUESTED',
    'APPROVED',
    'DISPATCHED',
    'IN_TRANSIT',
    'RECEIVED',
    'COMPLETED',
    'REJECTED',
    'CANCELLED',
    'VARIANCE'
  )),
  requested_by VARCHAR(255) NOT NULL,
  approved_by VARCHAR(255),
  dispatched_by VARCHAR(255),
  received_by VARCHAR(255),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_transfers_org_number UNIQUE (organization_id, transfer_number),
  CONSTRAINT chk_transfers_diff_locations CHECK (source_location_id != destination_location_id)
);

CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id VARCHAR(64) PRIMARY KEY,
  transfer_id VARCHAR(64) NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  requested_quantity NUMERIC(14, 4) NOT NULL CHECK (requested_quantity > 0),
  approved_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (approved_quantity >= 0),
  dispatched_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (dispatched_quantity >= 0),
  received_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (received_quantity >= 0),
  variance_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfers_org ON inventory_transfers(organization_id);
CREATE INDEX IF NOT EXISTS idx_transfers_source ON inventory_transfers(source_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_dest ON inventory_transfers(destination_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_variant ON inventory_transfer_items(variant_id);

-- 5. Stock Counts & Audit Adjustments
CREATE TABLE IF NOT EXISTS stock_counts (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  count_number VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN (
    'DRAFT',
    'IN_PROGRESS',
    'SUBMITTED',
    'APPROVED',
    'CANCELLED'
  )),
  created_by VARCHAR(255) NOT NULL,
  submitted_by VARCHAR(255),
  approved_by VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_stock_counts_org_number UNIQUE (organization_id, count_number)
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id VARCHAR(64) PRIMARY KEY,
  stock_count_id VARCHAR(64) NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  system_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  counted_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (counted_quantity >= 0),
  variance_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_org_loc ON stock_counts(organization_id, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_variant ON stock_count_items(variant_id);
