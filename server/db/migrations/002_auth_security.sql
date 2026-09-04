-- Omnicore Unified Commerce
-- Migration 002: Authentication, Authorization & Security Boundaries
-- Supports users, RBAC roles, permissions, token revocation, and tenant isolation

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  role VARCHAR(64) NOT NULL CHECK (role IN (
    'super_admin',
    'admin',
    'manager',
    'cashier',
    'inventory_manager',
    'purchasing_manager',
    'sales_user',
    'viewer'
  )),
  location_id VARCHAR(64) REFERENCES locations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_org_email UNIQUE (organization_id, email)
);

-- 2. Role Permissions Table
CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(64) NOT NULL,
  permission VARCHAR(64) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission)
);

-- 3. Revoked Tokens Table (For token blacklisting / explicit logout)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_jti VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes for Query Performance & Access Control
CREATE INDEX IF NOT EXISTS idx_users_org_email ON users(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(expires_at);

-- Populate Authoritative Role Permissions
INSERT INTO role_permissions (role, permission, description) VALUES
  -- super_admin (Wildcard / All privileges)
  ('super_admin', 'products.view', 'View products'),
  ('super_admin', 'products.create', 'Create new products'),
  ('super_admin', 'products.update', 'Update product details'),
  ('super_admin', 'products.delete', 'Delete products'),
  ('super_admin', 'inventory.view', 'View inventory balances and movements'),
  ('super_admin', 'inventory.adjust', 'Perform inventory adjustments'),
  ('super_admin', 'inventory.transfer', 'Transfer inventory across locations'),
  ('super_admin', 'inventory.receive', 'Receive inventory shipments'),
  ('super_admin', 'orders.view', 'View customer orders'),
  ('super_admin', 'orders.create', 'Create and tender orders'),
  ('super_admin', 'orders.cancel', 'Cancel orders'),
  ('super_admin', 'orders.refund', 'Process order refunds'),
  ('super_admin', 'purchases.view', 'View purchase orders'),
  ('super_admin', 'purchases.create', 'Create purchase orders'),
  ('super_admin', 'purchases.approve', 'Approve purchase orders'),
  ('super_admin', 'customers.view', 'View customer records'),
  ('super_admin', 'customers.create', 'Create customer records'),
  ('super_admin', 'customers.update', 'Update customer records'),
  ('super_admin', 'reports.view', 'View financial and operational reports'),
  ('super_admin', 'users.view', 'View user accounts'),
  ('super_admin', 'users.create', 'Create user accounts'),
  ('super_admin', 'users.update', 'Update user accounts'),
  ('super_admin', 'users.delete', 'Delete user accounts'),
  ('super_admin', 'settings.view', 'View system settings'),
  ('super_admin', 'settings.update', 'Modify system settings'),
  ('super_admin', 'audit.view', 'View security and compliance audit logs'),
  ('super_admin', 'admin.diagnostics', 'Access database and system diagnostic status'),

  -- admin
  ('admin', 'products.view', 'View products'),
  ('admin', 'products.create', 'Create new products'),
  ('admin', 'products.update', 'Update product details'),
  ('admin', 'products.delete', 'Delete products'),
  ('admin', 'inventory.view', 'View inventory balances and movements'),
  ('admin', 'inventory.adjust', 'Perform inventory adjustments'),
  ('admin', 'inventory.transfer', 'Transfer inventory across locations'),
  ('admin', 'inventory.receive', 'Receive inventory shipments'),
  ('admin', 'orders.view', 'View customer orders'),
  ('admin', 'orders.create', 'Create and tender orders'),
  ('admin', 'orders.cancel', 'Cancel orders'),
  ('admin', 'orders.refund', 'Process order refunds'),
  ('admin', 'purchases.view', 'View purchase orders'),
  ('admin', 'purchases.create', 'Create purchase orders'),
  ('admin', 'purchases.approve', 'Approve purchase orders'),
  ('admin', 'customers.view', 'View customer records'),
  ('admin', 'customers.create', 'Create customer records'),
  ('admin', 'customers.update', 'Update customer records'),
  ('admin', 'reports.view', 'View financial and operational reports'),
  ('admin', 'users.view', 'View user accounts'),
  ('admin', 'users.create', 'Create user accounts'),
  ('admin', 'users.update', 'Update user accounts'),
  ('admin', 'users.delete', 'Delete user accounts'),
  ('admin', 'settings.view', 'View system settings'),
  ('admin', 'settings.update', 'Modify system settings'),
  ('admin', 'audit.view', 'View security and compliance audit logs'),
  ('admin', 'admin.diagnostics', 'Access database and system diagnostic status'),

  -- manager
  ('manager', 'products.view', 'View products'),
  ('manager', 'products.create', 'Create new products'),
  ('manager', 'products.update', 'Update product details'),
  ('manager', 'inventory.view', 'View inventory balances and movements'),
  ('manager', 'inventory.adjust', 'Perform inventory adjustments'),
  ('manager', 'inventory.transfer', 'Transfer inventory across locations'),
  ('manager', 'inventory.receive', 'Receive inventory shipments'),
  ('manager', 'orders.view', 'View customer orders'),
  ('manager', 'orders.create', 'Create and tender orders'),
  ('manager', 'orders.cancel', 'Cancel orders'),
  ('manager', 'orders.refund', 'Process order refunds'),
  ('manager', 'purchases.view', 'View purchase orders'),
  ('manager', 'purchases.create', 'Create purchase orders'),
  ('manager', 'purchases.approve', 'Approve purchase orders'),
  ('manager', 'customers.view', 'View customer records'),
  ('manager', 'customers.create', 'Create customer records'),
  ('manager', 'customers.update', 'Update customer records'),
  ('manager', 'reports.view', 'View financial and operational reports'),
  ('manager', 'audit.view', 'View security and compliance audit logs'),

  -- inventory_manager
  ('inventory_manager', 'products.view', 'View products'),
  ('inventory_manager', 'products.create', 'Create new products'),
  ('inventory_manager', 'products.update', 'Update product details'),
  ('inventory_manager', 'inventory.view', 'View inventory balances and movements'),
  ('inventory_manager', 'inventory.adjust', 'Perform inventory adjustments'),
  ('inventory_manager', 'inventory.transfer', 'Transfer inventory across locations'),
  ('inventory_manager', 'inventory.receive', 'Receive inventory shipments'),
  ('inventory_manager', 'purchases.view', 'View purchase orders'),
  ('inventory_manager', 'purchases.create', 'Create purchase orders'),
  ('inventory_manager', 'reports.view', 'View reports'),

  -- purchasing_manager
  ('purchasing_manager', 'products.view', 'View products'),
  ('purchasing_manager', 'inventory.view', 'View inventory balances and movements'),
  ('purchasing_manager', 'inventory.receive', 'Receive inventory shipments'),
  ('purchasing_manager', 'purchases.view', 'View purchase orders'),
  ('purchasing_manager', 'purchases.create', 'Create purchase orders'),
  ('purchasing_manager', 'purchases.approve', 'Approve purchase orders'),

  -- cashier
  ('cashier', 'products.view', 'View products for sale'),
  ('cashier', 'orders.view', 'View orders'),
  ('cashier', 'orders.create', 'Tender orders and process POS checkout'),
  ('cashier', 'customers.view', 'Look up customers'),
  ('cashier', 'customers.create', 'Create retail customers'),

  -- sales_user
  ('sales_user', 'products.view', 'View products'),
  ('sales_user', 'orders.view', 'View sales orders'),
  ('sales_user', 'orders.create', 'Create sales orders'),
  ('sales_user', 'customers.view', 'View customer records'),
  ('sales_user', 'customers.create', 'Create customer records'),
  ('sales_user', 'customers.update', 'Update customer records'),

  -- viewer
  ('viewer', 'products.view', 'View products read-only'),
  ('viewer', 'inventory.view', 'View inventory read-only'),
  ('viewer', 'orders.view', 'View orders read-only'),
  ('viewer', 'reports.view', 'View reports read-only')
ON CONFLICT (role, permission) DO NOTHING;
