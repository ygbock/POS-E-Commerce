
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const accountModal = fs.readFileSync('src/components/storefront/CustomerAccountModal.tsx', 'utf8');
assert.match(accountModal, /storefrontApi\.getCustomerOrders\(tenant\.slug\)/);
assert.match(accountModal, /storefrontApi\.getCustomerOrder\(tenant\.slug, order\.orderNumber\)/);
assert.match(accountModal, /const \[customerOrders, setCustomerOrders\] = useState<Order\[\]>\(\[\]\)/);
assert.doesNotMatch(accountModal, /const customerOrders = activeCustomerUser \? orders : \[\]/);
assert.match(accountModal, /<span>Order Details<\/span>/);
assert.match(accountModal, /Fulfillment Status/);
assert.match(accountModal, /Payment Summary/);
assert.match(accountModal, /Fulfillment & Tracking/);
assert.match(accountModal, /Customer & Order Information/);
assert.match(accountModal, /searchedOrder\.statusHistory/);
assert.match(accountModal, /new Date\(event\.changedAt\)\.toLocaleString\(\)/);
assert.doesNotMatch(accountModal, /simulateAdvanceOrderStatus/);
assert.doesNotMatch(accountModal, /Advance Demo Milestone/);
assert.doesNotMatch(accountModal, /Date\.now\(\) \+ 86400000/);



const historyMigration = read('server/db/migrations/017_order_status_history.sql');
assert.match(historyMigration, /CREATE TABLE IF NOT EXISTS order_status_history/);
assert.match(historyMigration, /CREATE TRIGGER trg_orders_status_history/);
assert.match(historyMigration, /NEW\.status IS DISTINCT FROM OLD\.status/);
assert.match(historyMigration, /migration:017_backfill/);

const context = read('src/context/StorefrontContext.tsx');
assert.match(context, /storefront:\$\{encodeURIComponent\(slug\)\}:cart/);
assert.match(context, /export interface StoreCartItem/);
assert.match(context, /clearStoreCart/);

const router = read('server/routes/storefrontRoutes.ts');
assert.match(router, /p\.channels_ecommerce = true/);
assert.match(router, /ORDER_VERIFICATION_FAILED/);
assert.match(router, /router\.get\('\/orders\/:orderNumber'/);
assert.match(router, /router\.get\('\/:tenantSlug\/orders\/:orderNumber'/);
assert.match(router, /router\.get\('\/:tenantSlug\/account\/orders', requireAuth\(\)/);
assert.match(router, /router\.get\('\/:tenantSlug\/account\/orders\/\:orderNumber', requireAuth\(\)/);
assert.match(router, /TENANT_ACCESS_DENIED/);
assert.match(router, /auth_user_id = \$2/);


const api = read('src/services/storefrontApi.ts');
assert.match(api, /trackOrder\(tenantSlug/);
assert.match(api, /encodeURIComponent\(orderNumber\)/);

assert.match(api, /getCustomerOrders\(tenantSlug/);
assert.match(api, /getCustomerOrder\(tenantSlug[^,]*,\s*orderNumber/);


const tracking = read('src/components/storefront/OrderTrackingModal.tsx');
assert.match(tracking, /storefrontApi\.trackOrder/);
assert.doesNotMatch(tracking, /orders\.find\(/);

console.log('Storefront modernization contracts: PASS');
