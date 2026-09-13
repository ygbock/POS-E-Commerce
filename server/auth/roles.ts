/**
 * Server-authoritative roles and permissions.
 * Platform roles are intentionally separate from tenant/business roles.
 */
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'inventory_manager'
  | 'purchasing_manager'
  | 'sales_user'
  | 'viewer'
  | 'system_owner'
  | 'platform_admin'
  | 'platform_support'
  | 'platform_finance';

export const VALID_ROLES: UserRole[] = [
  'super_admin','admin','manager','cashier','inventory_manager','purchasing_manager','sales_user','viewer',
  'system_owner','platform_admin','platform_support','platform_finance',
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
  SYSTEM_OWNER: 'system_owner' as UserRole,
  PLATFORM_ADMIN: 'platform_admin' as UserRole,
  PLATFORM_SUPPORT: 'platform_support' as UserRole,
  PLATFORM_FINANCE: 'platform_finance' as UserRole,
} as const;

export const PERMISSIONS = {
  PRODUCTS_VIEW:'products.view', PRODUCTS_CREATE:'products.create', PRODUCTS_UPDATE:'products.update', PRODUCTS_DELETE:'products.delete',
  INVENTORY_VIEW:'inventory.view', INVENTORY_ADJUST:'inventory.adjust', INVENTORY_TRANSFER:'inventory.transfer', INVENTORY_RECEIVE:'inventory.receive',
  ORDERS_VIEW:'orders.view', ORDERS_CREATE:'orders.create', ORDERS_CANCEL:'orders.cancel', ORDERS_REFUND:'orders.refund',
  PURCHASES_VIEW:'purchases.view', PURCHASES_CREATE:'purchases.create', PURCHASES_APPROVE:'purchases.approve',
  CUSTOMERS_VIEW:'customers.view', CUSTOMERS_CREATE:'customers.create', CUSTOMERS_UPDATE:'customers.update',
  REPORTS_VIEW:'reports.view', USERS_VIEW:'users.view', USERS_CREATE:'users.create', USERS_UPDATE:'users.update', USERS_DELETE:'users.delete',
  SETTINGS_VIEW:'settings.view', SETTINGS_UPDATE:'settings.update', AUDIT_VIEW:'audit.view',
  POS_VIEW:'pos.view', POS_SELL:'pos.sell', POS_SESSION_OPEN:'pos.session_open', POS_SESSION_CLOSE:'pos.session_close', POS_DISCOUNT:'pos.discount',
  POS_PRICE_OVERRIDE:'pos.price_override', POS_VOID:'pos.void', POS_RETURN:'pos.return', POS_REFUND:'pos.refund', POS_REPORT:'pos.report',
  ADMIN_DIAGNOSTICS:'admin.diagnostics',
  PLATFORM_VIEW:'platform.view', PLATFORM_TENANTS:'platform.tenants', PLATFORM_SUPPORT:'platform.support', PLATFORM_BILLING:'platform.billing',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const tenantAdmin = Object.values(PERMISSIONS).filter(p => !p.startsWith('platform.'));
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['*', ...tenantAdmin],
  admin: tenantAdmin,
  manager: tenantAdmin.filter(p => ![PERMISSIONS.USERS_DELETE, PERMISSIONS.SETTINGS_UPDATE].includes(p)),
  inventory_manager: [PERMISSIONS.PRODUCTS_VIEW,PERMISSIONS.PRODUCTS_CREATE,PERMISSIONS.PRODUCTS_UPDATE,PERMISSIONS.INVENTORY_VIEW,PERMISSIONS.INVENTORY_ADJUST,PERMISSIONS.INVENTORY_TRANSFER,PERMISSIONS.INVENTORY_RECEIVE,PERMISSIONS.PURCHASES_VIEW,PERMISSIONS.PURCHASES_CREATE,PERMISSIONS.REPORTS_VIEW],
  purchasing_manager: [PERMISSIONS.PRODUCTS_VIEW,PERMISSIONS.INVENTORY_VIEW,PERMISSIONS.INVENTORY_RECEIVE,PERMISSIONS.PURCHASES_VIEW,PERMISSIONS.PURCHASES_CREATE,PERMISSIONS.PURCHASES_APPROVE],
  cashier: [PERMISSIONS.PRODUCTS_VIEW,PERMISSIONS.ORDERS_VIEW,PERMISSIONS.ORDERS_CREATE,PERMISSIONS.CUSTOMERS_VIEW,PERMISSIONS.CUSTOMERS_CREATE,PERMISSIONS.POS_VIEW,PERMISSIONS.POS_SELL,PERMISSIONS.POS_SESSION_OPEN,PERMISSIONS.POS_SESSION_CLOSE,PERMISSIONS.POS_DISCOUNT,PERMISSIONS.POS_RETURN],
  sales_user: [PERMISSIONS.PRODUCTS_VIEW,PERMISSIONS.ORDERS_VIEW,PERMISSIONS.ORDERS_CREATE,PERMISSIONS.CUSTOMERS_VIEW,PERMISSIONS.CUSTOMERS_CREATE,PERMISSIONS.CUSTOMERS_UPDATE,PERMISSIONS.POS_VIEW,PERMISSIONS.POS_SELL,PERMISSIONS.POS_SESSION_OPEN,PERMISSIONS.POS_SESSION_CLOSE,PERMISSIONS.POS_DISCOUNT],
  viewer: [PERMISSIONS.PRODUCTS_VIEW,PERMISSIONS.INVENTORY_VIEW,PERMISSIONS.ORDERS_VIEW,PERMISSIONS.REPORTS_VIEW],
  system_owner: [PERMISSIONS.PLATFORM_VIEW,PERMISSIONS.PLATFORM_TENANTS,PERMISSIONS.PLATFORM_SUPPORT,PERMISSIONS.PLATFORM_BILLING],
  platform_admin: [PERMISSIONS.PLATFORM_VIEW,PERMISSIONS.PLATFORM_TENANTS,PERMISSIONS.PLATFORM_SUPPORT],
  platform_support: [PERMISSIONS.PLATFORM_VIEW,PERMISSIONS.PLATFORM_SUPPORT],
  platform_finance: [PERMISSIONS.PLATFORM_VIEW,PERMISSIONS.PLATFORM_BILLING],
};

export function normalizeRole(roleInput: string): UserRole {
  const clean = roleInput.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const aliases: Record<string, UserRole> = {
    super_admin:'super_admin', business_owner:'super_admin', admin:'admin', manager:'manager', store_manager:'manager',
    cashier:'cashier', inventory_manager:'inventory_manager', warehouse_manager:'inventory_manager',
    purchasing_manager:'purchasing_manager', sales_user:'sales_user', accountant:'sales_user', viewer:'viewer',
    e_commerce_customer:'viewer', system_owner:'system_owner', platform_admin:'platform_admin',
    platform_support:'platform_support', platform_finance:'platform_finance',
  };
  return aliases[clean] || (VALID_ROLES.includes(clean as UserRole) ? clean as UserRole : 'viewer');
}
export function getPermissionsForRole(role: string): string[] { return ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.viewer; }
export const getRolePermissions = getPermissionsForRole;
export function hasPermission(roleOrPermissions: string | string[], requiredPermission: string): boolean {
  const perms = typeof roleOrPermissions === 'string' ? getPermissionsForRole(roleOrPermissions) : roleOrPermissions;
  return Array.isArray(perms) && (perms.includes('*') || perms.includes(requiredPermission));
}
export function isPlatformRole(role: string): boolean {
  return ['system_owner','platform_admin','platform_support','platform_finance'].includes(normalizeRole(role));
}
