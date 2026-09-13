import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { OrderService } from '../server/services/orderService';
import { ReservationService } from '../server/inventory/reservationService';
import { StorefrontCartService, StorefrontCartValidationError } from '../server/services/storefrontCartService';
import {
  OrderRepository,
  InventoryRepository,
  CustomerRepository,
  AuditRepository,
} from '../server/repositories';
import { InventoryReservationRepository } from '../server/repositories/inventoryReservationRepository';
import { parseExactQuantity, parseExactMoney } from '../server/inventory/inventoryPolicies';

let passed = 0;
let failed = 0;

function markPassed(name: string) {
  console.log(`  [PASSED] ${name}`);
  passed++;
}

function markFailed(name: string, err: any) {
  console.error(`  [FAILED] ${name}`);
  console.error(err);
  failed++;
}

async function main() {
  console.log('========================================================================');
  console.log(' Phase 4 Independent QA, Security & Implementation Audit Deep Test Suite');
  console.log('========================================================================\n');

  const db = createIsolatedTestClient();
  await runMigrations(db);

  const orderRepo = new OrderRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  const customerRepo = new CustomerRepository(db);
  const auditRepo = new AuditRepository(db);
  const reservationRepo = new InventoryReservationRepository(db);
  const reservationService = new ReservationService(inventoryRepo, reservationRepo, db);
  const orderService = new OrderService(orderRepo, customerRepo, inventoryRepo, auditRepo, db);
  const cartService = new StorefrontCartService(db);
  const baseOrderParams = { actor_name: 'Storefront Shopper', actor_role: 'Customer' };

  // --------------------------------------------------------------------------
  // TEST SEEDING: Setup 2 distinct Tenants (Alpha and Beta)
  // --------------------------------------------------------------------------
  const orgAlpha = 'org_audit_alpha';
  const orgBeta = 'org_audit_beta';
  const locAlpha = 'loc_audit_alpha_main';
  const locBeta = 'loc_audit_beta_main';

  await db.query(`
    INSERT INTO organizations (id, name, slug, code, is_active, currency_code, policies)
    VALUES 
      ($1, 'Alpha Corp', 'alpha-corp', 'ALPHA', true, 'USD', '{"standardShippingFee":"9.99","freeShippingThreshold":"100.00","expressShippingFee":"25.00"}'),
      ($2, 'Beta Ltd', 'beta-ltd', 'BETA', true, 'EUR', '{"standardShippingFee":"5.00","freeShippingThreshold":"50.00","expressShippingFee":"15.00"}')
  `, [orgAlpha, orgBeta]);

  await db.query(`
    INSERT INTO locations (id, organization_id, name, code, type, is_active)
    VALUES
      ($1, $2, 'Alpha Main Store', 'A-MAIN', 'Retail Store', true),
      ($3, $4, 'Beta Main Store', 'B-MAIN', 'Retail Store', true)
  `, [locAlpha, orgAlpha, locBeta, orgBeta]);

  // Alpha Product & Variant
  const prodAlpha = 'prod_audit_alpha';
  const varAlpha = 'var_audit_alpha_widget';
  await db.query(`
    INSERT INTO products (id, organization_id, name, slug, status, tax_rate, unit_code)
    VALUES ($1, $2, 'Alpha Widget', 'alpha-widget', 'active', '10.00', 'PCS')
  `, [prodAlpha, orgAlpha]);

  await db.query(`
    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, retail_price, cost_price)
    VALUES ($1, $2, $3, 'SKU-ALPHA-1', 'BAR-ALPHA-1', 'Standard', 50.00, 20.00)
  `, [varAlpha, orgAlpha, prodAlpha]);

  // Beta Product & Variant
  const prodBeta = 'prod_audit_beta';
  const varBeta = 'var_audit_beta_gadget';
  await db.query(`
    INSERT INTO products (id, organization_id, name, slug, status, tax_rate, unit_code)
    VALUES ($1, $2, 'Beta Gadget', 'beta-gadget', 'active', '20.00', 'PCS')
  `, [prodBeta, orgBeta]);

  await db.query(`
    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, retail_price, cost_price)
    VALUES ($1, $2, $3, 'SKU-BETA-1', 'BAR-BETA-1', 'Standard', 80.00, 40.00)
  `, [varBeta, orgBeta, prodBeta]);

  // Initial Balances:
  // varAlpha at locAlpha: 10 on_hand, 0 reserved
  await db.query(`
    INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired)
    VALUES ('bal_alpha_1', $1, $2, $3, 10.0000, 0.0000, 0.0000, 0.0000)
  `, [orgAlpha, locAlpha, varAlpha]);

  // varBeta at locBeta: 5 on_hand, 0 reserved
  await db.query(`
    INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired)
    VALUES ('bal_beta_1', $1, $2, $3, 5.0000, 0.0000, 0.0000, 0.0000)
  `, [orgBeta, locBeta, varBeta]);

  // --------------------------------------------------------------------------
  // TEST 1: Cart Authority & Price Manipulation Rejection
  // --------------------------------------------------------------------------
  try {
    const alphaConfig = {
      tenant: { id: orgAlpha, name: 'Alpha Corp', code: 'ALPHA', slug: 'alpha-corp' },
      localization: { currencyCode: 'USD', currencySymbol: '$', locale: 'en-US', timezone: 'UTC' },
      branding: {},
      policies: { standardShippingFee: '9.99', freeShippingThreshold: '100.00' },
      catalogPolicy: {},
      featureFlags: {},
      pickupLocations: [],
    };

    // Client attempts to claim retailPrice = 0.01, lineTotal = 0.01, tax = 0
    const validationResult = await cartService.validate({
      organizationId: orgAlpha,
      config: alphaConfig,
      items: [
        {
          variantId: varAlpha,
          quantity: '2.0000',
          price: '0.01',
          lineTotal: '0.01',
          tax: '0.00',
        } as any,
      ],
      fulfillmentLocationId: locAlpha,
    });

    // Authoritative calculations: 2 units * $50.00 = $100.00 subtotal, 10% tax = $10.00, free shipping >= $100 -> $0.00 shipping, total = $110.00
    assert.strictEqual(validationResult.items[0].unitPrice, '50.00', 'Authoritative DB unit price enforced');
    assert.strictEqual(validationResult.items[0].lineSubtotal, '100.00');
    assert.strictEqual(validationResult.items[0].lineTax, '10.00');
    assert.strictEqual(validationResult.subtotal, '100.00');
    assert.strictEqual(validationResult.tax, '10.00');
    assert.strictEqual(validationResult.shippingFee, '0.00');
    assert.strictEqual(validationResult.total, '110.00');

    markPassed('Audit 1: Cart Authority & Price Manipulation Rejection (Client prices ignored)');
  } catch (err) {
    markFailed('Audit 1: Cart Authority & Price Manipulation Rejection', err);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Quantity Boundary & Tamper Testing
  // --------------------------------------------------------------------------
  try {
    const alphaConfig = {
      tenant: { id: orgAlpha, name: 'Alpha Corp', code: 'ALPHA', slug: 'alpha-corp' },
      localization: { currencyCode: 'USD', currencySymbol: '$', locale: 'en-US', timezone: 'UTC' },
      branding: {},
      policies: { standardShippingFee: '9.99', freeShippingThreshold: '100.00' },
      catalogPolicy: {},
      featureFlags: {},
      pickupLocations: [],
    };

    const invalidQuantities: any[] = [
      0, -1, 0.1, 0.01, 0.0001, 1, 1.5, 999999999,
      NaN, Infinity, -Infinity,
      '0', '-1', '0.0000', '-0.5', '1e3', '1.00001', 'NaN', 'Infinity',
      null, undefined, {}, [], true, false
    ];

    for (const q of invalidQuantities) {
      let rejected = false;
      try {
        await cartService.validate({
          organizationId: orgAlpha,
          config: alphaConfig,
          items: [{ variantId: varAlpha, quantity: q }],
        });
      } catch (err: any) {
        rejected = true;
      }
      assert.ok(rejected, `Expected invalid quantity ${JSON.stringify(q)} to be rejected.`);
    }

    // Valid exact quantities:
    const validQuantities = ['1.0000', '2', '0.5000', '10.0000'];
    for (const q of validQuantities) {
      const res = await cartService.validate({
        organizationId: orgAlpha,
        config: alphaConfig,
        items: [{ variantId: varAlpha, quantity: q }],
      });
      assert.ok(res.items.length === 1);
    }

    markPassed('Audit 2: Strict Quantity Boundary Validation (No float drift or coercion)');
  } catch (err) {
    markFailed('Audit 2: Strict Quantity Boundary Validation', err);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Duplicate Cart Items Rejection
  // --------------------------------------------------------------------------
  try {
    const alphaConfig = {
      tenant: { id: orgAlpha, name: 'Alpha Corp', code: 'ALPHA', slug: 'alpha-corp' },
      localization: { currencyCode: 'USD', currencySymbol: '$', locale: 'en-US', timezone: 'UTC' },
      branding: {},
      policies: { standardShippingFee: '9.99', freeShippingThreshold: '100.00' },
      catalogPolicy: {},
      featureFlags: {},
      pickupLocations: [],
    };

    let dupRejected = false;
    try {
      await cartService.validate({
        organizationId: orgAlpha,
        config: alphaConfig,
        items: [
          { variantId: varAlpha, quantity: '1.0000' },
          { variantId: varAlpha, quantity: '2.0000' },
        ],
      });
    } catch (err: any) {
      if (err instanceof StorefrontCartValidationError && err.code === 'DUPLICATE_CART_ITEM') {
        dupRejected = true;
      }
    }
    assert.ok(dupRejected, 'Duplicate variant in cart must be rejected with DUPLICATE_CART_ITEM');

    markPassed('Audit 3: Duplicate Cart Items Rejection (Prevents double counting/reservation)');
  } catch (err) {
    markFailed('Audit 3: Duplicate Cart Items Rejection', err);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Tenant Isolation (Cross-Tenant Access Strictly Blocked)
  // --------------------------------------------------------------------------
  try {
    // 4a. Tenant Alpha attempting to validate Tenant Beta variant
    let crossCartRejected = false;
    try {
      await cartService.validate({
        organizationId: orgAlpha,
        config: {
          tenant: { id: orgAlpha, name: 'Alpha Corp', code: 'ALPHA', slug: 'alpha-corp' },
          localization: { currencyCode: 'USD', currencySymbol: '$', locale: 'en-US', timezone: 'UTC' },
          branding: {}, policies: {}, catalogPolicy: {}, featureFlags: {}, pickupLocations: [],
        },
        items: [{ variantId: varBeta, quantity: '1.0000' }],
      });
    } catch (err: any) {
      if (err.code === 'PRODUCT_NOT_FOUND') crossCartRejected = true;
    }
    assert.ok(crossCartRejected, 'Tenant Alpha cannot validate Tenant Beta variant');

    // 4b. Tenant Alpha checkout attempting to order Tenant Beta variant
    let crossCheckoutRejected = false;
    try {
      await orderService.placeStorefrontOrder({
        ...baseOrderParams,
        organization_id: orgAlpha,
        idempotency_key: crypto.randomUUID(),
        payment_method: 'Credit Card',
        fulfillment_method: 'Standard Delivery',
        cart_items: [{ variant_id: varBeta, quantity: '1.0000' }],
      });
    } catch (err: any) {
      if (err.code === 'PRODUCT_NOT_FOUND') crossCheckoutRejected = true;
    }
    assert.ok(crossCheckoutRejected, 'Tenant Alpha cannot checkout Tenant Beta variant');

    markPassed('Audit 4: Tenant Isolation (Cross-tenant catalog/checkout strictly blocked)');
  } catch (err) {
    markFailed('Audit 4: Tenant Isolation', err);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Inventory Reservation Invariants at Checkout
  // --------------------------------------------------------------------------
  try {
    // Check initial stock
    const beforeBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const beforeOnHand = Number(beforeBal.rows[0].on_hand);
    const beforeReserved = Number(beforeBal.rows[0].reserved);

    const orderResult = await orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: crypto.randomUUID(),
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varAlpha, quantity: '2.0000' }],
    });

    assert.ok(orderResult.order.id);
    assert.strictEqual(orderResult.order.status, 'Stock Reserved');
    assert.strictEqual(orderResult.order.payment_status, 'Pending');

    // Verify Invariant: on_hand unchanged, reserved increased by 2.0000
    const afterBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const afterOnHand = Number(afterBal.rows[0].on_hand);
    const afterReserved = Number(afterBal.rows[0].reserved);

    assert.strictEqual(afterOnHand, beforeOnHand, 'on_hand must remain unchanged at checkout');
    assert.strictEqual(afterReserved - beforeReserved, 2, 'reserved must increase exactly by order quantity');

    // Verify reservation table entry
    const resEntries = await reservationService.listReservations(orgAlpha, {
      referenceType: 'orders',
      referenceId: orderResult.order.id,
      status: 'ACTIVE',
    });
    assert.strictEqual(resEntries.length, 1);
    assert.strictEqual(Number(resEntries[0].quantity), 2);
    assert.strictEqual(resEntries[0].status, 'ACTIVE');

    markPassed('Audit 5: Inventory Reservation Invariants at Checkout (on_hand unchanged, reserved increased)');
  } catch (err) {
    markFailed('Audit 5: Inventory Reservation Invariants at Checkout', err);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Inventory Concurrency & Oversell Protection (Stock = 1 Race)
  // --------------------------------------------------------------------------
  try {
    // Create a special single-unit variant
    const varSingle = 'var_audit_single_stock';
    await db.query(`
      INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, retail_price, cost_price)
      VALUES ($1, $2, $3, 'SKU-SINGLE-1', 'BAR-SINGLE-1', 'Single Stock Widget', 10.00, 5.00)
    `, [varSingle, orgAlpha, prodAlpha]);

    await db.query(`
      INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired)
      VALUES ('bal_single_1', $1, $2, $3, 1.0000, 0.0000, 0.0000, 0.0000)
    `, [orgAlpha, locAlpha, varSingle]);

    // Launch Customer A and Customer B simultaneously, each requesting qty 1.0000
    const reqA = orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: crypto.randomUUID(),
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varSingle, quantity: '1.0000' }],
    });

    const reqB = orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: crypto.randomUUID(),
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varSingle, quantity: '1.0000' }],
    });

    const results = await Promise.allSettled([reqA, reqB]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Exactly one order should succeed');
    assert.strictEqual(failures.length, 1, 'Exactly one order should fail');

    const failedReason = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(
      failedReason?.message?.includes('INSUFFICIENT_STOCK') || failedReason?.code === 'INSUFFICIENT_STOCK',
      'Failed checkout must fail with INSUFFICIENT_STOCK'
    );

    // Verify DB stock balance: on_hand = 1.0000, reserved = 1.0000, available = 0.0000
    const singleBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varSingle]
    );
    assert.strictEqual(Number(singleBal.rows[0].on_hand), 1);
    assert.strictEqual(Number(singleBal.rows[0].reserved), 1);
    assert.ok(Number(singleBal.rows[0].on_hand) >= Number(singleBal.rows[0].reserved), 'Cannot oversell inventory');

    markPassed('Audit 6: Inventory Concurrency & Oversell Protection (Stock=1 race: 1 success, 1 insufficient stock)');
  } catch (err) {
    markFailed('Audit 6: Inventory Concurrency & Oversell Protection', err);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Transaction Atomicity (Failure Rollback)
  // --------------------------------------------------------------------------
  try {
    const varRollback = 'var_audit_rollback_test';
    await db.query(`
      INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, retail_price, cost_price)
      VALUES ($1, $2, $3, 'SKU-ROLLBACK-1', 'BAR-ROLLBACK-1', 'Rollback Widget', 15.00, 5.00)
    `, [varRollback, orgAlpha, prodAlpha]);

    await db.query(`
      INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired)
      VALUES ('bal_rollback_1', $1, $2, $3, 10.0000, 0.0000, 0.0000, 0.0000)
    `, [orgAlpha, locAlpha, varRollback]);

    // Force failure by passing invalid customer_id
    let rollbackFailed = false;
    try {
      await orderService.placeStorefrontOrder({
        ...baseOrderParams,
        organization_id: orgAlpha,
        idempotency_key: crypto.randomUUID(),
        payment_method: 'Credit Card',
        fulfillment_method: 'Standard Delivery',
        location_id: locAlpha,
        customer_id: 'non_existent_customer_id',
        cart_items: [{ variant_id: varRollback, quantity: '3.0000' }],
      });
    } catch (err: any) {
      rollbackFailed = true;
    }
    assert.ok(rollbackFailed, 'Order with invalid customer must fail and rollback');

    // Verify no reservation created and reserved remains 0
    const balCheck = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varRollback]
    );
    assert.strictEqual(Number(balCheck.rows[0].reserved), 0, 'No ghost reservations after failed transaction');
    assert.strictEqual(Number(balCheck.rows[0].on_hand), 10);

    markPassed('Audit 7: Transaction Atomicity & Rollback (No orphaned reservations on error)');
  } catch (err) {
    markFailed('Audit 7: Transaction Atomicity & Rollback', err);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Idempotency Replay & Conflict Handling
  // --------------------------------------------------------------------------
  try {
    const key = crypto.randomUUID();

    // Request 1
    const order1 = await orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: key,
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varAlpha, quantity: '1.0000' }],
    });

    // Request 2 (Identical replay with same key)
    const order2 = await orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: key,
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varAlpha, quantity: '1.0000' }],
    });

    assert.strictEqual(order1.order.id, order2.order.id, 'Idempotent replay returns identical order');
    assert.strictEqual(order1.order.order_number, order2.order.order_number);

    // Request 3 (Different payload with same key -> IDEMPOTENCY_CONFLICT)
    let conflictThrown = false;
    try {
      await orderService.placeStorefrontOrder({
        ...baseOrderParams,
        organization_id: orgAlpha,
        idempotency_key: key,
        payment_method: 'Mobile Money', // Changed payment method
        fulfillment_method: 'Standard Delivery',
        location_id: locAlpha,
        cart_items: [{ variant_id: varAlpha, quantity: '1.0000' }],
      });
    } catch (err: any) {
      if (err.code === 'IDEMPOTENCY_CONFLICT') conflictThrown = true;
    }
    assert.ok(conflictThrown, 'Reusing key with different payload must throw IDEMPOTENCY_CONFLICT');

    markPassed('Audit 8: Idempotency Replay & Conflict Detection');
  } catch (err) {
    markFailed('Audit 8: Idempotency Replay & Conflict Detection', err);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Order Cancellation Lifecycle & Reservation Release
  // --------------------------------------------------------------------------
  try {
    const cancelOrderRes = await orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: crypto.randomUUID(),
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varAlpha, quantity: '2.0000' }],
    });

    const orderId = cancelOrderRes.order.id;

    // Check reserved before cancel
    const beforeCancelBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const resBefore = Number(beforeCancelBal.rows[0].reserved);
    const onHandBefore = Number(beforeCancelBal.rows[0].on_hand);

    // Cancel order
    const cancelled = await orderService.cancelStorefrontOrder(orgAlpha, orderId, 'Customer Service');
    assert.strictEqual(cancelled.status, 'Cancelled');

    // Check balance after cancel
    const afterCancelBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const resAfter = Number(afterCancelBal.rows[0].reserved);
    const onHandAfter = Number(afterCancelBal.rows[0].on_hand);

    assert.strictEqual(onHandAfter, onHandBefore, 'on_hand must remain unchanged on cancellation');
    assert.strictEqual(resBefore - resAfter, 2, 'reserved must decrease by cancelled quantity');

    // Check reservation status in DB
    const resRecords = await reservationService.listReservations(orgAlpha, {
      referenceType: 'orders',
      referenceId: orderId,
    });
    assert.strictEqual(resRecords[0].status, 'RELEASED');

    // Cancellation Idempotency: cancelling again is a no-op
    const cancelAgain = await orderService.cancelStorefrontOrder(orgAlpha, orderId, 'Customer Service');
    assert.strictEqual(cancelAgain.status, 'Cancelled');

    const balAfterRepeat = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    assert.strictEqual(Number(balAfterRepeat.rows[0].reserved), resAfter, 'Repeat cancellation must not double-decrement reserved');

    markPassed('Audit 9: Order Cancellation Lifecycle & Idempotent Stock Release');
  } catch (err) {
    markFailed('Audit 9: Order Cancellation Lifecycle & Idempotent Stock Release', err);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Order Fulfillment Lifecycle & Inventory Movement
  // --------------------------------------------------------------------------
  try {
    const fulfillOrderRes = await orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: crypto.randomUUID(),
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varAlpha, quantity: '1.0000' }],
    });

    const orderId = fulfillOrderRes.order.id;

    // Check stock before fulfill
    const beforeFulfillBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const onHandBefore = Number(beforeFulfillBal.rows[0].on_hand);
    const resBefore = Number(beforeFulfillBal.rows[0].reserved);

    // Fulfill order
    const fulfilled = await orderService.fulfillStorefrontOrder(orgAlpha, orderId, 'Warehouse Dispatcher');
    assert.strictEqual(fulfilled.status, 'Completed');

    // Check stock after fulfill
    const afterFulfillBal = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const onHandAfter = Number(afterFulfillBal.rows[0].on_hand);
    const resAfter = Number(afterFulfillBal.rows[0].reserved);

    assert.strictEqual(resBefore - resAfter, 1, 'reserved stock decremented on fulfillment');
    assert.strictEqual(onHandBefore - onHandAfter, 1, 'on_hand stock decremented on fulfillment');

    // Check reservation status
    const resRecords = await reservationService.listReservations(orgAlpha, {
      referenceType: 'orders',
      referenceId: orderId,
    });
    assert.strictEqual(resRecords[0].status, 'FULFILLED');

    // Verify inventory movement recorded
    const movements = await db.query<any>(
      `SELECT * FROM inventory_movements WHERE organization_id = $1 AND variant_id = $2 AND movement_type = 'POS_SALE' AND reference_id = $3`,
      [orgAlpha, varAlpha, orderId]
    );
    assert.strictEqual(movements.rows.length, 1, 'Inventory movement must be recorded exactly once');
    assert.strictEqual(Number(movements.rows[0].quantity_change), -1);

    // Fulfillment Idempotency: fulfilling again is a no-op
    const fulfillAgain = await orderService.fulfillStorefrontOrder(orgAlpha, orderId, 'Warehouse Dispatcher');
    assert.strictEqual(fulfillAgain.status, 'Completed');

    const balAfterRepeat = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    assert.strictEqual(Number(balAfterRepeat.rows[0].on_hand), onHandAfter, 'Repeat fulfillment must not double-decrement on_hand');
    assert.strictEqual(Number(balAfterRepeat.rows[0].reserved), resAfter, 'Repeat fulfillment must not double-decrement reserved');

    markPassed('Audit 10: Order Fulfillment Lifecycle & Idempotent Stock Deduction');
  } catch (err) {
    markFailed('Audit 10: Order Fulfillment Lifecycle & Idempotent Stock Deduction', err);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Cancellation vs Fulfillment Race & Lock Integrity
  // --------------------------------------------------------------------------
  try {
    const raceOrderRes = await orderService.placeStorefrontOrder({
      ...baseOrderParams,
      organization_id: orgAlpha,
      idempotency_key: crypto.randomUUID(),
      payment_method: 'Credit Card',
      fulfillment_method: 'Standard Delivery',
      location_id: locAlpha,
      cart_items: [{ variant_id: varAlpha, quantity: '1.0000' }],
    });

    const raceOrderId = raceOrderRes.order.id;

    // Launch cancel and fulfill concurrently
    const cancelOp = orderService.cancelStorefrontOrder(orgAlpha, raceOrderId, 'Customer Agent');
    const fulfillOp = orderService.fulfillStorefrontOrder(orgAlpha, raceOrderId, 'Warehouse Agent');

    const raceResults = await Promise.allSettled([cancelOp, fulfillOp]);

    const wonCancel = raceResults[0].status === 'fulfilled';
    const wonFulfill = raceResults[1].status === 'fulfilled';

    // Exactly one operation must succeed, or if one won, the second must be rejected with INVALID_ORDER_STATE
    assert.ok(
      (wonCancel && !wonFulfill) || (!wonCancel && wonFulfill),
      'Exactly one operation must win the cancel vs fulfill race'
    );

    // Terminal state of order must be consistent
    const finalOrder = await orderRepo.findOrderById(raceOrderId, orgAlpha);
    assert.ok(
      finalOrder?.order.status === 'Cancelled' || finalOrder?.order.status === 'Completed',
      'Order must end in a single valid terminal state'
    );

    // Verify reserved is never negative
    const balRace = await db.query<any>(
      `SELECT reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    assert.ok(Number(balRace.rows[0].reserved) >= 0, 'reserved stock must never drop below 0');

    markPassed('Audit 11: Cancellation vs Fulfillment Race (Row lock produces single terminal state)');
  } catch (err) {
    markFailed('Audit 11: Cancellation vs Fulfillment Race', err);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Reservation Expiry Worker Investigation
  // --------------------------------------------------------------------------
  try {
    // Create an expired reservation directly in the DB
    const resId = `res_exp_${crypto.randomUUID()}`;
    const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour in the past

    // Manually add 2 to reserved for this test
    await db.query(
      `UPDATE inventory_balances SET reserved = reserved + 2.0000 WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );

    await db.query(`
      INSERT INTO inventory_reservations (id, organization_id, location_id, variant_id, quantity, reference_type, reference_id, status, idempotency_key, expires_at, created_by)
      VALUES ($1, $2, $3, $4, 2.0000, 'orders', 'fake_order_exp_1', 'ACTIVE', $5, $6, 'Audit System')
    `, [resId, orgAlpha, locAlpha, varAlpha, `idem-exp-${resId}`, pastDate]);

    // Check reserved before expiry worker
    const balBeforeExp = await db.query<any>(
      `SELECT reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const resBeforeExp = Number(balBeforeExp.rows[0].reserved);

    // Run expiry worker
    const expiryResult = await reservationService.expireStaleReservations(orgAlpha);
    assert.ok(expiryResult.expiredCount >= 1, 'Should expire at least 1 reservation');
    assert.ok(expiryResult.reservationIds.includes(resId));

    // Verify reservation status is EXPIRED
    const expiredRes = await reservationRepo.findById(orgAlpha, resId);
    assert.strictEqual(expiredRes?.status, 'EXPIRED');

    // Verify reserved balance was decremented
    const balAfterExp = await db.query<any>(
      `SELECT reserved FROM inventory_balances WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3`,
      [orgAlpha, locAlpha, varAlpha]
    );
    const resAfterExp = Number(balAfterExp.rows[0].reserved);
    assert.strictEqual(resBeforeExp - resAfterExp, 2, 'Expiry worker correctly returned 2 reserved units');

    markPassed('Audit 12: Reservation Expiry Worker (Releases reserved stock on timeout)');
  } catch (err) {
    markFailed('Audit 12: Reservation Expiry Worker', err);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` AUDIT DEEP VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running audit deep verification:', err);
  process.exit(1);
});
