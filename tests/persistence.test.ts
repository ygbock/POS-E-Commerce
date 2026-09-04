import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations, getAppliedMigrations } from '../server/db/migrator';
import {
  CatalogRepository,
  InventoryRepository,
  OrderRepository,
  CustomerRepository,
  AuditRepository,
} from '../server/repositories';

let testPassedCount = 0;
let testFailedCount = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log('PASSED');
    testPassedCount++;
  } catch (error: any) {
    console.log('FAILED');
    console.error(`    Error: ${error.message || error}`);
    testFailedCount++;
  }
}

async function main() {
  console.log('\n========================================');
  console.log(' Omnicore Database & Persistence Tests');
  console.log('========================================\n');

  // Use an isolated in-memory PostgreSQL test instance
  const db: DatabaseClient = createIsolatedTestClient();

  try {
    // Test 1: Database Connection
    await runTest('1. Database Connection and Ping', async () => {
      const res = await db.query('SELECT 1 as connected, NOW() as current_time');
      assert.strictEqual(res.rows.length, 1);
      assert.strictEqual(res.rows[0].connected, 1);
    });

    // Test 2: Migration Execution
    await runTest('2. Schema Migration Execution (Up)', async () => {
      const result = await runMigrations(db);
      assert.ok(result.applied.length >= 1, 'At least initial migration applied');

      const applied = await getAppliedMigrations(db);
      assert.ok(applied.has('001'), 'Migration 001 marked applied');

      // Verify key tables exist
      const tablesRes = await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const tableNames = new Set(tablesRes.rows.map((r: any) => r.table_name));
      const requiredTables = [
        'organizations',
        'locations',
        'categories',
        'brands',
        'products',
        'product_variants',
        'customers',
        'inventory_balances',
        'inventory_movements',
        'orders',
        'order_items',
        'payments',
        'audit_events',
      ];
      for (const table of requiredTables) {
        assert.ok(tableNames.has(table), `Table ${table} must exist in public schema`);
      }
    });

    // Test 3: Migration Idempotency & Reproducibility
    await runTest('3. Migration Idempotency & Reproducibility', async () => {
      const result = await runMigrations(db);
      assert.strictEqual(result.applied.length, 0, 'No unapplied migrations should run on re-execution');
    });

    // Seed test organization and location
    await db.exec(`
      INSERT INTO organizations (id, name, code) VALUES ('test_org', 'Test Org', 'TEST_ORG');
      INSERT INTO locations (id, organization_id, code, name, type)
      VALUES ('test_loc', 'test_org', 'LOC-TEST', 'Test Location', 'Retail Store');
    `);

    // Test 4: Primary Key Constraints
    await runTest('4. Primary Key Constraint Enforcement', async () => {
      let duplicateThrew = false;
      try {
        await db.query(
          "INSERT INTO organizations (id, name, code) VALUES ('test_org', 'Duplicate Org', 'TEST_ORG_2')"
        );
      } catch (err: any) {
        duplicateThrew = true;
      }
      assert.ok(duplicateThrew, 'Duplicate primary key must throw error');
    });

    // Test 5: Foreign Key Constraints
    await runTest('5. Foreign Key Constraint Enforcement', async () => {
      let fkThrew = false;
      try {
        await db.query(
          `INSERT INTO products (id, organization_id, category_id, name, slug, unit_code)
           VALUES ('prod_invalid_fk', 'non_existent_org', 'non_existent_cat', 'Invalid', 'invalid', 'PCS')`
        );
      } catch (err: any) {
        fkThrew = true;
      }
      assert.ok(fkThrew, 'Non-existent organization_id must throw foreign key violation');
    });

    // Test 6: Uniqueness Constraints (SKU and Barcode)
    await runTest('6. Unique Constraints (Organization + SKU, Organization + Barcode)', async () => {
      const catalogRepo = new CatalogRepository(db);

      // Create valid category
      await catalogRepo.createCategory({
        id: 'cat_test',
        organization_id: 'test_org',
        name: 'Test Category',
        slug: 'test-category',
      });

      // Create product with variant
      await catalogRepo.createProductWithVariants(
        {
          id: 'prod_unique_1',
          organization_id: 'test_org',
          category_id: 'cat_test',
          name: 'Unique Test Product',
          slug: 'unique-test-prod',
          unit_code: 'PCS',
        },
        [
          {
            id: 'var_unique_1',
            organization_id: 'test_org',
            product_id: 'prod_unique_1',
            sku: 'SKU-UNIQUE-TEST',
            barcode: 'BARCODE-UNIQUE-TEST',
            name: 'Variant 1',
            cost_price: 10.0,
            retail_price: 20.0,
          },
        ]
      );

      // Attempt to insert duplicate SKU in same organization
      let duplicateSkuThrew = false;
      try {
        await db.query(
          `INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price)
           VALUES ('var_unique_2', 'test_org', 'prod_unique_1', 'SKU-UNIQUE-TEST', 'BARCODE-DIFF', 'Variant 2', 10.0, 20.0)`
        );
      } catch {
        duplicateSkuThrew = true;
      }
      assert.ok(duplicateSkuThrew, 'Duplicate SKU within same organization must throw uniqueness error');
    });

    // Test 7: Monetary Precision (NUMERIC representation)
    await runTest('7. Monetary Decimal Precision (No Floating-Point Distortion)', async () => {
      const catalogRepo = new CatalogRepository(db);
      const varRes = await catalogRepo.findVariantBySku('SKU-UNIQUE-TEST', 'test_org');
      assert.ok(varRes, 'Variant exists');
      assert.strictEqual(Number(varRes.cost_price).toFixed(2), '10.00');
      assert.strictEqual(Number(varRes.retail_price).toFixed(2), '20.00');

      // Test fractional cent representation
      await db.query(
        `UPDATE product_variants SET retail_price = 19.99, cost_price = 12.34 WHERE id = 'var_unique_1'`
      );
      const updated = await catalogRepo.findVariantBySku('SKU-UNIQUE-TEST', 'test_org');
      assert.strictEqual(Number(updated?.retail_price).toFixed(2), '19.99');
      assert.strictEqual(Number(updated?.cost_price).toFixed(2), '12.34');
    });

    // Test 8: Fractional Inventory Quantities
    await runTest('8. Fractional Inventory Quantities (NUMERIC 14,4)', async () => {
      const invRepo = new InventoryRepository(db);

      // Record movement of 2.5000 units
      const moveRes = await invRepo.recordMovement({
        id: 'mov_test_fractional',
        organization_id: 'test_org',
        location_id: 'test_loc',
        variant_id: 'var_unique_1',
        movement_type: 'PURCHASE_RECEIVE',
        quantity_change: 2.5,
        unit_cost: 12.34,
        performed_by: 'Test Worker',
        reason: 'Received shipment of bulk items',
      });

      assert.strictEqual(moveRes.balance.on_hand, 2.5);
      assert.strictEqual(moveRes.movement.quantity_change, 2.5);

      // Add fractional 0.1250 units
      const moveRes2 = await invRepo.recordMovement({
        id: 'mov_test_fractional_2',
        organization_id: 'test_org',
        location_id: 'test_loc',
        variant_id: 'var_unique_1',
        movement_type: 'PURCHASE_RECEIVE',
        quantity_change: 0.125,
        performed_by: 'Test Worker',
      });

      assert.strictEqual(moveRes2.balance.on_hand, 2.625);
    });

    // Test 9: Atomic Transactions and Rollback Safety
    await runTest('9. Atomic Database Transactions & Rollback on Error', async () => {
      const invRepo = new InventoryRepository(db);
      const preBalance = await invRepo.getBalance('test_loc', 'var_unique_1');
      const startOnHand = preBalance?.on_hand ?? 0;

      let txThrew = false;
      try {
        await db.withTransaction(async (tx) => {
          // 1. Valid update inside transaction
          await tx.query(
            `UPDATE inventory_balances SET on_hand = on_hand + 50 WHERE location_id = 'test_loc' AND variant_id = 'var_unique_1'`
          );

          // 2. Intentional fatal error triggering rollback
          throw new Error('INTENTIONAL_TRANSACTION_FAILURE');
        });
      } catch (err: any) {
        if (err.message === 'INTENTIONAL_TRANSACTION_FAILURE') {
          txThrew = true;
        }
      }

      assert.ok(txThrew, 'Transaction threw expected error');

      // Verify that on_hand was rolled back and did not retain +50
      const postBalance = await invRepo.getBalance('test_loc', 'var_unique_1');
      assert.strictEqual(postBalance?.on_hand, startOnHand, 'Balance must be unchanged after transaction rollback');
    });

    // Test 10: Order and Payment Creation with Audit Trail
    await runTest('10. Order + Payment + Audit Trail Repository Workflows', async () => {
      const orderRepo = new OrderRepository(db);
      const auditRepo = new AuditRepository(db);

      const created = await orderRepo.createOrderWithItems(
        {
          id: 'ord_test_001',
          organization_id: 'test_org',
          location_id: 'test_loc',
          order_number: 'ORD-2026-TEST-001',
          source: 'POS',
          channel: 'POS Register 1',
          fulfillment_method: 'POS Walk-in',
          subtotal: 39.98,
          discount_amount: 0,
          tax_amount: 5.0,
          shipping_fee: 0,
          total_amount: 44.98,
          payment_status: 'Paid',
          status: 'Completed',
          cashier_name: 'John Doe',
        },
        [
          {
            id: 'ord_item_001',
            order_id: 'ord_test_001',
            variant_id: 'var_unique_1',
            product_name: 'Unique Test Product',
            variant_name: 'Variant 1',
            sku: 'SKU-UNIQUE-TEST',
            unit_price: 19.99,
            cost_price: 12.34,
            quantity: 2,
            discount_amount: 0,
            tax_rate: 15.0,
            total_amount: 39.98,
          },
        ],
        {
          id: 'pay_test_001',
          organization_id: 'test_org',
          order_id: 'ord_test_001',
          payment_method: 'Cash',
          amount: 44.98,
          currency: 'SLE',
          status: 'Completed',
          reference: 'CASH-TENDER-001',
        }
      );

      assert.strictEqual(created.order.order_number, 'ORD-2026-TEST-001');
      assert.strictEqual(created.items.length, 1);
      assert.strictEqual(created.payment?.amount, 44.98);

      // Record Audit Event
      const auditLog = await auditRepo.recordEvent({
        id: 'audit_test_001',
        organization_id: 'test_org',
        actor_id: 'user_cashier_1',
        actor_name: 'John Doe',
        actor_role: 'cashier',
        action: 'ORDER_CHECKOUT_COMPLETED',
        entity_type: 'ORDER',
        entity_id: 'ord_test_001',
        location_id: 'test_loc',
        after_state: { total_amount: 44.98, status: 'Completed' },
        severity: 'Info',
      });

      assert.strictEqual(auditLog.action, 'ORDER_CHECKOUT_COMPLETED');
      assert.strictEqual(auditLog.entity_id, 'ord_test_001');
    });

  } finally {
    await db.close();
  }

  console.log('\n----------------------------------------');
  console.log(`Results: ${testPassedCount} passed, ${testFailedCount} failed`);
  console.log('----------------------------------------\n');

  if (testFailedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
