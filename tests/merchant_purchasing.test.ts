import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

async function main() {
  const migration = read('server/db/migrations/060_purchasing_receipts.sql');
  const service = read('server/services/purchasingService.ts');
  const routes = read('server/routes/merchantRoutes.ts');
  const ui = read('src/components/purchasing/PurchasingManagement.tsx');

  assert.match(migration, /purchase_receipts/);
  assert.match(migration, /uq_purchase_receipts_org_idempotency/);
  assert.match(migration, /uq_purchase_orders_org_idempotency/);

  assert.match(service, /db\.withTransaction/);
  assert.match(service, /parseExactQuantity/);
  assert.match(service, /parseExactMoney/);
  assert.match(service, /new InventoryRepository\(db\)/);
  assert.match(service, /reference_type: 'PURCHASE_RECEIPT'/);
  assert.match(service, /purchase_order_items/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /Received quantity exceeds the remaining purchase-order quantity/);

  assert.match(routes, /GET', requireAuth\(\), requirePermission\(PERMISSIONS\.PURCHASES_VIEW\)/);
  assert.match(routes, /router\.post\('\/purchase-orders'/);
  assert.match(routes, /router\.post\('\/purchase-orders\/:id\/receive'/);
  assert.match(routes, /PERMISSIONS\.INVENTORY_RECEIVE/);
  assert.match(routes, /Idempotency-Key/);

  assert.doesNotMatch(ui, /receivePurchaseOrderGoods\(receivingPo\.id/);
  assert.match(ui, /\/api\/purchase-orders/);
  assert.match(ui, /\/receive/);
  assert.match(ui, /Idempotency-Key/);

  console.log('Merchant purchasing & receiving contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
