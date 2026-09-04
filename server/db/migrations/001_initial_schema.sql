-- Omnicore Unified Commerce
-- Migration 001: Initial Relational Schema
-- Supports multi-tenancy foundation, catalog, inventory, orders, payments, purchasing, and audit

-- Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. Organizations (Multi-Tenancy Foundation)
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Locations / Branches / Warehouses
CREATE TABLE IF NOT EXISTS locations (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL CHECK (type IN ('Warehouse', 'Retail Store', 'Distribution Center')),
  address TEXT,
  phone VARCHAR(64),
  manager_name VARCHAR(255),
  is_pos_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_locations_org_code UNIQUE (organization_id, code)
);

-- 3. Categories
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  icon_name VARCHAR(64),
  accent_color VARCHAR(64),
  subcategories JSONB NOT NULL DEFAULT '[]'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_pos_quick_access BOOLEAN NOT NULL DEFAULT FALSE,
  parent_id VARCHAR(64) REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_categories_org_slug UNIQUE (organization_id, slug)
);

-- 4. Brands
CREATE TABLE IF NOT EXISTS brands (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  logo_url TEXT,
  country_of_origin VARCHAR(128),
  website TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_brands_org_slug UNIQUE (organization_id, slug)
);

-- 5. Units of Measurement
CREATE TABLE IF NOT EXISTS units_of_measure (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL CHECK (category IN ('Count', 'Weight', 'Volume', 'Length', 'Packaging')),
  allow_fractional BOOLEAN NOT NULL DEFAULT FALSE,
  base_unit_code VARCHAR(32),
  conversion_factor NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_uom_org_code UNIQUE (organization_id, code)
);

-- 6. Catalog Attributes
CREATE TABLE IF NOT EXISTS catalog_attributes (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('select', 'text', 'number', 'boolean')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_attr_org_code UNIQUE (organization_id, code)
);

-- 7. Products
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  category_id VARCHAR(64) REFERENCES categories(id) ON DELETE SET NULL,
  brand_id VARCHAR(64) REFERENCES brands(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  short_description TEXT,
  unit_code VARCHAR(32) NOT NULL,
  product_type VARCHAR(32) NOT NULL DEFAULT 'standard' CHECK (product_type IN ('standard', 'variant', 'bundle', 'composite')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  channels_pos BOOLEAN NOT NULL DEFAULT TRUE,
  channels_ecommerce BOOLEAN NOT NULL DEFAULT TRUE,
  channels_wholesale BOOLEAN NOT NULL DEFAULT FALSE,
  is_bundle BOOLEAN NOT NULL DEFAULT FALSE,
  bundle_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_composite BOOLEAN NOT NULL DEFAULT FALSE,
  bom_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  assembly_labor_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  is_track_serial BOOLEAN NOT NULL DEFAULT FALSE,
  is_track_batch BOOLEAN NOT NULL DEFAULT FALSE,
  tax_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
  rating NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  review_count INTEGER NOT NULL DEFAULT 0,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  compare_at_price NUMERIC(15, 2),
  sales_count INTEGER NOT NULL DEFAULT 0,
  specifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_products_org_slug UNIQUE (organization_id, slug)
);

-- 8. Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(128) NOT NULL,
  barcode VARCHAR(128) NOT NULL,
  qr_code TEXT,
  name VARCHAR(255) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
  retail_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (retail_price >= 0),
  wholesale_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (wholesale_price >= 0),
  member_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (member_price >= 0),
  min_selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (min_selling_price >= 0),
  weight_kg NUMERIC(10, 3),
  dimensions JSONB,
  low_stock_threshold NUMERIC(14, 4) NOT NULL DEFAULT 10.0000,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_variants_org_sku UNIQUE (organization_id, sku),
  CONSTRAINT uq_variants_org_barcode UNIQUE (organization_id, barcode)
);

-- 9. Customers
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(64),
  tier VARCHAR(32) NOT NULL DEFAULT 'Bronze' CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'VIP')),
  loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  store_credit_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  credit_limit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  customer_group VARCHAR(64) NOT NULL DEFAULT 'Retail' CHECK (customer_group IN ('Retail', 'Wholesale', 'Corporate', 'VIP Member')),
  notes TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id VARCHAR(64) PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(64) NOT NULL DEFAULT 'Home',
  street TEXT NOT NULL,
  city VARCHAR(128) NOT NULL,
  state VARCHAR(128),
  zip VARCHAR(32),
  country VARCHAR(128) NOT NULL DEFAULT 'Sierra Leone',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Inventory Balances (Per Location + Variant)
CREATE TABLE IF NOT EXISTS inventory_balances (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  on_hand NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  reserved NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  available NUMERIC(14, 4) GENERATED ALWAYS AS (on_hand - reserved) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_inventory_balance_loc_variant UNIQUE (location_id, variant_id)
);

-- 12. Inventory Movements (Immutable Movement Ledger)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  movement_type VARCHAR(64) NOT NULL CHECK (movement_type IN (
    'PURCHASE_RECEIVE',
    'POS_SALE',
    'ECOMMERCE_SALE',
    'SALE_RETURN',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'ADJUSTMENT_DAMAGE',
    'ADJUSTMENT_EXPIRED',
    'ADJUSTMENT_STOCKTAKE',
    'ADJUSTMENT_CORRECTION',
    'DAMAGE_WRITE_OFF',
    'INVENTORY_COUNT'
  )),
  quantity_change NUMERIC(14, 4) NOT NULL,
  previous_balance NUMERIC(14, 4) NOT NULL,
  new_balance NUMERIC(14, 4) NOT NULL,
  unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  reference_type VARCHAR(64),
  reference_id VARCHAR(128),
  reason TEXT,
  performed_by VARCHAR(255) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Orders
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
  order_number VARCHAR(128) NOT NULL,
  source VARCHAR(32) NOT NULL CHECK (source IN ('POS', 'ECOMMERCE', 'PHONE', 'WHOLESALE')),
  channel VARCHAR(128) NOT NULL,
  fulfillment_method VARCHAR(64) NOT NULL CHECK (fulfillment_method IN (
    'In-Store Pickup',
    'Standard Delivery',
    'Express Delivery',
    'POS Walk-in'
  )),
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  discount_code VARCHAR(64),
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  shipping_fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_cost_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  payment_status VARCHAR(32) NOT NULL DEFAULT 'Pending' CHECK (payment_status IN (
    'Pending',
    'Partial',
    'Paid',
    'Partially Refunded',
    'Refunded',
    'Failed'
  )),
  status VARCHAR(32) NOT NULL DEFAULT 'Pending' CHECK (status IN (
    'Pending',
    'Stock Reserved',
    'Payment Confirmed',
    'Picking',
    'Packed',
    'Dispatched',
    'Delivered',
    'Completed',
    'Cancelled',
    'Refunded'
  )),
  cashier_name VARCHAR(255),
  tracking_number VARCHAR(128),
  carrier_name VARCHAR(128),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_orders_org_number UNIQUE (organization_id, order_number)
);

-- 14. Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name VARCHAR(255) NOT NULL,
  variant_name VARCHAR(255) NOT NULL,
  sku VARCHAR(128) NOT NULL,
  unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
  discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  tax_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. Payments
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
  payment_method VARCHAR(64) NOT NULL CHECK (payment_method IN (
    'Cash',
    'Credit Card',
    'Mobile Money',
    'Store Credit',
    'Bank Transfer',
    'Fintech Wallet'
  )),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(16) NOT NULL DEFAULT 'SLE',
  status VARCHAR(32) NOT NULL DEFAULT 'Completed' CHECK (status IN (
    'Pending',
    'Completed',
    'Failed',
    'Refunded',
    'Voided'
  )),
  reference VARCHAR(255),
  provider VARCHAR(128),
  transaction_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(64),
  address TEXT,
  payment_terms VARCHAR(64) NOT NULL DEFAULT 'Net 30',
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 17. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  supplier_id VARCHAR(64) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  destination_location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  po_number VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Draft' CHECK (status IN (
    'Draft',
    'Sent',
    'Approved',
    'Partially Received',
    'Received',
    'Cancelled'
  )),
  payment_status VARCHAR(32) NOT NULL DEFAULT 'Unpaid' CHECK (payment_status IN (
    'Unpaid',
    'Partial',
    'Paid'
  )),
  order_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_date TIMESTAMPTZ,
  received_date TIMESTAMPTZ,
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  shipping_fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_po_org_number UNIQUE (organization_id, po_number)
);

-- 18. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id VARCHAR(64) PRIMARY KEY,
  purchase_order_id VARCHAR(64) NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id VARCHAR(64) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  sku VARCHAR(128) NOT NULL,
  ordered_qty NUMERIC(14, 4) NOT NULL CHECK (ordered_qty > 0),
  received_qty NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (received_qty >= 0),
  unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  batch_number VARCHAR(128),
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 19. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id VARCHAR(64),
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  location_id VARCHAR(64) REFERENCES locations(id) ON DELETE SET NULL,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  severity VARCHAR(32) NOT NULL DEFAULT 'Info' CHECK (severity IN (
    'Info',
    'Low',
    'Medium',
    'High',
    'Critical'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Query Performance & Relational Integrity
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_variant ON inventory_balances(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_location ON inventory_balances(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_loc ON inventory_movements(variant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(location_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
