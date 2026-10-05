import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const app = read('src/App.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');
const portal = read('src/components/merchant/BusinessOwnerPortal.tsx');
const merchantRoutes = read('server/routes/merchantRoutes.ts');
const supplierView = read('src/components/purchasing/SupplierManagementView.tsx');

for (const workspace of ['users', 'locations', 'crm', 'suppliers']) {
  assert.match(app, new RegExp(`workspaceTabs = new Set\\(\\[[^\\]]*['"]${workspace}['"]`), `App must accept ${workspace} workspace requests`);
}
assert.match(app, /activeTab === 'suppliers' && <SupplierManagementView \/>/);
assert.match(sidebar, /id: 'users'/);
assert.match(sidebar, /id: 'locations'/);
assert.match(sidebar, /id: 'suppliers'/);
assert.match(portal, /workspace: 'users'/);
assert.match(portal, /workspace: 'locations'/);
assert.match(portal, /workspace: 'crm'/);
assert.match(portal, /workspace: 'suppliers'/);

for (const permission of [
  'PERMISSIONS.CUSTOMERS_VIEW',
  'PERMISSIONS.PURCHASES_VIEW',
  'PERMISSIONS.PURCHASES_CREATE',
  'PERMISSIONS.LOCATIONS_VIEW',
  'PERMISSIONS.LOCATIONS_MANAGE',
  'PERMISSIONS.USERS_VIEW',
]) {
  assert.ok(merchantRoutes.includes(permission), `Merchant endpoint must enforce ${permission}`);
}

assert.match(supplierView, /fetch\('\/api\/suppliers'/);
assert.match(supplierView, /method: editing \? 'PUT' : 'POST'/);
assert.match(supplierView, /method: 'DELETE'/);
assert.match(supplierView, /Tenant suppliers/);

console.log('Merchant users, locations, customers and suppliers workspace contract passed.');
