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
import { StockCountRepository } from '../server/repositories/stockCountRepository';
import { InventoryService } from '../server/inventory/inventoryService';
import { ReservationService } from '../server/inventory/reservationService';
import { TransferService } from '../server/inventory/transferService';
import { StockCountService } from '../server/inventory/stockCountService';
import { UserRepository } from '../server/repositories/userRepository';
import { hashPassword } from '../server/auth/password';
import { calculateAvailable, roundQty, addQty, subQty } from '../server/inventory/inventoryPolicies';

async function runInventoryTests() {
  console.log('======================================================');
  console.log(' Omnicore INV-001 Inventory Ledger & Operations Tests');
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

  // Clean test tables
  await db.exec(`
    DELETE FROM stock_count_items;
    DELETE FROM stock_counts;
    DELETE FROM inventory_transfer_items;
    DELETE FROM inventory_transfers;
    DELETE FROM inventory_reservations;
    DELETE FROM inventory_movements;
    DELETE FROM inventory_balances;
    DELETE FROM product_variants;
    DELETE FROM products;
    DELETE FROM units_of_measure;
    DELETE FROM locations;
    DELETE FROM users;
    DELETE FROM organizations;
  `);

  // Seed baseline test organizations and locations
  await db.exec(`
    INSERT INTO organizations (id, name, code, is_active) VALUES 
      ('org_inv_a', 'Inventory Org A', 'INV_ORG_A', TRUE),
      ('org_inv_b', 'Inventory Org B', 'INV_ORG_B', TRUE);

    INSERT INTO units_of_measure (id, organization_id, code, name, category) VALUES
      ('uom_kg_a', 'org_inv_a', 'KG', 'Kilogram', 'Weight'),
      ('uom_kg_b', 'org_inv_b', 'KG', 'Kilogram', 'Weight');

    INSERT INTO locations (id, organization_id, code, name, type) VALUES
      ('loc_wh_a', 'org_inv_a', 'WHA', 'Warehouse A', 'Warehouse'),
      ('loc_store_a', 'org_inv_a', 'STA', 'Store A', 'Retail Store'),
      ('loc_wh_b', 'org_inv_b', 'WHB', 'Warehouse B', 'Warehouse');

    INSERT INTO products (id, organization_id, name, slug, unit_code, product_type) VALUES
      ('prod_a1', 'org_inv_a', 'Omni Espresso Beans', 'omni-espresso-beans', 'KG', 'standard'),
      ('prod_b1', 'org_inv_b', 'Competitor Beans', 'competitor-beans', 'KG', 'standard');

    INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price) VALUES
      ('var_a1', 'org_inv_a', 'prod_a1', 'SKU-BEANS-01', 'BAR-BEANS-01', '1kg Bag', 12.50, 25.00),
      ('var_a2', 'org_inv_a', 'prod_a1', 'SKU-BEANS-02', 'BAR-BEANS-02', '500g Bag', 7.00, 14.00),
      ('var_b1', 'org_inv_b', 'prod_b1', 'SKU-COMP-01', 'BAR-COMP-01', '1kg Bag B', 11.00, 22.00);
  `);

  const inventoryRepo = new InventoryRepository(db);
  const movementRepo = new InventoryMovementRepository(db);
  const reservationRepo = new InventoryReservationRepository(db);
  const transferRepo = new InventoryTransferRepository(db);
  const stockCountRepo = new StockCountRepository(db);
  const userRepo = new UserRepository(db);

  const inventoryService = new InventoryService(inventoryRepo, movementRepo, db);
  const reservationService = new ReservationService(inventoryRepo, reservationRepo, db);
  const transferService = new TransferService(inventoryRepo, transferRepo, db);
  const stockCountService = new StockCountService(inventoryRepo, stockCountRepo, db);

  const authService = new AuthService(db);

  // Create test users
  const adminUserId = 'usr_inv_admin_a';
  const { hash: adminHash, salt: adminSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: adminUserId,
    organization_id: 'org_inv_a',
    email: 'admin_a@omnicore.test',
    name: 'Admin Org A',
    password_hash: adminHash,
    password_salt: adminSalt,
    role: 'admin',
    is_active: true,
  });

  const { hash: cashierHash, salt: cashierSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: 'usr_inv_cashier_a',
    organization_id: 'org_inv_a',
    email: 'cashier_a@omnicore.test',
    name: 'Cashier Org A',
    password_hash: cashierHash,
    password_salt: cashierSalt,
    role: 'cashier',
    is_active: true,
  });

  const { hash: orgBHash, salt: orgBSalt } = hashPassword('Password123!');
  await userRepo.createUser({
    id: 'usr_inv_admin_b',
    organization_id: 'org_inv_b',
    email: 'admin_b@omnicore.test',
    name: 'Admin Org B',
    password_hash: orgBHash,
    password_salt: orgBSalt,
    role: 'admin',
    is_active: true,
  });

  // TEST 1: Inventory Policies & Arithmetic Precision
  try {
    const sum = addQty(10.1234, 5.5678);
    assert.strictEqual(sum, 15.6912);

    const diff = subQty(15.6912, 5.5678);
    assert.strictEqual(diff, 10.1234);

    const rounded = roundQty(42.123456);
    assert.strictEqual(rounded, 42.1235);

    const avail = calculateAvailable(100, 15, 5, 2);
    assert.strictEqual(avail, 78);

    markPassed('1. Exact Integer-Scaled Arithmetic & Available Calculation');
  } catch (err) {
    markFailed('1. Exact Integer-Scaled Arithmetic & Available Calculation', err);
  }

  // TEST 2: Record Opening Balance & Initial Ledger Entry
  try {
    const res = await inventoryService.recordOpeningBalance(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 150.5,
        unit_cost: 12.5,
        notes: 'Initial opening balance test',
        idempotency_key: 'idem_open_var_a1',
      },
      adminUserId
    );

    assert.strictEqual(res.balance.on_hand, 150.5);
    assert.strictEqual(res.balance.reserved, 0);
    assert.strictEqual(res.balance.damaged, 0);
    assert.strictEqual(res.balance.expired, 0);
    assert.strictEqual(res.balance.in_transit, 0);
    assert.strictEqual(res.balance.available, 150.5);

    assert.strictEqual(res.movement.movement_type, 'OPENING_BALANCE');
    assert.strictEqual(res.movement.quantity_change, 150.5);
    assert.strictEqual(res.movement.previous_balance, 0);
    assert.strictEqual(res.movement.new_balance, 150.5);

    // Test idempotency: replaying same key returns existing record without duplicating
    const replay = await inventoryService.recordOpeningBalance(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 150.5,
        idempotency_key: 'idem_open_var_a1',
      },
      adminUserId
    );
    assert.strictEqual(replay.balance.on_hand, 150.5);

    markPassed('2. Record Opening Balance & Idempotent Replay');
  } catch (err) {
    markFailed('2. Record Opening Balance & Idempotent Replay', err);
  }

  // TEST 3: Manual Stock Adjustments & Negative Stock Protection
  try {
    // Upward adjustment
    const adjUp = await inventoryService.recordAdjustment(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: 25,
        reason: 'Received supplier sample bonus',
      },
      adminUserId
    );
    assert.strictEqual(adjUp.balance.on_hand, 175.5);
    assert.strictEqual(adjUp.movement.previous_balance, 150.5);
    assert.strictEqual(adjUp.movement.new_balance, 175.5);

    // Downward adjustment
    const adjDown = await inventoryService.recordAdjustment(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: -10.5,
        reason: 'Packaging tear during restock',
      },
      adminUserId
    );
    assert.strictEqual(adjDown.balance.on_hand, 165);

    // Attempting excessive negative adjustment when allowNegativeStock is false should fail
    await assert.rejects(
      async () => {
        await inventoryService.recordAdjustment(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_a1',
            quantity_change: -200, // exceeds 165
            reason: 'Excess deduction',
            allowNegativeStock: false,
          },
          adminUserId
        );
      },
      /INSUFFICIENT_STOCK/
    );

    markPassed('3. Stock Adjustments & Negative Stock Protection');
  } catch (err) {
    markFailed('3. Stock Adjustments & Negative Stock Protection', err);
  }

  // TEST 4: Stock Quarantine (Damage & Expiry) and Write-off
  try {
    // Current on_hand: 165, available: 165
    // Quarantine 10 as damaged
    const qDam = await inventoryService.quarantineStock(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 10,
        type: 'damage',
        reason: 'Water spill from roof',
      },
      adminUserId
    );
    assert.strictEqual(qDam.on_hand, 165);
    assert.strictEqual(qDam.damaged, 10);
    assert.strictEqual(qDam.available, 155);

    // Quarantine 5 as expired
    const qExp = await inventoryService.quarantineStock(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 5,
        type: 'expired',
        reason: 'Best-before date passed',
      },
      adminUserId
    );
    assert.strictEqual(qExp.on_hand, 165);
    assert.strictEqual(qExp.expired, 5);
    assert.strictEqual(qExp.available, 150);

    // Cannot quarantine more than available
    await assert.rejects(
      async () => {
        await inventoryService.quarantineStock(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_a1',
            quantity: 200,
            type: 'damage',
          },
          adminUserId
        );
      },
      /INSUFFICIENT_AVAILABLE_STOCK/
    );

    // Write-off 5 of the damaged stock
    const wOff = await inventoryService.writeOffStock(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 5,
        type: 'damage',
        reason: 'Destroyed and discarded in dumpster',
      },
      adminUserId
    );
    assert.strictEqual(wOff.balance.on_hand, 160);
    assert.strictEqual(wOff.balance.damaged, 5);
    assert.strictEqual(wOff.balance.available, 150);
    assert.strictEqual(wOff.movement.movement_type, 'DAMAGE_WRITE_OFF');
    assert.strictEqual(wOff.movement.quantity_change, -5);

    markPassed('4. Stock Quarantine (Damage/Expiry) & Write-Off Ledger');
  } catch (err) {
    markFailed('4. Stock Quarantine (Damage/Expiry) & Write-Off Ledger', err);
  }

  // TEST 5: First-Class Inventory Reservations (Create, Release, Fulfill)
  try {
    // Current on_hand: 160, available: 150, reserved: 0
    // 1. Create reservation for online order
    const res1 = await reservationService.createReservation(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 20,
        reference_type: 'ECOMMERCE_ORDER',
        reference_id: 'ord_ecom_1001',
        notes: 'Hold for web customer',
      },
      adminUserId
    );
    assert.strictEqual(res1.status, 'ACTIVE');
    assert.strictEqual(res1.quantity, 20);

    const balAfterRes = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(balAfterRes!.reserved, 20);
    assert.strictEqual(balAfterRes!.available, 130);
    assert.strictEqual(balAfterRes!.on_hand, 160);

    // 2. Attempt to reserve more than available (130) -> should fail
    await assert.rejects(
      async () => {
        await reservationService.createReservation(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_a1',
            quantity: 140,
            reference_type: 'ORDER',
            reference_id: 'ord_excess',
          },
          adminUserId
        );
      },
      /INSUFFICIENT_STOCK/
    );

    // 3. Fulfill reservation on checkout completion
    const fulfilled = await reservationService.fulfillReservation('org_inv_a', res1.id, adminUserId);
    assert.strictEqual(fulfilled.status, 'FULFILLED');

    const balAfterFul = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(balAfterFul!.on_hand, 140);
    assert.strictEqual(balAfterFul!.reserved, 0);
    assert.strictEqual(balAfterFul!.available, 130);

    // 4. Create another reservation and release it
    const res2 = await reservationService.createReservation(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 15,
        reference_type: 'POS_HOLD',
        reference_id: 'pos_hold_55',
      },
      adminUserId
    );
    assert.strictEqual(res2.status, 'ACTIVE');

    const released = await reservationService.releaseReservation('org_inv_a', res2.id, adminUserId);
    assert.strictEqual(released.status, 'RELEASED');

    const balAfterRel = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(balAfterRel!.reserved, 0);
    assert.strictEqual(balAfterRel!.available, 130);
    assert.strictEqual(balAfterRel!.on_hand, 140);

    markPassed('5. First-Class Inventory Reservations (Lifecycle & Invariants)');
  } catch (err) {
    markFailed('5. First-Class Inventory Reservations (Lifecycle & Invariants)', err);
  }

  // TEST 6: Multi-Location Stock Transfer Lifecycle (Request, Approve, Dispatch, Receive)
  try {
    // Current WH A on_hand: 140
    // Transfer 40 units from Warehouse A to Store A
    const { transfer, items } = await transferService.createTransfer(
      'org_inv_a',
      {
        transfer_number: 'TR-TEST-001',
        source_location_id: 'loc_wh_a',
        destination_location_id: 'loc_store_a',
        items: [
          { variant_id: 'var_a1', requested_quantity: 40 },
        ],
        notes: 'Replenishment for weekend rush',
      },
      adminUserId
    );
    assert.strictEqual(transfer.status, 'REQUESTED');
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].requested_quantity, 40);

    // Approve transfer
    const approved = await transferService.approveTransfer('org_inv_a', transfer.id, adminUserId);
    assert.strictEqual(approved.status, 'APPROVED');

    // Dispatch transfer
    const dispatched = await transferService.dispatchTransfer('org_inv_a', transfer.id, undefined, adminUserId);
    assert.strictEqual(dispatched.status, 'DISPATCHED');

    // Verify balances after dispatch:
    // Source WH A on_hand reduced by 40 (140 -> 100)
    const whBalAfterDisp = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(whBalAfterDisp!.on_hand, 100);

    // Dest Store A in_transit increased by 40 (0 -> 40), on_hand still 0
    const storeBalAfterDisp = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBalAfterDisp!.in_transit, 40);
    assert.strictEqual(storeBalAfterDisp!.on_hand, 0);

    // Receive transfer at Store A
    const received = await transferService.receiveTransfer(
      'org_inv_a',
      transfer.id,
      { var_a1: 40 },
      adminUserId
    );
    assert.strictEqual(received.status, 'COMPLETED');

    // Verify balances after receipt:
    // Dest Store A in_transit 0, on_hand 40, available 40
    const storeBalAfterRec = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBalAfterRec!.in_transit, 0);
    assert.strictEqual(storeBalAfterRec!.on_hand, 40);
    assert.strictEqual(storeBalAfterRec!.available, 40);

    markPassed('6. Multi-Location Stock Transfer Lifecycle (Dispatch -> In-Transit -> Receive)');
  } catch (err) {
    markFailed('6. Multi-Location Stock Transfer Lifecycle (Dispatch -> In-Transit -> Receive)', err);
  }

  // TEST 7: Stock Transfer with Variance Accounting
  try {
    // Current WH A on_hand: 100
    // Transfer 20 units, but receive only 18 (2 units lost in transit)
    const { transfer } = await transferService.createTransfer(
      'org_inv_a',
      {
        source_location_id: 'loc_wh_a',
        destination_location_id: 'loc_store_a',
        items: [{ variant_id: 'var_a1', requested_quantity: 20 }],
      },
      adminUserId
    );

    await transferService.approveTransfer('org_inv_a', transfer.id, adminUserId);
    await transferService.dispatchTransfer('org_inv_a', transfer.id, undefined, adminUserId);

    // Receive only 18 units
    const received = await transferService.receiveTransfer(
      'org_inv_a',
      transfer.id,
      { var_a1: 18 },
      adminUserId
    );
    assert.strictEqual(received.status, 'COMPLETED');

    // Check items for variance: variance = received - dispatched = 18 - 20 = -2
    const transferDetails = await transferService.getTransfer('org_inv_a', transfer.id);
    assert.strictEqual(transferDetails!.items[0].dispatched_quantity, 20);
    assert.strictEqual(transferDetails!.items[0].received_quantity, 18);
    assert.strictEqual(transferDetails!.items[0].variance_quantity, -2);

    // Verify VARIANCE_RECORDED event in append-only event ledger
    const events = await transferService.getTransferEvents('org_inv_a', transfer.id);
    const varEvent = events.find((e) => e.event_type === 'VARIANCE_RECORDED');
    assert.ok(varEvent, 'VARIANCE_RECORDED event must exist in ledger');
    assert.strictEqual(varEvent!.quantity, -2);

    // Dest Store A on_hand increased by 18 (40 -> 58), in_transit is cleared to 0
    const storeBal = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBal!.on_hand, 58);
    assert.strictEqual(storeBal!.in_transit, 0);

    markPassed('7. Stock Transfer with Discrepancy & Variance Handling');
  } catch (err) {
    markFailed('7. Stock Transfer with Discrepancy & Variance Handling', err);
  }

  // TEST 8: Physical Stock Counts & Automatic Reconciliation
  try {
    // Current Store A on_hand: 58
    // Create stock count session
    const { count, items } = await stockCountService.createStockCount(
      'org_inv_a',
      {
        location_id: 'loc_store_a',
        variant_ids: ['var_a1'],
        notes: 'Monthly cycle count',
      },
      adminUserId
    );
    assert.strictEqual(count.status, 'IN_PROGRESS');
    assert.strictEqual(items[0].system_quantity, 58);

    // Auditor finds 60 units (2 extra units found)
    const submitted = await stockCountService.submitStockCount(
      'org_inv_a',
      count.id,
      { var_a1: 60 },
      adminUserId
    );
    assert.strictEqual(submitted.status, 'SUBMITTED');

    // Approve count -> should trigger compensating ADJUSTMENT_STOCKTAKE ledger movement (+2)
    const approved = await stockCountService.approveStockCount('org_inv_a', count.id, adminUserId);
    assert.strictEqual(approved.status, 'APPROVED');

    // Check balance updated to 60
    const storeBal = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBal!.on_hand, 60);

    // Check ledger movement recorded
    const movements = await inventoryService.listMovements('org_inv_a', {
      locationId: 'loc_store_a',
      variantId: 'var_a1',
      movementType: 'ADJUSTMENT_STOCKTAKE',
    });
    assert.strictEqual(movements.length, 1);
    assert.strictEqual(movements[0].quantity_change, 2);

    markPassed('8. Physical Stock Counts & Compensating Reconciliation Movements');
  } catch (err) {
    markFailed('8. Physical Stock Counts & Compensating Reconciliation Movements', err);
  }

  // TEST 9: Multi-Tenant Authorization Isolation at Service Layer
  try {
    // Org A user attempts to transfer stock to Org B's location -> REJECTED
    await assert.rejects(
      async () => {
        await transferService.createTransfer(
          'org_inv_a',
          {
            source_location_id: 'loc_wh_a',
            destination_location_id: 'loc_wh_b', // belongs to org_inv_b
            items: [{ variant_id: 'var_a1', requested_quantity: 5 }],
          },
          adminUserId
        );
      },
      /TENANT_ACCESS_DENIED/
    );

    // Org A user attempts to reserve Org B's variant -> REJECTED
    await assert.rejects(
      async () => {
        await reservationService.createReservation(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_b1', // belongs to org_inv_b
            quantity: 5,
            reference_type: 'ORDER',
            reference_id: 'cross_res',
          },
          adminUserId
        );
      },
      /TENANT_ACCESS_DENIED/
    );

    markPassed('9. Multi-Tenant Authorization Isolation at Service Layer');
  } catch (err) {
    markFailed('9. Multi-Tenant Authorization Isolation at Service Layer', err);
  }

  // TEST 10: Real HTTP Endpoints & RBAC Permissions
  let server: http.Server | null = null;
  try {
    const { app } = await createApp({ db, authService, skipVite: true });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Generate tokens
    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@omnicore.test',
      password: 'Password123!',
    })).token;

    const cashierToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'cashier_a@omnicore.test',
      password: 'Password123!',
    })).token;

    const orgBToken = (await authService.login({
      organizationId: 'org_inv_b',
      email: 'admin_b@omnicore.test',
      password: 'Password123!',
    })).token;

    // 10a. Query Balances via HTTP
    const balRes = await fetch(`${baseUrl}/api/inventory/balances/loc_wh_a`, {
      headers: { Authorization: `Bearer ${adminToken}`, Connection: 'close' },
    });
    assert.strictEqual(balRes.status, 200);
    const balBody = await balRes.json();
    assert.strictEqual(balBody.success, true);
    assert.ok(balBody.data.length > 0);

    // 10b. Unauthenticated request to /api/inventory/adjustments -> 401
    const unauthRes = await fetch(`${baseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: 5,
        reason: 'Unauthorized test',
      }),
    });
    assert.strictEqual(unauthRes.status, 401);

    // 10c. Cashier attempting stock transfer without INVENTORY_TRANSFER permission -> 403
    // (cashier has ORDERS_CREATE, PRODUCTS_VIEW, etc. but NOT INVENTORY_TRANSFER)
    const cashierTransferRes = await fetch(`${baseUrl}/api/inventory/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        source_location_id: 'loc_wh_a',
        destination_location_id: 'loc_store_a',
        items: [{ variant_id: 'var_a1', requested_quantity: 5 }],
      }),
    });
    assert.strictEqual(cashierTransferRes.status, 403);

    // 10d. Cross-tenant balance query: Org B user queries Org A location -> returns 0 items
    const crossBalRes = await fetch(`${baseUrl}/api/inventory/balances/loc_wh_a`, {
      headers: { Authorization: `Bearer ${orgBToken}`, Connection: 'close' },
    });
    assert.strictEqual(crossBalRes.status, 200);
    const crossBalBody = await crossBalRes.json();
    assert.strictEqual(crossBalBody.count, 0);

    // 10e. Cross-tenant adjustment attempt -> 403 TENANT_ACCESS_DENIED
    const crossAdjRes = await fetch(`${baseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgBToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a', // belongs to org A
        variant_id: 'var_a1',
        quantity_change: 10,
        reason: 'Hacker adjustment',
      }),
    });
    assert.strictEqual(crossAdjRes.status, 403);
    const crossAdjBody = await crossAdjRes.json();
    assert.strictEqual(crossAdjBody.error.code, 'TENANT_ACCESS_DENIED');

    markPassed('10. Real HTTP Inventory Endpoints, RBAC Gates & Cross-Tenant Defense');
  } catch (err) {
    markFailed('10. Real HTTP Inventory Endpoints, RBAC Gates & Cross-Tenant Defense', err);
  } finally {
    if (server) {
      (server as any).closeAllConnections?.();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }

  console.log('======================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================');

  try {
    await db.close();
  } catch (e) {
    // ignore
  }

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runInventoryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
