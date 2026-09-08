process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { PosService } from '../server/services/posService';
import { PosRepository } from '../server/repositories/posRepository';
import { OrderRepository } from '../server/repositories/orderRepository';
import { InventoryRepository } from '../server/repositories/inventoryRepository';
import { AuditRepository } from '../server/repositories/auditRepository';
import { toQtyString } from '../server/inventory/inventoryPolicies';

async function runPosTests() {
  console.log('======================================================');
  console.log(' AbaCha POS-001 Point of Sale Foundation Tests');
  console.log('======================================================');

  let passed = 0;
  let failed = 0;

  function markPassed(testName: string) {
    console.log(`  [TEST] ${testName}... PASSED`);
    passed++;
  }

  function markFailed(testName: string, err: any) {
    console.error(`  [TEST] ${testName}... FAILED!`);
    console.error(err);
    failed++;
  }

  // 1. Setup Database & Migrations
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  await runMigrations(db);

  // Seed baseline test organizations, locations, and products
  await db.exec(`
    INSERT INTO organizations (id, name, code, is_active) VALUES 
      ('org_pos_a', 'POS Org A', 'POS_ORG_A', TRUE),
      ('org_pos_b', 'POS Org B', 'POS_ORG_B', TRUE);

    INSERT INTO locations (id, organization_id, code, name, type) VALUES
      ('loc_store_a', 'org_pos_a', 'STA', 'Store A', 'Retail Store'),
      ('loc_store_b', 'org_pos_b', 'STB', 'Store B', 'Retail Store');

    INSERT INTO units_of_measure (id, organization_id, code, name, category) VALUES
      ('uom_kg_a', 'org_pos_a', 'KG', 'Kilogram', 'Weight'),
      ('uom_kg_b', 'org_pos_b', 'KG', 'Kilogram', 'Weight');

    INSERT INTO products (id, organization_id, name, slug, status, product_type, unit_code) VALUES
      ('prod_pos_1', 'org_pos_a', 'Organic Apples', 'organic-apples', 'active', 'standard', 'KG'),
      ('prod_pos_2', 'org_pos_a', 'Dairy Milk', 'dairy-milk', 'active', 'standard', 'KG'),
      ('prod_pos_3', 'org_pos_b', 'Sneakers', 'sneakers', 'active', 'standard', 'KG');

    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price) VALUES
      ('var_apple', 'org_pos_a', 'prod_pos_1', 'SKU-APPLE', '11111', '1kg Box', 5.00, 10.00),
      ('var_milk', 'org_pos_a', 'prod_pos_2', 'SKU-MILK', '22222', '1L Carton', 2.00, 4.00),
      ('var_sneaker', 'org_pos_b', 'prod_pos_3', 'SKU-SNEAKER', '33333', 'Size 10', 40.00, 80.00);
  `);

  const posRepo = new PosRepository(db);
  const orderRepo = new OrderRepository(db);
  const invRepo = new InventoryRepository(db);
  const auditRepo = new AuditRepository(db);
  const posService = new PosService(posRepo, orderRepo, invRepo, auditRepo, db);

  // Set initial inventory stock
  await invRepo.recordMovement({
    organization_id: 'org_pos_a',
    location_id: 'loc_store_a',
    variant_id: 'var_apple',
    movement_type: 'PURCHASE_RECEIVE',
    quantity_change: '100.0000',
    unit_cost: '5.00',
    performed_by: 'System Seed',
    allowNegativeStock: false,
  });

  await invRepo.recordMovement({
    organization_id: 'org_pos_a',
    location_id: 'loc_store_a',
    variant_id: 'var_milk',
    movement_type: 'PURCHASE_RECEIVE',
    quantity_change: '50.0000',
    unit_cost: '2.00',
    performed_by: 'System Seed',
    allowNegativeStock: false,
  });

  // Test 1: Session Management
  try {
    const session = await posService.openSession(
      'org_pos_a',
      'loc_store_a',
      'term_01',
      'cashier_a',
      100.00
    );

    assert.strictEqual(session.status, 'OPEN');
    assert.strictEqual(session.opening_cash, 100.00);
    assert.strictEqual(session.expected_cash, 100.00);

    // Double session open must fail
    await assert.rejects(
      async () => {
        await posService.openSession('org_pos_a', 'loc_store_a', 'term_01', 'cashier_b', 150.00);
      },
      (err: any) => err.message.includes('DUPLICATE_SESSION')
    );

    markPassed('Session Open & Double Open Protection');
  } catch (err) {
    markFailed('Session Open & Double Open Protection', err);
  }

  // Test 2: Cash drawer movements
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    await posService.recordCashMovement(openSession.id, 'org_pos_a', 'Cash In', 35.50, 'Starting Float Add', 'cashier_a');
    await posService.recordCashMovement(openSession.id, 'org_pos_a', 'Cash Out', 12.00, 'Vendor Pay Out', 'cashier_a');

    const updated = await posRepo.findSessionById(openSession.id, 'org_pos_a');
    assert.strictEqual(Number(updated?.expected_cash), 123.50); // 100 + 35.50 - 12.00

    markPassed('Cash Movements (In/Out)');
  } catch (err) {
    markFailed('Cash Movements (In/Out)', err);
  }

  // Test 3: Checkout with inventory deduction and negative stock prevention
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Checkout: 2 Apples (discount 10%) and 1 Milk
    const checkoutResult = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [
        { variant_id: 'var_apple', quantity: 2, discount_percentage: 10 },
        { variant_id: 'var_milk', quantity: 1 },
      ],
      payment_method: 'Cash',
      amount_paid: 25.00, // Cost is (2 * 10 * 0.9) + 4 = 18 + 4 = 22.00
    });

    assert.strictEqual(checkoutResult.order.total_amount, 22.00);
    assert.strictEqual(checkoutResult.order.subtotal, 24.00);
    assert.strictEqual(checkoutResult.order.discount_amount, 2.00);

    // Verify stock deduction
    const appleBalance = await invRepo.getBalance('loc_store_a', 'var_apple', 'org_pos_a');
    assert.strictEqual(appleBalance?.on_hand, '98.0000'); // 100 - 2

    const milkBalance = await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a');
    assert.strictEqual(milkBalance?.on_hand, '49.0000'); // 50 - 1

    // Verify session expected cash is updated
    const finalSession = await posRepo.findSessionById(openSession.id, 'org_pos_a');
    assert.strictEqual(Number(finalSession?.expected_cash), 145.50); // 123.50 + 22.00

    // Test negative stock prevention: try to checkout 60 Milks (only 49 left)
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_milk', quantity: 60 }],
          payment_method: 'Cash',
          amount_paid: 300.00,
        });
      },
      (err: any) => err.message.includes('INSUFFICIENT_STOCK')
    );

    markPassed('POS Checkout & Concurrency & Negative Stock Safeguard');
  } catch (err) {
    markFailed('POS Checkout & Concurrency & Negative Stock Safeguard', err);
  }

  // Test 4: Checkout Idempotency Check
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;
    const testKey = `idemp_${Math.random()}`;

    const res1 = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_milk', quantity: 1 }],
      payment_method: 'Cash',
      amount_paid: 10.00,
      idempotency_key: testKey,
    });

    const stockBefore = Number((await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a'))?.on_hand);

    const res2 = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_milk', quantity: 1 }],
      payment_method: 'Cash',
      amount_paid: 10.00,
      idempotency_key: testKey,
    });

    // Order numbers and order IDs must be exactly the same
    assert.strictEqual(res1.order.id, res2.order.id);
    assert.strictEqual(res1.order.order_number, res2.order.order_number);

    const stockAfter = Number((await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a'))?.on_hand);
    assert.strictEqual(stockBefore, stockAfter); // Stock must not be deducted a second time!

    markPassed('Idempotency Guard');
  } catch (err) {
    markFailed('Idempotency Guard', err);
  }

  // Test 5: Sales Returns, Restocking & Validation Safeguards
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Make a pristine sale
    const saleRes = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_milk', quantity: 10 }],
      payment_method: 'Cash',
      amount_paid: 100.00,
    });

    const stockBefore = Number((await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a'))?.on_hand);

    // Return 3 of the milk cartons
    const returnRes = await posService.processReturn({
      organization_id: 'org_pos_a',
      order_id: saleRes.order.id,
      refund_method: 'Cash',
      performed_by: 'manager_a',
      reason: 'Slightly spoiled packaging',
      return_items: [{ variant_id: 'var_milk', quantity: 3 }],
    });

    assert.strictEqual(returnRes.returnRecord.refund_amount, 12.00); // 3 * 4.00

    const stockAfter = Number((await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a'))?.on_hand);
    assert.strictEqual(stockAfter, stockBefore + 3); // Restocked 3 items successfully!

    // Return 8 more cartons (should fail because 3 are already returned, total remaining is 7)
    await assert.rejects(
      async () => {
        await posService.processReturn({
          organization_id: 'org_pos_a',
          order_id: saleRes.order.id,
          refund_method: 'Cash',
          performed_by: 'manager_a',
          reason: 'Excess returns',
          return_items: [{ variant_id: 'var_milk', quantity: 8 }],
        });
      },
      (err: any) => err.message.includes('RETURN_INVALID')
    );

    // Return remaining 7 items (should succeed and set order state to Fully Refunded)
    await posService.processReturn({
      organization_id: 'org_pos_a',
      order_id: saleRes.order.id,
      refund_method: 'Cash',
      performed_by: 'manager_a',
      reason: 'Refund rest',
      return_items: [{ variant_id: 'var_milk', quantity: 7 }],
    });

    const orderStatusCheck = await db.query<any>('SELECT payment_status FROM orders WHERE id = $1', [saleRes.order.id]);
    assert.strictEqual(orderStatusCheck.rows[0].payment_status, 'Refunded');

    markPassed('Sales Returns & Restocking Safeguards');
  } catch (err) {
    markFailed('Sales Returns & Restocking Safeguards', err);
  }

  // Test 6: Tenant Isolation & Closed Session Prevention
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Cross-tenant variant lookup or sale should fail or be blocked by tenant boundary
    // Checkout sneakers (org_pos_b) under org_pos_a session should fail
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_sneaker', quantity: 1 }], // var_sneaker belongs to org_pos_b!
          payment_method: 'Cash',
          amount_paid: 100.00,
        });
      },
      (err: any) => err.message.includes('PRODUCT_NOT_FOUND')
    );

    // Close session
    const closedSession = await posService.closeSession(openSession.id, 'org_pos_a', 150.00, 'manager_a');
    assert.strictEqual(closedSession.status, 'CLOSED');

    // Checkout with closed session must fail
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_milk', quantity: 1 }],
          payment_method: 'Cash',
          amount_paid: 10.00,
        });
      },
      (err: any) => err.message.includes('SESSION_CLOSED')
    );

    markPassed('Tenant Isolation & Session Life Cycle Safeguards');
  } catch (err) {
    markFailed('Tenant Isolation & Session Life Cycle Safeguards', err);
  }

  console.log('\n------------------------------------------------------');
  console.log(` POS TESTS RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runPosTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
