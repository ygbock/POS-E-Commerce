process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { AuthService } from '../server/services/authService';
import { InventoryRepository } from '../server/repositories/inventoryRepository';
import { InventoryMovementRepository } from '../server/repositories/inventoryMovementRepository';
import { InventoryReservationRepository } from '../server/repositories/inventoryReservationRepository';
import { InventoryTransferRepository } from '../server/repositories/inventoryTransferRepository';
import { UserRepository } from '../server/repositories/userRepository';
import { OrderRepository } from '../server/repositories/orderRepository';
import { PosRepository } from '../server/repositories/posRepository';
import { AuditRepository } from '../server/repositories/auditRepository';
import { InventoryService } from '../server/inventory/inventoryService';
import { ReservationService } from '../server/inventory/reservationService';
import { TransferService } from '../server/inventory/transferService';
import { PosService } from '../server/services/posService';
import { hashPassword } from '../server/auth/password';

async function runQaVerificationTests() {
  console.log('======================================================');
  console.log(' QA-001R1 Immutable Ledger & Verification Tests');
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

  // Initialize DB and Migrations
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  await runMigrations(db);

  // Seed baseline data
  await db.exec(`
    INSERT INTO organizations (id, name, code, is_active) VALUES 
      ('org_qa_a', 'QA Org A', 'QA_ORG_A', TRUE),
      ('org_qa_b', 'QA Org B', 'QA_ORG_B', TRUE),
      ('org_qa_inactive', 'QA Org Inactive', 'QA_ORG_INACTIVE', FALSE);

    INSERT INTO units_of_measure (id, organization_id, code, name, category) VALUES
      ('uom_qa_kg_a', 'org_qa_a', 'KG', 'Kilogram', 'Weight'),
      ('uom_qa_kg_b', 'org_qa_b', 'KG', 'Kilogram', 'Weight');

    INSERT INTO locations (id, organization_id, code, name, type) VALUES
      ('loc_qa_wh_a', 'org_qa_a', 'WHA', 'QA Warehouse A', 'Warehouse'),
      ('loc_qa_store_a', 'org_qa_a', 'STA', 'QA Store A', 'Retail Store'),
      ('loc_qa_wh_b', 'org_qa_b', 'WHB', 'QA Warehouse B', 'Warehouse');

    INSERT INTO products (id, organization_id, name, slug, unit_code, product_type) VALUES
      ('prod_qa_a1', 'org_qa_a', 'QA Beans A', 'qa-beans-a', 'KG', 'standard'),
      ('prod_qa_b1', 'org_qa_b', 'QA Beans B', 'qa-beans-b', 'KG', 'standard');

    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price) VALUES
      ('var_qa_a1', 'org_qa_a', 'prod_qa_a1', 'SKU-QA-A1', 'BAR-QA-A1', 'QA 1kg Bag', 10.00, 20.00),
      ('var_qa_b1', 'org_qa_b', 'prod_qa_b1', 'SKU-QA-B1', 'BAR-QA-B1', 'QA B1 Bag', 12.00, 24.00);
  `);

  const inventoryRepo = new InventoryRepository(db);
  const movementRepo = new InventoryMovementRepository(db);
  const reservationRepo = new InventoryReservationRepository(db);
  const transferRepo = new InventoryTransferRepository(db);
  const userRepo = new UserRepository(db);
  const orderRepo = new OrderRepository(db);
  const posRepo = new PosRepository(db);
  const auditRepo = new AuditRepository(db);

  const inventoryService = new InventoryService(inventoryRepo, movementRepo, db);
  const reservationService = new ReservationService(inventoryRepo, reservationRepo, db);
  const transferService = new TransferService(inventoryRepo, transferRepo, db);
  const posService = new PosService(posRepo, orderRepo, inventoryRepo, auditRepo, db);
  const authService = new AuthService(db);

  // Setup test users
  const { hash: adminHash, salt: adminSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: 'usr_qa_admin_a',
    organization_id: 'org_qa_a',
    email: 'admin_qa_a@abacha.test',
    name: 'QA Admin Org A',
    password_hash: adminHash,
    password_salt: adminSalt,
    role: 'admin',
    is_active: true,
  });

  const { hash: superHash, salt: superSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: 'usr_qa_super',
    organization_id: 'org_qa_a',
    email: 'super_qa@abacha.test',
    name: 'QA Super Admin',
    password_hash: superHash,
    password_salt: superSalt,
    role: 'super_admin',
    is_active: true,
  });

  const { hash: cashierHash, salt: cashierSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: 'usr_qa_cashier_a',
    organization_id: 'org_qa_a',
    email: 'cashier_qa_a@abacha.test',
    name: 'QA Cashier Org A',
    password_hash: cashierHash,
    password_salt: cashierSalt,
    role: 'cashier',
    is_active: true,
  });

  const { hash: orgBHash, salt: orgBSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: 'usr_qa_admin_b',
    organization_id: 'org_qa_b',
    email: 'admin_qa_b@abacha.test',
    name: 'QA Admin Org B',
    password_hash: orgBHash,
    password_salt: orgBSalt,
    role: 'admin',
    is_active: true,
  });

  // Start HTTP Server
  const { app } = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // =========================================================================
  // SECTION 1: IMMUTABLE INVENTORY LEDGER & CONSERVATION INVARIANTS
  // =========================================================================
  try {
    // 1. Opening Balance Conservation
    const openRes = await inventoryService.recordOpeningBalance(
      'org_qa_a',
      {
        location_id: 'loc_qa_wh_a',
        variant_id: 'var_qa_a1',
        quantity: '100.0000',
        unit_cost: '10.00',
        idempotency_key: 'idem_qa_open_1',
      },
      'usr_qa_admin_a'
    );
    assert.strictEqual(openRes.balance.on_hand, '100.0000', 'Opening balance should match input exactly');
    assert.strictEqual(openRes.movement.previous_balance, '0.0000');
    assert.strictEqual(openRes.movement.new_balance, '100.0000');

    // Formula Verification: previous_balance + quantity_delta = new_balance
    // 0.0000 + 100.0000 = 100.0000
    assert.strictEqual(
      (parseFloat(openRes.movement.previous_balance) + parseFloat(openRes.movement.quantity_change)).toFixed(4),
      parseFloat(openRes.movement.new_balance).toFixed(4),
      'ledger conservation invariant formula verified'
    );

    // 2. Adjustment Conservation (Upward)
    const adjUp = await inventoryService.recordAdjustment(
      'org_qa_a',
      {
        location_id: 'loc_qa_wh_a',
        variant_id: 'var_qa_a1',
        quantity_change: '20.0000',
        reason: 'QA Audit Bonus',
        idempotency_key: 'idem_qa_adj_up',
      },
      'usr_qa_admin_a'
    );
    assert.strictEqual(adjUp.balance.on_hand, '120.0000');
    assert.strictEqual(adjUp.movement.previous_balance, '100.0000');
    assert.strictEqual(adjUp.movement.new_balance, '120.0000');
    assert.strictEqual(
      (parseFloat(adjUp.movement.previous_balance) + parseFloat(adjUp.movement.quantity_change)).toFixed(4),
      parseFloat(adjUp.movement.new_balance).toFixed(4),
      'Upward adjustment ledger conservation verified'
    );

    // 3. Quarantine (Damage & Expiry) and Write-off
    // Quarantine 5 damaged
    const qDam = await inventoryService.quarantineStock(
      'org_qa_a',
      {
        location_id: 'loc_qa_wh_a',
        variant_id: 'var_qa_a1',
        quantity: '5.0000',
        type: 'damage',
        reason: 'Water spill',
      },
      'usr_qa_admin_a'
    );
    assert.strictEqual(qDam.on_hand, '120.0000');
    assert.strictEqual(qDam.damaged, '5.0000');
    assert.strictEqual(qDam.available, '115.0000');

    // Write-off 5 damaged
    const wOff = await inventoryService.writeOffStock(
      'org_qa_a',
      {
        location_id: 'loc_qa_wh_a',
        variant_id: 'var_qa_a1',
        quantity: '5.0000',
        type: 'damage',
        reason: 'Scrapped damaged bags',
      },
      'usr_qa_admin_a'
    );
    assert.strictEqual(wOff.balance.on_hand, '115.0000');
    assert.strictEqual(wOff.balance.damaged, '0.0000');
    assert.strictEqual(wOff.balance.available, '115.0000');
    assert.strictEqual(wOff.movement.previous_balance, '120.0000');
    assert.strictEqual(wOff.movement.new_balance, '115.0000');
    assert.strictEqual(
      (parseFloat(wOff.movement.previous_balance) + parseFloat(wOff.movement.quantity_change)).toFixed(4),
      parseFloat(wOff.movement.new_balance).toFixed(4),
      'Write-off ledger conservation verified'
    );

    // 4. Transfer Conservation (dispatched = received + variance)
    // WH A on_hand: 115, Store A on_hand: 0
    const { transfer } = await transferService.createTransfer(
      'org_qa_a',
      {
        transfer_number: 'QA-TR-101',
        source_location_id: 'loc_qa_wh_a',
        destination_location_id: 'loc_qa_store_a',
        items: [{ variant_id: 'var_qa_a1', requested_quantity: '40.0000' }],
      },
      'usr_qa_admin_a'
    );

    await transferService.approveTransfer('org_qa_a', transfer.id, 'usr_qa_admin_a');

    // Dispatch
    await transferService.dispatchTransfer('org_qa_a', transfer.id, undefined, 'usr_qa_admin_a');
    // Verify Dispatch Balances:
    const dispatchWhBal = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    const dispatchStoreBal = await inventoryService.getBalance('org_qa_a', 'loc_qa_store_a', 'var_qa_a1');
    assert.strictEqual(dispatchWhBal!.on_hand, '75.0000', 'Source on-hand decremented by 40');
    assert.strictEqual(dispatchStoreBal!.in_transit, '40.0000', 'Destination in-transit incremented by 40');

    // Receive with variance (receive 35, variance -5)
    await transferService.receiveTransfer(
      'org_qa_a',
      transfer.id,
      { 'var_qa_a1': '35.0000' },
      'usr_qa_admin_a',
      'Damaged in transit'
    );

    const receiveWhBal = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    const receiveStoreBal = await inventoryService.getBalance('org_qa_a', 'loc_qa_store_a', 'var_qa_a1');

    assert.strictEqual(receiveStoreBal!.in_transit, '0.0000', 'Destination In-transit fully cleared');
    assert.strictEqual(receiveStoreBal!.on_hand, '35.0000', 'Destination on-hand incremented by received');
    
    // Formula Verification: dispatched (40) = received (35) + variance (5)
    const dbTransferItems = await db.query(
      `SELECT dispatched_quantity, received_quantity, variance_quantity FROM inventory_transfer_items WHERE transfer_id = $1`,
      [transfer.id]
    );
    const item = dbTransferItems.rows[0];
    assert.strictEqual(item.dispatched_quantity, '40.0000');
    assert.strictEqual(item.received_quantity, '35.0000');
    assert.strictEqual(item.variance_quantity, '-5.0000');
    assert.strictEqual(
      (parseFloat(item.received_quantity) + Math.abs(parseFloat(item.variance_quantity))).toFixed(4),
      parseFloat(item.dispatched_quantity).toFixed(4),
      'Transfer conservation invariant formula verified'
    );

    // 5. Reservation Conservation: available = on_hand - reserved - damaged - expired
    // WH A on_hand: 75, reserved: 0, damaged: 0, expired: 0, available: 75
    const resv = await reservationService.createReservation(
      'org_qa_a',
      {
        location_id: 'loc_qa_wh_a',
        variant_id: 'var_qa_a1',
        quantity: '20.0000',
        reference_type: 'ORDER',
        reference_id: 'ord_qa_resv_1',
      },
      'usr_qa_admin_a'
    );
    const balAfterResv = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    assert.strictEqual(balAfterResv!.on_hand, '75.0000');
    assert.strictEqual(balAfterResv!.reserved, '20.0000');
    assert.strictEqual(balAfterResv!.available, '55.0000');
    assert.strictEqual(
      (parseFloat(balAfterResv!.on_hand) - parseFloat(balAfterResv!.reserved) - parseFloat(balAfterResv!.damaged) - parseFloat(balAfterResv!.expired)).toFixed(4),
      parseFloat(balAfterResv!.available).toFixed(4),
      'Reservation conservation formula verified'
    );

    // 6. Negative Stock Protection
    // Attempting to adjust below available stock with allowNegativeStock = false must fail
    await assert.rejects(
      async () => {
        await inventoryService.recordAdjustment(
          'org_qa_a',
          {
            location_id: 'loc_qa_wh_a',
            variant_id: 'var_qa_a1',
            quantity_change: '-60.0000', // exceeds available 55
            reason: 'Excessive adjustment',
            allowNegativeStock: false,
          },
          'usr_qa_admin_a'
        );
      },
      /INSUFFICIENT_STOCK|RESERVATION_BREACH/
    );

    markPassed('1. Immutable Inventory Ledger & Conservation Invariants');
  } catch (err) {
    markFailed('1. Immutable Inventory Ledger & Conservation Invariants', err);
  }

  // =========================================================================
  // SECTION 2: GENUINE CONCURRENCY TESTS
  // =========================================================================
  try {
    // 1. Concurrent Stock Deductions
    // Current WH A available: 55, on_hand: 75, reserved: 20
    // Fire 5 concurrent deductions of 10.0000. Total 50.0000. Should leave available: 5.0000
    const decPromises = Array.from({ length: 5 }).map((_, i) =>
      inventoryService.recordAdjustment(
        'org_qa_a',
        {
          location_id: 'loc_qa_wh_a',
          variant_id: 'var_qa_a1',
          quantity_change: '-10.0000',
          reason: `Concurrent deduction ${i}`,
          idempotency_key: `idem_qa_conc_dec_${i}`,
        },
        'usr_qa_admin_a'
      )
    );
    await Promise.all(decPromises);
    const balConcDec = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    assert.strictEqual(balConcDec!.on_hand, '25.0000', 'Final on-hand must be 25.0000');
    assert.strictEqual(balConcDec!.available, '5.0000', 'Final available must be 5.0000');

    // 2. Concurrent Reservations exceeding available stock
    // Available: 5. Attempt 3 concurrent reservations of 3.0000. Exactly 1 must succeed, 2 must fail with INSUFFICIENT_STOCK
    const resPromises = Array.from({ length: 3 }).map((_, i) =>
      reservationService.createReservation(
        'org_qa_a',
        {
          location_id: 'loc_qa_wh_a',
          variant_id: 'var_qa_a1',
          quantity: '3.0000',
          reference_type: 'ORDER',
          reference_id: `ord_conc_resv_excess_${i}`,
        },
        'usr_qa_admin_a'
      )
    );
    const resResults = await Promise.allSettled(resPromises);
    const fulfilledCount = resResults.filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = resResults.filter((r) => r.status === 'rejected').length;
    assert.strictEqual(fulfilledCount, 1, 'Exactly 1 concurrent reservation must succeed');
    assert.strictEqual(rejectedCount, 2, 'Exactly 2 concurrent reservations must be rejected');

    const balAfterConcRes = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    assert.strictEqual(balAfterConcRes!.reserved, '23.0000', 'Reserved must be 20 (original) + 3 (succeeded concurrent) = 23');
    assert.strictEqual(balAfterConcRes!.available, '2.0000', 'Available must be 2.0000');

    // 3. Concurrent Same-Key Idempotent Requests
    // Simultaneously fire two reservations with the same idempotency key
    const idemKey = `idem_qa_race_${Date.now()}`;
    const idemPromises = [
      reservationService.createReservation(
        'org_qa_a',
        {
          location_id: 'loc_qa_wh_a',
          variant_id: 'var_qa_a1',
          quantity: '1.0000',
          reference_type: 'ORDER',
          reference_id: 'ord_qa_race',
          idempotency_key: idemKey,
        },
        'usr_qa_admin_a'
      ),
      reservationService.createReservation(
        'org_qa_a',
        {
          location_id: 'loc_qa_wh_a',
          variant_id: 'var_qa_a1',
          quantity: '1.0000',
          reference_type: 'ORDER',
          reference_id: 'ord_qa_race',
          idempotency_key: idemKey,
        },
        'usr_qa_admin_a'
      ),
    ];
    const idemResults = await Promise.all(idemPromises);
    assert.strictEqual(idemResults[0].id, idemResults[1].id, 'Both concurrent same-key requests return identical ID');
    
    const dbCountCheck = await db.query(
      `SELECT COUNT(*)::int as cnt FROM inventory_reservations WHERE organization_id = 'org_qa_a' AND idempotency_key = $1`,
      [idemKey]
    );
    assert.strictEqual(dbCountCheck.rows[0].cnt, 1, 'Database should contain exactly one row');

    markPassed('2. Genuine Concurrency & Race-Safe Constraints');
  } catch (err) {
    markFailed('2. Genuine Concurrency & Race-Safe Constraints', err);
  }

  // =========================================================================
  // SECTION 3: TRANSACTION ROLLBACK & ATOMICITY (FAILURE INJECTION)
  // =========================================================================
  try {
    // Force a runtime error inside db transaction during manual stock counts to prove rollback
    const p1 = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    const startOnHand = p1!.on_hand;

    // Use raw query with deliberate constraint error inside manual transaction block to prove DB rollbacks properly
    await assert.rejects(
      async () => {
        await db.withTransaction(async (tx) => {
          // 1. Mutate
          await tx.query(
            `UPDATE inventory_balances SET on_hand = '999.0000' WHERE organization_id = 'org_qa_a' AND location_id = 'loc_qa_wh_a' AND variant_id = 'var_qa_a1'`
          );
          // 2. Explode (Deliberate check constraint violation)
          await tx.query(
            `INSERT INTO users (id, email, organization_id, password_hash, password_salt, role) VALUES 
              ('usr_broken', 'bad_email_format', 'org_qa_a', 'hash', 'salt', 'invalid_role')`
          );
        });
      },
      /check constraint|violates|invalid/i
    );

    // Verify state: earlier mutation MUST be rolled back
    const p2 = await inventoryService.getBalance('org_qa_a', 'loc_qa_wh_a', 'var_qa_a1');
    assert.strictEqual(p2!.on_hand, startOnHand, 'Transaction rollback successfully verified. Initial state preserved.');

    markPassed('3. Transaction Rollback & Atomicity (Failure Injection)');
  } catch (err) {
    markFailed('3. Transaction Rollback & Atomicity (Failure Injection)', err);
  }

  // =========================================================================
  // SECTION 4: POINT OF SALE CHECKOUT INTEGRATION SCENARIO
  // =========================================================================
  try {
    console.log('  [DEBUG POS] Starting Section 4: POS Checkout...');
    // 1. Authenticate user directly via service to obtain token
    console.log('  [DEBUG POS] Logging in...');
    const { token } = await authService.login({
      organizationId: 'org_qa_a',
      email: 'cashier_qa_a@abacha.test',
      password: 'Password123!',
    });
    console.log('  [DEBUG POS] Login successful! Token acquired.');

    // Ensure we have stock for var_qa_a1 at loc_qa_store_a for POS session
    // store currently has 35.0000.
    
    // 2. Open POS session
    console.log(`  [DEBUG POS] Opening POS session via POST ${baseUrl}/api/pos/sessions...`);
    const openSessRes = await fetch(`${baseUrl}/api/pos/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        locationId: 'loc_qa_store_a',
        terminalId: 'term_qa_1',
        openingCash: '100.00',
        idempotency_key: `idem_pos_open_${Date.now()}`,
      }),
    });
    console.log(`  [DEBUG POS] Open POS session response status: ${openSessRes.status}`);
    assert.strictEqual(openSessRes.status, 200);
    const sessBody = await openSessRes.json();
    console.log('  [DEBUG POS] Session opened body:', JSON.stringify(sessBody));
    const sessionId = sessBody.session.id;

    // 3. Create POS checkout order consuming inventory
    const checkoutRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        sessionId: sessionId,
        locationId: 'loc_qa_store_a',
        cartItems: [
          {
            variant_id: 'var_qa_a1',
            quantity: '5.0000',
          },
        ],
        paymentMethod: 'Cash',
        amountPaid: '100.00',
        idempotency_key: `idem_pos_checkout_${Date.now()}`,
      }),
    });
    assert.strictEqual(checkoutRes.status, 200);
    const checkoutBody = await checkoutRes.json();
    assert.strictEqual(checkoutBody.success, true);
    assert.strictEqual(checkoutBody.order.total_amount, '100.00');
    assert.strictEqual(checkoutBody.order.status, 'Completed');

    // Verify database state: Destination on_hand must be decremented from 35.0000 to 30.0000
    const finalStoreBal = await inventoryService.getBalance('org_qa_a', 'loc_qa_store_a', 'var_qa_a1');
    assert.strictEqual(finalStoreBal!.on_hand, '30.0000', 'Store on-hand decremented by checkout');

    markPassed('4. POS Checkout Integration Scenario (Lifecycle Verification)');
  } catch (err) {
    markFailed('4. POS Checkout Integration Scenario (Lifecycle Verification)', err);
  }

  // =========================================================================
  // SECTION 5: SECURITY REGRESSION TESTS
  // =========================================================================
  try {
    const cashierToken = (await authService.login({
      organizationId: 'org_qa_a',
      email: 'cashier_qa_a@abacha.test',
      password: 'Password123!',
    })).token;

    const orgBToken = (await authService.login({
      organizationId: 'org_qa_b',
      email: 'admin_qa_b@abacha.test',
      password: 'Password123!',
    })).token;

    const superToken = (await authService.login({
      organizationId: 'org_qa_a',
      email: 'super_qa@abacha.test',
      password: 'Password123!',
    })).token;

    // 1. Authentication Bypass
    const noAuthRes = await fetch(`${baseUrl}/api/inventory/balances/loc_qa_wh_a`, {
      headers: { Connection: 'close' },
    });
    assert.strictEqual(noAuthRes.status, 401, 'No Bearer token must yield 401');

    // 2. Authorization / RBAC Bypass
    // Cashier attempting manual adjustment (needs INVENTORY_ADJUST permission) -> 403
    const badRoleRes = await fetch(`${baseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_qa_wh_a',
        variant_id: 'var_qa_a1',
        quantity_change: '10',
        reason: 'Illegal cashier action',
      }),
    });
    assert.strictEqual(badRoleRes.status, 403, 'Role without permission must yield 403');

    // 3. Tenant Isolation
    // Org B Admin queries Org A location balance -> returns 0 items (scoped to tenant)
    const tenantRes = await fetch(`${baseUrl}/api/inventory/balances/loc_qa_wh_a`, {
      headers: { Authorization: `Bearer ${orgBToken}`, Connection: 'close' },
    });
    const tenantBody = await tenantRes.json();
    assert.strictEqual(tenantBody.count, 0, 'Cross tenant queries return empty payload');

    // 4. Inactive Tenant blocked from logging in
    await assert.rejects(
      async () => {
        await authService.login({
          organizationId: 'org_qa_inactive',
          email: 'admin_qa_a@abacha.test',
          password: 'Password123!',
        });
      },
      /INACTIVE_ORGANIZATION|INVALID_CREDENTIALS|Invalid email or password/
    );

    // 5. Super Admin Cross-Tenant Target (?orgId=)
    // Super admin queries Org B's Warehouse B balance
    const superCrossRes = await fetch(`${baseUrl}/api/inventory/balances/loc_qa_wh_b?orgId=org_qa_b`, {
      headers: { Authorization: `Bearer ${superToken}`, Connection: 'close' },
    });
    assert.strictEqual(superCrossRes.status, 200, 'Super admin cross-tenant selection succeeds');
    
    // Verify an audit event of type SUPER_ADMIN_CROSS_TENANT_READ is recorded
    const auditEvents = await db.query(
      `SELECT * FROM audit_events WHERE action = 'SUPER_ADMIN_CROSS_TENANT_READ' AND actor_id = 'usr_qa_super'`
    );
    assert.ok(auditEvents.rows.length > 0, 'Super admin cross-tenant reads are fully audited');

    markPassed('5. Security Regression Coverages (Tenant, RBAC, Super Admin)');
  } catch (err) {
    markFailed('5. Security Regression Coverages (Tenant, RBAC, Super Admin)', err);
  }

  // Final Reports
  console.log('======================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================');

  try {
    server.close();
    await db.close();
  } catch (e) {}

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runQaVerificationTests().catch((err) => {
  console.error('Fatal QA error:', err);
  process.exit(1);
});
