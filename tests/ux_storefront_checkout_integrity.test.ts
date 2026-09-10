process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrator.ts';
import { createApp } from '../server.ts';
import { UserRepository } from '../server/repositories/userRepository.ts';
import { CustomerRepository } from '../server/repositories/customerRepository.ts';
import { AuditRepository } from '../server/repositories/auditRepository.ts';
import { AuthService } from '../server/services/authService.ts';
import { hashPassword } from '../server/auth/password.ts';

async function runStorefrontCheckoutIntegrityTests() {
  console.log('========================================================================');
  console.log(' UX-001 Phase 2.2C R2 — Storefront Checkout Integrity & Gate Tests');
  console.log('========================================================================');

  let passed = 0;
  let failed = 0;

  function markPassed(testName: string) {
    console.log(`  [PASSED] ${testName}`);
    passed++;
  }

  function markFailed(testName: string, err: any) {
    console.error(`  [FAILED] ${testName}`);
    console.error(err);
    failed++;
  }

  // 1. Setup Database
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  await runMigrations(db);

  // Seed organizations, locations, customers, categories, products, variants, stock balances
  await db.exec(`
    INSERT INTO organizations (id, name, code, is_active) VALUES
      ('org_store_alpha', 'Store Org Alpha', 'STORE_ALPHA', TRUE),
      ('org_store_beta', 'Store Org Beta', 'STORE_BETA', TRUE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO locations (id, organization_id, code, name, type, is_pos_enabled, is_active) VALUES
      ('loc_alpha_wh', 'org_store_alpha', 'ALPHA_WH', 'Alpha Warehouse', 'Warehouse', FALSE, TRUE),
      ('loc_alpha_inactive', 'org_store_alpha', 'ALPHA_INACTIVE', 'Alpha Inactive Branch', 'Warehouse', FALSE, FALSE),
      ('loc_beta_wh', 'org_store_beta', 'BETA_WH', 'Beta Warehouse', 'Warehouse', FALSE, TRUE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customers (id, organization_id, name, email, phone) VALUES
      ('cust_alpha_1', 'org_store_alpha', 'Alpha Shopper', 'alpha@shopper.test', '+123456789'),
      ('cust_beta_1', 'org_store_beta', 'Beta Shopper', 'beta@shopper.test', '+987654321')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO categories (id, organization_id, name, slug) VALUES
      ('cat_alpha', 'org_store_alpha', 'Alpha Category', 'alpha-cat'),
      ('cat_beta', 'org_store_beta', 'Beta Category', 'beta-cat')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO products (id, organization_id, category_id, name, slug, description, status, tax_rate, unit_code, product_type) VALUES
      ('prod_alpha_active', 'org_store_alpha', 'cat_alpha', 'Active Item', 'active-item', 'active desc', 'active', '15.00', 'PCS', 'standard'),
      ('prod_alpha_inactive', 'org_store_alpha', 'cat_alpha', 'Inactive Item', 'inactive-item', 'inactive desc', 'inactive', '15.00', 'PCS', 'standard'),
      ('prod_beta_active', 'org_store_beta', 'cat_beta', 'Beta Active Item', 'beta-active', 'beta active desc', 'active', '15.00', 'PCS', 'standard')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price) VALUES
      ('var_alpha_active_1', 'org_store_alpha', 'prod_alpha_active', 'SKU-ALPHA-1', 'BAR-ALPHA-1', 'Active Variant 1', '10.00', '20.00'),
      ('var_alpha_active_2', 'org_store_alpha', 'prod_alpha_active', 'SKU-ALPHA-2', 'BAR-ALPHA-2', 'Active Variant 2', '15.00', '30.00'),
      ('var_alpha_inactive_1', 'org_store_alpha', 'prod_alpha_inactive', 'SKU-ALPHA-INACTIVE', 'BAR-ALPHA-INACTIVE', 'Inactive Variant', '5.00', '10.00'),
      ('var_beta_active_1', 'org_store_beta', 'prod_beta_active', 'SKU-BETA-1', 'BAR-BETA-1', 'Beta Variant 1', '40.00', '80.00')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit) VALUES
      ('bal_alpha_1', 'org_store_alpha', 'loc_alpha_wh', 'var_alpha_active_1', '100.0000', '0.0000', '0.0000', '0.0000', '0.0000'),
      ('bal_alpha_2', 'org_store_alpha', 'loc_alpha_wh', 'var_alpha_active_2', '5.0000', '0.0000', '0.0000', '0.0000', '0.0000'),
      ('bal_beta_1', 'org_store_beta', 'loc_beta_wh', 'var_beta_active_1', '50.0000', '0.0000', '0.0000', '0.0000', '0.0000')
    ON CONFLICT (id) DO NOTHING;
  `);

  const userRepo = new UserRepository(db);
  const customerRepo = new CustomerRepository(db);
  const auditRepo = new AuditRepository(db);
  const authService = new AuthService(userRepo, auditRepo);

  // Setup alpha storefront user
  const customerAlphaHash = hashPassword('CustomerPass123!');
  await userRepo.createUser({
    organizationId: 'org_store_alpha',
    email: 'shopper.alpha@test.com',
    name: 'Shopper Alpha',
    passwordHash: customerAlphaHash.hash,
    passwordSalt: customerAlphaHash.salt,
    role: 'viewer', // Storefront user has 'viewer' role
  });

  const shopperLogin = await authService.login({
    email: 'shopper.alpha@test.com',
    password: 'CustomerPass123!',
    organizationId: 'org_store_alpha',
  });
  const shopperToken = shopperLogin.token;

  // Setup Express server
  const { app } = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -----------------------------------------------------------------
    // SECTION 1: QUANTITY INPUT VALIDATION
    // -----------------------------------------------------------------
    try {
      // 1a. String quantity accepted
      const res1a = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '2.0000' }],
        }),
      });
      assert.strictEqual(res1a.status, 201);
      const json1a = await res1a.json();
      assert.strictEqual(json1a.success, true);

      // 1b. Number quantity strictly rejected
      const res1b = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: 2 }],
        }),
      });
      assert.strictEqual(res1b.status, 400);
      const json1b = await res1b.json();
      assert.strictEqual(json1b.error.code, 'VALIDATION_ERROR');
      assert.match(json1b.error.message, /Quantity must be supplied as a decimal string/i);

      // 1c. Null quantity strictly rejected
      const res1c = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: null }],
        }),
      });
      assert.strictEqual(res1c.status, 400);

      // 1d. Malformed string rejected
      const res1d = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '2.abc' }],
        }),
      });
      assert.strictEqual(res1d.status, 400);

      // 1e. Excessive precision rejected
      const res1e = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '2.12345' }],
        }),
      });
      assert.strictEqual(res1e.status, 400);

      markPassed('Quantity Input Validation');
    } catch (err) {
      markFailed('Quantity Input Validation', err);
    }

    // -----------------------------------------------------------------
    // SECTION 2: IDEMPOTENCY SAFEGUARDS & CONCURRENCY
    // -----------------------------------------------------------------
    try {
      // 2a. Missing key rejected
      const res2a = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '2.0000' }],
        }),
      });
      assert.strictEqual(res2a.status, 400);
      const json2a = await res2a.json();
      assert.match(json2a.error.message, /Idempotency key/i);

      // 2b. Malformed key rejected
      const res2b = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: 'not-a-valid-uuid',
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '2.0000' }],
        }),
      });
      assert.strictEqual(res2b.status, 400);

      // 2c. First succeeds and Identical replay succeeds (returning cached values)
      const testKey = crypto.randomUUID();
      const payload = {
        idempotency_key: testKey,
        fulfillmentMethod: 'Standard Delivery',
        paymentMethod: 'Credit Card',
        cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
      };

      const res2c_1 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res2c_1.status, 201);
      const json2c_1 = await res2c_1.json();
      const firstOrderId = json2c_1.data.id;

      const res2c_2 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res2c_2.status, 201);
      const json2c_2 = await res2c_2.json();
      assert.strictEqual(json2c_2.data.id, firstOrderId, 'Identical replay must return matching order ID');

      // 2d. Modified replay returns 409
      const modifiedPayload = {
        idempotency_key: testKey,
        fulfillmentMethod: 'In-Store Pickup', // modified parameter
        paymentMethod: 'Credit Card',
        cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
      };
      const res2d = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(modifiedPayload),
      });
      assert.strictEqual(res2d.status, 409);
      const json2d = await res2d.json();
      assert.strictEqual(json2d.error.code, 'IDEMPOTENCY_CONFLICT');

      // 2e. Race-safe concurrency check: parallel requests produce exactly one order, one payment, one stock reservation
      const concurrencyKey = crypto.randomUUID();
      const concurrentPayload = {
        idempotency_key: concurrencyKey,
        fulfillmentMethod: 'Standard Delivery',
        paymentMethod: 'Credit Card',
        cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
      };

      // Query initial stock balance before concurrent requests
      const preReservations = await db.query<any>(
        `SELECT on_hand FROM inventory_balances WHERE variant_id = 'var_alpha_active_1'`
      );
      const preOnHand = parseFloat(preReservations.rows[0].on_hand);

      // Dispatched concurrent duplicate requests in parallel
      const reqPromises = Array.from({ length: 4 }).map(() =>
        fetch(`${baseUrl}/api/orders`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(concurrentPayload),
        })
      );

      const results = await Promise.all(reqPromises);
      const statuses = results.map((r) => r.status);

      // Verify at least one succeeds (others may 201 replay or 409 depending on exact race execution order)
      const createdCount = statuses.filter((s) => s === 201).length;
      assert.ok(createdCount >= 1);

      // Verify that ONLY ONE order record actually exists in the DB under this concurrencyKey
      const dbOrders = await db.query<any>(
        `SELECT id FROM orders WHERE idempotency_key = $1`,
        [concurrencyKey]
      );
      assert.strictEqual(dbOrders.rows.length, 1, 'Exactly one order record must exist in the database for the idempotency key.');

      // Verify that ONLY ONE payment transaction exists
      const orderId = dbOrders.rows[0].id;
      const dbPayments = await db.query<any>(
        `SELECT id FROM payments WHERE order_id = $1`,
        [orderId]
      );
      assert.strictEqual(dbPayments.rows.length, 1, 'Exactly one payment record must exist in the database.');

      // Verify that ONLY ONE stock reservation/decrement occurred (by checking the relative decrease is exactly 1.0000)
      const postReservations = await db.query<any>(
        `SELECT on_hand FROM inventory_balances WHERE variant_id = 'var_alpha_active_1'`
      );
      const postOnHand = parseFloat(postReservations.rows[0].on_hand);
      assert.strictEqual(preOnHand - postOnHand, 1.0000, 'Exactly 1.0000 stock deduction must have occurred.');

      markPassed('Idempotency Safeguards & Concurrency');
    } catch (err) {
      markFailed('Idempotency Safeguards & Concurrency', err);
    }

    // -----------------------------------------------------------------
    // SECTION 3: HONEST PAYMENT LIFECYCLE & STATES
    // -----------------------------------------------------------------
    try {
      const paymentTestKey = crypto.randomUUID();
      // Client attempts to force 'Paid' status in payload
      const res3 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: paymentTestKey,
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          payment_status: 'Paid', // Tampering try
          status: 'Completed', // Tampering try
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res3.status, 201);
      const json3 = await res3.json();

      // Verify honest status is mapped server-side to 'Pending' / 'Stock Reserved' instead of client-supplied 'Paid' / 'Completed'
      assert.strictEqual(json3.data.payment_status, 'Pending');
      assert.strictEqual(json3.data.status, 'Stock Reserved');
      assert.strictEqual(json3.data.payments[0].status, 'Pending');

      // Verify no random fake transaction references or provider identifiers are fabricated
      const dbPayment = await db.query<any>(
        `SELECT reference FROM payments WHERE order_id = $1`,
        [json3.data.id]
      );
      assert.strictEqual(dbPayment.rows[0].reference, json3.data.order_number, 'Reference must match order number or be clean.');

      markPassed('Honest Payment Lifecycle & States');
    } catch (err) {
      markFailed('Honest Payment Lifecycle & States', err);
    }

    // -----------------------------------------------------------------
    // SECTION 4: TENANT & LOCATION SELECTION
    // -----------------------------------------------------------------
    try {
      // 4a. Valid active location succeeds
      const res4a = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          location_id: 'loc_alpha_wh', // Alpha tenant's valid active warehouse
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res4a.status, 201);

      // 4b. Inactive location rejected
      const res4b = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          location_id: 'loc_alpha_inactive', // inactive
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res4b.status, 400);
      const json4b = await res4b.json();
      assert.match(json4b.error.message, /inactive/i);

      // 4c. Foreign-tenant location rejected (Beta tenant location)
      const res4c = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          location_id: 'loc_beta_wh', // Beta's location
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res4c.status, 400);
      const json4c = await res4c.json();
      assert.match(json4c.error.message, /not found under this organization/i);

      markPassed('Tenant & Location Selection Boundaries');
    } catch (err) {
      markFailed('Tenant & Location Selection Boundaries', err);
    }

    // -----------------------------------------------------------------
    // SECTION 5: COUPON REJECTION (SINCE DATABASE LACKS COUPON SCHEMA)
    // -----------------------------------------------------------------
    try {
      const res5 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          discount_code: 'SAVE50', // arbitrary coupon code
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res5.status, 400);
      const json5 = await res5.json();
      assert.strictEqual(json5.error.code, 'VALIDATION_ERROR');
      assert.match(json5.error.message, /Coupons\/discounts are not supported/i);

      markPassed('Coupon Rejection Rules');
    } catch (err) {
      markFailed('Coupon Rejection Rules', err);
    }

    // -----------------------------------------------------------------
    // SECTION 6: STOREFRONT SECURITY BOUNDARIES & TAMPERING SHIELDS
    // -----------------------------------------------------------------
    try {
      // 6a. Client price, subtotal, tax, total tampering must be bypassed/recalculated server-authoritatively
      const res6a = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          subtotal: '1.00', // tampered subtotal
          tax_amount: '0.00', // tampered tax
          total_amount: '1.00', // tampered total
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000', price: '5.00' }], // tampered price
        }),
      });
      assert.strictEqual(res6a.status, 201);
      const json6a = await res6a.json();
      // Alpha active variant 1 has retail_price of 20.00, and organization has tax of 15.00%
      // Server must calculate retail: subtotal = 20.00, tax = 3.00, shipping = 5.00, total = 28.00
      assert.strictEqual(json6a.data.subtotal, '20.00');
      assert.strictEqual(json6a.data.tax_amount, '3.00');
      assert.strictEqual(json6a.data.shipping_fee, '5.00');
      assert.strictEqual(json6a.data.total_amount, '28.00');

      // 6b. Unauthorized checkout (no token) must be rejected
      const res6b = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res6b.status, 401);

      // 6c. Cross-tenant product Variant (Beta variant 1 requested by Alpha tenant Shopper)
      const res6c = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_beta_active_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res6c.status, 404);
      const json6c = await res6c.json();
      assert.strictEqual(json6c.error.code, 'PRODUCT_NOT_FOUND', 'Cross-tenant variants must fail as PRODUCT_NOT_FOUND.');

      // 6d. Ordering inactive product Variant (var_alpha_inactive_1)
      const res6d = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_inactive_1', quantity: '1.0000' }],
        }),
      });
      assert.strictEqual(res6d.status, 404);
      const json6d = await res6d.json();
      assert.strictEqual(json6d.error.code, 'PRODUCT_NOT_FOUND', 'Inactive variants must fail as PRODUCT_NOT_FOUND.');

      markPassed('Storefront Security Boundaries & Tampering Shields');
    } catch (err) {
      markFailed('Storefront Security Boundaries & Tampering Shields', err);
    }

    // -----------------------------------------------------------------
    // SECTION 7: PRODUCTION ERROR REDACTION & LEAK PROTECTION
    // -----------------------------------------------------------------
    try {
      // 7a. Malformed request body should trigger a safe response
      const res7a = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: '{"invalid-json-body": ',
      });
      // JSON parser error is an arbitrary exception caught by express/routing
      assert.strictEqual(res7a.status, 400);
      const text7a = await res7a.text();
      // Ensure no system paths or node_modules or SQL statements are leaked
      assert.ok(!text7a.includes('node_modules'), 'Must not leak file system directories');
      assert.ok(!text7a.includes('SQL'), 'Must not leak SQL details');
      assert.ok(!text7a.includes('/home/') && !text7a.includes('/usr/'), 'Must not leak server paths');

      // 7b. Safe domain error checking
      const res7b = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shopperToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          fulfillmentMethod: 'Standard Delivery',
          paymentMethod: 'Credit Card',
          cart_items: [{ variant_id: 'var_alpha_active_2', quantity: '10.0000' }], // insufficient stock (only 5 on hand)
        }),
      });
      assert.strictEqual(res7b.status, 400);
      const json7b = await res7b.json();
      assert.strictEqual(json7b.error.code, 'INSUFFICIENT_STOCK');
      // Verify no internal stack traces are included
      assert.ok(!JSON.stringify(json7b).includes('at '), 'Domain errors must not leak stack traces.');

      markPassed('Production Error Redaction & Leak Protection');
    } catch (err) {
      markFailed('Production Error Redaction & Leak Protection', err);
    }

  } finally {
    server.close();
  }

  console.log('========================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStorefrontCheckoutIntegrityTests().catch((e) => {
  console.error('Checkout Test runner encountered unexpected error:', e);
  process.exit(1);
});
