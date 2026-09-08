process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { PosService } from '../server/services/posService';
import { PosRepository } from '../server/repositories/posRepository';
import { OrderRepository } from '../server/repositories/orderRepository';
import { InventoryRepository } from '../server/repositories/inventoryRepository';
import { AuditRepository } from '../server/repositories/auditRepository';

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
      ('org_pos_b', 'POS Org B', 'POS_ORG_B', TRUE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO locations (id, organization_id, code, name, type) VALUES
      ('loc_store_a', 'org_pos_a', 'STA', 'Store A', 'Retail Store'),
      ('loc_store_b', 'org_pos_b', 'STB', 'Store B', 'Retail Store')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO units_of_measure (id, organization_id, code, name, category) VALUES
      ('uom_kg_a', 'org_pos_a', 'KG', 'Kilogram', 'Weight'),
      ('uom_kg_b', 'org_pos_b', 'KG', 'Kilogram', 'Weight')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO products (id, organization_id, name, slug, status, product_type, unit_code) VALUES
      ('prod_pos_1', 'org_pos_a', 'Organic Apples', 'organic-apples', 'active', 'standard', 'KG'),
      ('prod_pos_2', 'org_pos_a', 'Dairy Milk', 'dairy-milk', 'active', 'standard', 'KG'),
      ('prod_pos_3', 'org_pos_b', 'Sneakers', 'sneakers', 'active', 'standard', 'KG')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price) VALUES
      ('var_apple', 'org_pos_a', 'prod_pos_1', 'SKU-APPLE', '11111', '1kg Box', 5.00, 10.00),
      ('var_milk', 'org_pos_a', 'prod_pos_2', 'SKU-MILK', '22222', '1L Carton', 2.00, 4.00),
      ('var_sneaker', 'org_pos_b', 'prod_pos_3', 'SKU-SNEAKER', '33333', 'Size 10', 40.00, 80.00)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customers (id, organization_id, name, email) VALUES
      ('cust_pos_1', 'org_pos_a', 'Customer One', 'cust1@example.com'),
      ('cust_pos_2', 'org_pos_a', 'Customer Two', 'cust2@example.com')
    ON CONFLICT (id) DO NOTHING;
  `);

  const posRepo = new PosRepository(db);
  const orderRepo = new OrderRepository(db);
  const invRepo = new InventoryRepository(db);
  const auditRepo = new AuditRepository(db);
  const posService = new PosService(posRepo, orderRepo, invRepo, auditRepo, db);

  // Set initial inventory stock using exact strings
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
      '100.00'
    );

    assert.strictEqual(session.status, 'OPEN');
    assert.strictEqual(session.opening_cash, '100.00');
    assert.strictEqual(session.expected_cash, '100.00');

    // Double session open must fail
    await assert.rejects(
      async () => {
        await posService.openSession('org_pos_a', 'loc_store_a', 'term_01', 'cashier_b', '150.00');
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

    await posService.recordCashMovement(openSession.id, 'org_pos_a', 'Cash In', '35.50', 'Starting Float Add', 'cashier_a');
    await posService.recordCashMovement(openSession.id, 'org_pos_a', 'Cash Out', '12.00', 'Vendor Pay Out', 'cashier_a');

    const updated = await posRepo.findSessionById(openSession.id, 'org_pos_a');
    assert.strictEqual(updated?.expected_cash, '123.50'); // 100 + 35.50 - 12.00

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
        { variant_id: 'var_apple', quantity: '2.0000', discount_percentage: '10.00' },
        { variant_id: 'var_milk', quantity: '1.0000' },
      ],
      payment_method: 'Cash',
      amount_paid: '25.00', // Cost is (2 * 10 * 0.9) + 4 = 18 + 4 = 22.00
    });

    assert.strictEqual(checkoutResult.order.total_amount, '22.00');
    assert.strictEqual(checkoutResult.order.subtotal, '24.00');
    assert.strictEqual(checkoutResult.order.discount_amount, '2.00');

    // Verify stock deduction
    const appleBalance = await invRepo.getBalance('loc_store_a', 'var_apple', 'org_pos_a');
    assert.strictEqual(appleBalance?.on_hand, '98.0000'); // 100 - 2

    const milkBalance = await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a');
    assert.strictEqual(milkBalance?.on_hand, '49.0000'); // 50 - 1

    // Verify session expected cash is updated
    const finalSession = await posRepo.findSessionById(openSession.id, 'org_pos_a');
    assert.strictEqual(finalSession?.expected_cash, '145.50'); // 123.50 + 22.00

    // Test negative stock prevention: try to checkout 60 Milks (only 49 left)
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_milk', quantity: '60.0000' }],
          payment_method: 'Cash',
          amount_paid: '300.00',
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
      cart_items: [{ variant_id: 'var_milk', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
      idempotency_key: testKey,
    });

    const stockBefore = Number((await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a'))?.on_hand);

    const res2 = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_milk', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
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
      cart_items: [{ variant_id: 'var_milk', quantity: '10.0000' }],
      payment_method: 'Cash',
      amount_paid: '100.00',
    });

    const stockBefore = Number((await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a'))?.on_hand);

    // Return 3 of the milk cartons
    const returnRes = await posService.processReturn({
      organization_id: 'org_pos_a',
      order_id: saleRes.order.id,
      refund_method: 'Cash',
      performed_by: 'manager_a',
      reason: 'Slightly spoiled packaging',
      return_items: [{ variant_id: 'var_milk', quantity: '3.0000' }],
    });

    assert.strictEqual(returnRes.returnRecord.refund_amount, '12.00'); // 3 * 4.00

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
          return_items: [{ variant_id: 'var_milk', quantity: '8.0000' }],
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
      return_items: [{ variant_id: 'var_milk', quantity: '7.0000' }],
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
          cart_items: [{ variant_id: 'var_sneaker', quantity: '1.0000' }], // var_sneaker belongs to org_pos_b!
          payment_method: 'Cash',
          amount_paid: '100.00',
        });
      },
      (err: any) => err.message.includes('PRODUCT_NOT_FOUND')
    );

    // Close session
    const closedSession = await posService.closeSession(openSession.id, 'org_pos_a', '150.00', 'manager_a');
    assert.strictEqual(closedSession.status, 'CLOSED');

    // Checkout with closed session must fail
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_milk', quantity: '1.0000' }],
          payment_method: 'Cash',
          amount_paid: '10.00',
        });
      },
      (err: any) => err.message.includes('SESSION_CLOSED')
    );

    markPassed('Tenant Isolation & Session Life Cycle Safeguards');
  } catch (err) {
    markFailed('Tenant Isolation & Session Life Cycle Safeguards', err);
  }

  // ==========================================================================
  // CONCURRENT INTEGRATION TESTS (Simulating Real-World Races & Locks)
  // ==========================================================================

  // Test 7: Concurrent Session-Opening requests (Only one must succeed)
  try {
    const results = await Promise.allSettled([
      posService.openSession('org_pos_a', 'loc_store_a', 'term_01', 'cashier_x', '100.00'),
      posService.openSession('org_pos_a', 'loc_store_a', 'term_01', 'cashier_y', '100.00'),
      posService.openSession('org_pos_a', 'loc_store_a', 'term_01', 'cashier_z', '100.00'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Only exactly one session opening must succeed.');
    assert.strictEqual(rejected.length, 2, 'Exactly two concurrent session requests must fail.');

    const error1 = (rejected[0] as PromiseRejectedResult).reason;
    const error2 = (rejected[1] as PromiseRejectedResult).reason;

    assert.ok(error1.message.includes('DUPLICATE_SESSION'));
    assert.ok(error2.message.includes('DUPLICATE_SESSION'));

    markPassed('Concurrent Session Opening Race Prevention');
  } catch (err) {
    markFailed('Concurrent Session Opening Race Prevention', err);
  }

  // Test 8: Concurrent checkout requests vying for the same stock under pessimistic locks
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Restock milk to exactly 5 cartons
    await db.query(`UPDATE inventory_balances SET on_hand = 5.0000 WHERE location_id = 'loc_store_a' AND variant_id = 'var_milk'`);

    // Fire 3 simultaneous checkouts each requesting 2 cartons (Total = 6, which exceeds on-hand 5!)
    const results = await Promise.allSettled([
      posService.checkout({
        organization_id: 'org_pos_a',
        location_id: 'loc_store_a',
        session_id: openSession.id,
        cashier_name: 'cashier_a',
        cart_items: [{ variant_id: 'var_milk', quantity: '2.0000' }],
        payment_method: 'Cash',
        amount_paid: '20.00',
      }),
      posService.checkout({
        organization_id: 'org_pos_a',
        location_id: 'loc_store_a',
        session_id: openSession.id,
        cashier_name: 'cashier_a',
        cart_items: [{ variant_id: 'var_milk', quantity: '2.0000' }],
        payment_method: 'Cash',
        amount_paid: '20.00',
      }),
      posService.checkout({
        organization_id: 'org_pos_a',
        location_id: 'loc_store_a',
        session_id: openSession.id,
        cashier_name: 'cashier_a',
        cart_items: [{ variant_id: 'var_milk', quantity: '2.0000' }],
        payment_method: 'Cash',
        amount_paid: '20.00',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly two checkouts should succeed (2 * 2 = 4), and the third must fail with INSUFFICIENT_STOCK
    assert.strictEqual(fulfilled.length, 2, 'Exactly two checkouts of quantity 2 should succeed.');
    assert.strictEqual(rejected.length, 1, 'Exactly one checkout must fail due to stock depletion.');

    const errorMsg = (rejected[0] as PromiseRejectedResult).reason.message;
    assert.ok(errorMsg.includes('INSUFFICIENT_STOCK'), 'The failed checkout must fail due to insufficient stock.');

    // Remaining stock should be exactly 1 carton (5 - 4)
    const milkBal = await invRepo.getBalance('loc_store_a', 'var_milk', 'org_pos_a');
    assert.strictEqual(milkBal?.on_hand, '1.0000');

    markPassed('Concurrent Checkout Stock Reservation & Lock Protection');
  } catch (err) {
    markFailed('Concurrent Checkout Stock Reservation & Lock Protection', err);
  }

  // Test 9: Concurrent returns targeting the same order (preventing double-refund)
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Create a pristine sale of 3 items
    const sale = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '3.0000' }],
      payment_method: 'Cash',
      amount_paid: '30.00',
    });

    // Fire 3 simultaneous returns, each attempting to return 2 items (Total 6, exceeds purchase quantity of 3!)
    const results = await Promise.allSettled([
      posService.processReturn({
        organization_id: 'org_pos_a',
        order_id: sale.order.id,
        refund_method: 'Cash',
        performed_by: 'manager_x',
        reason: 'Concurrent Return 1',
        return_items: [{ variant_id: 'var_apple', quantity: '2.0000' }],
      }),
      posService.processReturn({
        organization_id: 'org_pos_a',
        order_id: sale.order.id,
        refund_method: 'Cash',
        performed_by: 'manager_y',
        reason: 'Concurrent Return 2',
        return_items: [{ variant_id: 'var_apple', quantity: '2.0000' }],
      }),
      posService.processReturn({
        organization_id: 'org_pos_a',
        order_id: sale.order.id,
        refund_method: 'Cash',
        performed_by: 'manager_z',
        reason: 'Concurrent Return 3',
        return_items: [{ variant_id: 'var_apple', quantity: '2.0000' }],
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Only exactly one return should succeed (returning 2 items), the other two must be blocked because remaining returnable is 1 item.
    assert.strictEqual(fulfilled.length, 1, 'Only one return request of quantity 2 must succeed.');
    assert.strictEqual(rejected.length, 2, 'The other two return requests must fail.');

    const error1 = (rejected[0] as PromiseRejectedResult).reason.message;
    const error2 = (rejected[1] as PromiseRejectedResult).reason.message;

    assert.ok(error1.includes('RETURN_INVALID'));
    assert.ok(error2.includes('RETURN_INVALID'));

    markPassed('Concurrent Return Double-Refund Lock Protection');
  } catch (err) {
    markFailed('Concurrent Return Double-Refund Lock Protection', err);
  }

  // Test 10: Exact decimal mapping assertions
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    const checkoutRes = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
    });

    assert.strictEqual(typeof checkoutRes.order.total_amount, 'string');
    assert.strictEqual(checkoutRes.order.total_amount, '10.00');
    assert.strictEqual(typeof checkoutRes.items[0].quantity, 'string');
    assert.strictEqual(checkoutRes.items[0].quantity, '1.0000');
    assert.strictEqual(typeof checkoutRes.payment?.amount, 'string');
    assert.strictEqual(checkoutRes.payment?.amount, '10.00');

    markPassed('Exact decimal mapping and types verification');
  } catch (err) {
    markFailed('Exact decimal mapping and types verification', err);
  }

  // Test 11: Idempotency stable fingerprint and replay protection
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;
    const testIdempotencyKey = `idem_${crypto.randomUUID()}`;

    // First call (successful checkout)
    const firstCall = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
      idempotency_key: testIdempotencyKey,
    });

    // Replay call (same key, same request -> should return identical result)
    const replayCall = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
      idempotency_key: testIdempotencyKey,
    });

    assert.strictEqual(replayCall.order.id, firstCall.order.id);

    // Mismatched call (same key, different request -> should throw IDEMPOTENCY_CONFLICT)
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_apple', quantity: '2.0000' }], // different quantity!
          payment_method: 'Cash',
          amount_paid: '20.00',
          idempotency_key: testIdempotencyKey,
        });
      },
      (err: any) => err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    markPassed('Idempotency stable fingerprint and conflict detection');
  } catch (err) {
    markFailed('Idempotency stable fingerprint and conflict detection', err);
  }

  // Test 12: Concurrent checkout idempotency race safety (unique constraint violation catching)
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;
    const raceIdempotencyKey = `idem_race_${crypto.randomUUID()}`;

    // Fire 5 identical requests simultaneously using the same idempotency key
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
          payment_method: 'Cash',
          amount_paid: '10.00',
          idempotency_key: raceIdempotencyKey,
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected');

    // ALL of them must succeed because the losing ones catch 23505, reload, verify identical, and return the same order successfully!
    assert.strictEqual(fulfilled.length, 5, 'All concurrent identical idempotency requests must succeed.');
    assert.strictEqual(rejected.length, 0, 'No request should fail due to race conditions.');

    // Ensure they all returned the exact same order ID
    const firstOrderId = fulfilled[0].value.order.id;
    for (const res of fulfilled) {
      assert.strictEqual(res.value.order.id, firstOrderId);
    }

    markPassed('Concurrent checkout race-safe unique index handling');
  } catch (err) {
    markFailed('Concurrent checkout race-safe unique index handling', err);
  }

  // Test 13: Rollback guarantees on failure
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Capture inventory level of apple before failing checkout
    const balBefore = await invRepo.getBalance('loc_store_a', 'var_apple', 'org_pos_a');

    // Trigger checkout with an invalid location_id to force database transaction rollback
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_invalid_rollback_test',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          cart_items: [{ variant_id: 'var_apple', quantity: '5.0000' }],
          payment_method: 'Cash',
          amount_paid: '50.00',
        });
      },
      (err: any) => err.message.includes('LOCATION_MISMATCH')
    );

    // Verify inventory level has not changed (strict rollback)
    const balAfter = await invRepo.getBalance('loc_store_a', 'var_apple', 'org_pos_a');
    assert.strictEqual(balAfter?.on_hand, balBefore?.on_hand);

    markPassed('Transaction rollback on checkout failure');
  } catch (err) {
    markFailed('Transaction rollback on checkout failure', err);
  }

  // Test 14: OrderRepository tenant requirement and cross-tenant boundaries (POS-001R3 Finding A)
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;

    // Create an order under org_pos_a
    const orderRes = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
    });

    // 1. Mandatory tenant context: missing orgId throws TENANT_REQUIRED
    await assert.rejects(
      async () => {
        await orderRepo.findOrderById(orderRes.order.id, '' as any);
      },
      (err: any) => err.message.includes('TENANT_REQUIRED')
    );

    // 2. Same tenant lookup succeeds
    const foundOrder = await orderRepo.findOrderById(orderRes.order.id, 'org_pos_a');
    assert.ok(foundOrder);
    assert.strictEqual(foundOrder.order.id, orderRes.order.id);
    assert.strictEqual(foundOrder.order.organization_id, 'org_pos_a');

    // 3. Cross-tenant lookup returns null
    const crossTenantOrder = await orderRepo.findOrderById(orderRes.order.id, 'org_pos_b');
    assert.strictEqual(crossTenantOrder, null, 'Cross-tenant order lookup must return null');

    // 4. Payment lookup mandatory tenant check
    await assert.rejects(
      async () => {
        await orderRepo.findPaymentByOrderId(orderRes.order.id, '' as any);
      },
      (err: any) => err.message.includes('TENANT_REQUIRED')
    );

    // 5. Cross-tenant payment lookup returns null
    const crossPayment = await orderRepo.findPaymentByOrderId(orderRes.order.id, 'org_pos_b');
    assert.strictEqual(crossPayment, null, 'Cross-tenant payment lookup must return null');

    markPassed('OrderRepository tenant requirement and cross-tenant boundaries');
  } catch (err) {
    markFailed('OrderRepository tenant requirement and cross-tenant boundaries', err);
  }

  // Test 15: Payment tenant consistency in createOrderWithItems (POS-001R3 Finding B)
  try {
    const dummyOrderId = `ord_test_mismatch_${crypto.randomUUID()}`;
    const dummyPaymentId = `pay_test_mismatch_${crypto.randomUUID()}`;

    // Attempt to create order with order under org_pos_a and payment under org_pos_b
    await assert.rejects(
      async () => {
        await orderRepo.createOrderWithItems(
          {
            id: dummyOrderId,
            organization_id: 'org_pos_a',
            location_id: 'loc_store_a',
            order_number: 'ORD-TEST-FAIL',
            source: 'POS',
            channel: 'POS Checkout',
            fulfillment_method: 'POS Walk-in',
            subtotal: '10.00',
            discount_amount: '0.00',
            tax_amount: '0.00',
            shipping_fee: '0.00',
            total_amount: '10.00',
            total_cost_amount: '5.00',
            payment_status: 'Paid',
            status: 'Completed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          [],
          {
            id: dummyPaymentId,
            organization_id: 'org_pos_b', // MISMATCH!
            order_id: dummyOrderId,
            payment_method: 'Cash',
            amount: '10.00',
            currency: 'SLE',
            status: 'Completed',
            created_at: new Date().toISOString(),
          }
        );
      },
      (err: any) => err.message.includes('TENANT_MISMATCH')
    );

    markPassed('Payment tenant consistency enforcement in createOrderWithItems');
  } catch (err) {
    markFailed('Payment tenant consistency enforcement in createOrderWithItems', err);
  }

  // Test 16: Idempotent replay returns mapped PaymentRecord with exact decimal amount (POS-001R3 Finding C)
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;
    const replayKey = `idem_exact_pay_${crypto.randomUUID()}`;

    const original = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '2.0000' }],
      payment_method: 'Cash',
      amount_paid: '20.00',
      idempotency_key: replayKey,
    });

    assert.ok(original.payment);
    assert.strictEqual(typeof original.payment.amount, 'string');
    assert.strictEqual(original.payment.amount, '20.00');

    // Replay call
    const replayed = await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      cart_items: [{ variant_id: 'var_apple', quantity: '2.0000' }],
      payment_method: 'Cash',
      amount_paid: '20.00',
      idempotency_key: replayKey,
    });

    assert.ok(replayed.payment);
    assert.strictEqual(replayed.order.id, original.order.id);
    assert.strictEqual(replayed.payment.id, original.payment.id);
    assert.strictEqual(typeof replayed.payment.amount, 'string');
    assert.strictEqual(replayed.payment.amount, '20.00');
    assert.strictEqual(replayed.payment.organization_id, 'org_pos_a');

    markPassed('Idempotent replay returns mapped PaymentRecord with exact decimal amount');
  } catch (err) {
    markFailed('Idempotent replay returns mapped PaymentRecord with exact decimal amount', err);
  }

  // Test 17: Comprehensive Idempotency Conflict Scenarios (different amount, customer, discount)
  try {
    const sessions = await posRepo.listSessions({ orgId: 'org_pos_a' });
    const openSession = sessions.find((s) => s.status === 'OPEN')!;
    const multiConflictKey = `idem_conflict_${crypto.randomUUID()}`;

    // Base call
    await posService.checkout({
      organization_id: 'org_pos_a',
      location_id: 'loc_store_a',
      session_id: openSession.id,
      cashier_name: 'cashier_a',
      customer_id: 'cust_pos_1',
      cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
      payment_method: 'Cash',
      amount_paid: '10.00',
      idempotency_key: multiConflictKey,
    });

    // 1. Conflict on different customer_id
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          customer_id: 'cust_pos_2',
          cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
          payment_method: 'Cash',
          amount_paid: '10.00',
          idempotency_key: multiConflictKey,
        });
      },
      (err: any) => err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // 2. Conflict on different discount
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          customer_id: 'cust_pos_1',
          cart_items: [{ variant_id: 'var_apple', quantity: '1.0000', discount_percentage: '10.00' }],
          payment_method: 'Cash',
          amount_paid: '9.00',
          idempotency_key: multiConflictKey,
        });
      },
      (err: any) => err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // 3. Conflict on different amount_paid
    await assert.rejects(
      async () => {
        await posService.checkout({
          organization_id: 'org_pos_a',
          location_id: 'loc_store_a',
          session_id: openSession.id,
          cashier_name: 'cashier_a',
          customer_id: 'cust_pos_1',
          cart_items: [{ variant_id: 'var_apple', quantity: '1.0000' }],
          payment_method: 'Cash',
          amount_paid: '15.00',
          idempotency_key: multiConflictKey,
        });
      },
      (err: any) => err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    markPassed('Comprehensive Idempotency Conflict Scenarios');
  } catch (err) {
    markFailed('Comprehensive Idempotency Conflict Scenarios', err);
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
