/**
 * Role and Permission Model (SEC-001)
 * 
 * Centralized server-authoritative role definitions and permission matrices.
 * The client browser is never the authority on user roles or permissions.
 */

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'inventory_manager'
  | 'purchasing_manager'
  | 'sales_user'
  | 'viewer';

export const VALID_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'manager',
  'cashier',
  'inventory_manager',
  'purchasing_manager',
  'sales_user',
  'viewer',
];

export const ROLES = {
  SUPER_ADMIN: 'super_admin' as UserRole,
  ADMIN: 'admin' as UserRole,
  STORE_MANAGER: 'manager' as UserRole,
  CASHIER: 'cashier' as UserRole,
  INVENTORY_MANAGER: 'inventory_manager' as UserRole,
  PURCHASING_MANAGER: 'purchasing_manager' as UserRole,
  SALES_USER: 'sales_user' as UserRole,
  VIEWER: 'viewer' as UserRole,
} as const;

/**
 * Standard Granular System Permissions
 */
export const PERMISSIONS = {
  // Products & Catalog
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',

  // Inventory Management
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_TRANSFER: 'inventory.transfer',
  INVENTORY_RECEIVE: 'inventory.receive',

  // Orders & POS Checkout
  ORDERS_VIEW: 'orders.view',
  ORDERS_CREATE: 'orders.create',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_REFUND: 'orders.refund',

  // Purchasing & Suppliers
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CREATE: 'purchases.create',
  PURCHASES_APPROVE: 'purchases.approve',

  // CRM & Customers
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',

  // Reporting & Analytics
  REPORTS_VIEW: 'reports.view',

  // User Management
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  // System & Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',

  // Audit Logs
  AUDIT_VIEW: 'audit.view',

  // System Diagnostics
  ADMIN_DIAGNOSTICS: 'admin.diagnostics',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role to Permissions Mapping Matrix
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: [
    '*', // Wildcard permission
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_UPDATE,
    PERMISSIONS.PRODUCTS_DELETE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_APPROVE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_UPDATE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_UPDATE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.ADMIN_DIAGNOSTICS,
  ],
  admin: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_UPDATE,
    PERMISSIONS.PRODUCTS_DELETE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_APPROVE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_UPDATE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_UPDATE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.ADMIN_DIAGNOSTICS,
  ],
  manager: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_UPDATE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_APPROVE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_UPDATE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  inventory_manager: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_UPDATE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.REPORTS_VIEW,
  ],
  purchasing_manager: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_APPROVE,
  ],
  cashier: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
  ],
  sales_user: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_UPDATE,
  ],
  viewer: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

/**
 * Normalizes user role string (handling client persona names like "Super Admin", "Store Manager")
 */
export function normalizeRole(roleInput: string): UserRole {
  const clean = roleInput.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (clean === 'super_admin' || clean === 'business_owner') return 'super_admin';
  if (clean === 'admin') return 'admin';
  if (clean === 'manager' || clean === 'store_manager') return 'manager';
  if (clean === 'cashier') return 'cashier';
  if (clean === 'inventory_manager' || clean === 'warehouse_manager') return 'inventory_manager';
  if (clean === 'purchasing_manager') return 'purchasing_manager';
  if (clean === 'sales_user' || clean === 'accountant') return 'sales_user';
  if (clean === 'viewer' || clean === 'e_commerce_customer') return 'viewer';

  if (VALID_ROLES.includes(clean as UserRole)) {
    return clean as UserRole;
  }
  return 'viewer';
}

/**
 * Resolve effective permissions for a given role.
 */
export function getPermissionsForRole(role: string): string[] {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.viewer;
}

export const getRolePermissions = getPermissionsForRole;

/**
 * Check if a role or permissions list satisfies required permission.
 * Accepts either a role string (e.g. 'super_admin') or an array of permissions.
 */
export function hasPermission(roleOrPermissions: string | string[], requiredPermission: string): boolean {
  if (!roleOrPermissions) return false;
  let perms: string[];
  if (typeof roleOrPermissions === 'string') {
    perms = getPermissionsForRole(roleOrPermissions);
  } else if (Array.isArray(roleOrPermissions)) {
    perms = roleOrPermissions;
  } else {
    return false;
  }

  if (!perms || perms.length === 0) return false;
  if (perms.includes('*')) return true;
  return perms.includes(requiredPermission);
}
