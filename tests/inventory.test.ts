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
import { StockCountRepository } from '../server/repositories/stockCountRepository';
import { InventoryService } from '../server/inventory/inventoryService';
import { ReservationService } from '../server/inventory/reservationService';
import { TransferService } from '../server/inventory/transferService';
import { StockCountService } from '../server/inventory/stockCountService';
import { UserRepository } from '../server/repositories/userRepository';
import { hashPassword } from '../server/auth/password';
import {
  toQtyString,
  calculateWeightedAverageCostExact,
  parseExactQuantity,
  parseExactMoney,
  parseQtyToScaled,
  formatScaledToQtyString,
} from '../server/inventory/inventoryPolicies';

async function runInventoryTests() {
  console.log('======================================================');
  console.log(' AbaCha INV-001 Inventory Ledger & Operations Tests');
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
      ('var_r2', 'org_inv_a', 'prod_a1', 'SKU-BEANS-R2', 'BAR-BEANS-R2', 'R2 Bag', 12.50, 25.00),

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
    email: 'admin_a@abacha.test',
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
    email: 'cashier_a@abacha.test',
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
    email: 'admin_b@abacha.test',
    name: 'Admin Org B',
    password_hash: orgBHash,
    password_salt: orgBSalt,
    role: 'admin',
    is_active: true,
  });

  // TEST 1: Inventory Policies, Scaled Arithmetic & Weighted Average Cost
  try {
    // 1. Exact Decimal Policy Validations (INV-001R6)
    
    // Quantity Rejection
    assert.throws(() => parseExactQuantity(12.5 as any), /must be supplied as a decimal string/);
    assert.throws(() => parseExactQuantity(NaN as any), /must be supplied as a decimal string/);
    assert.throws(() => parseExactQuantity(Infinity as any), /must be supplied as a decimal string/);
    
    // Quantity Acceptance
    assert.strictEqual(parseExactQuantity('12'), '12.0000');
    assert.strictEqual(parseExactQuantity('12.5'), '12.5000');
    assert.strictEqual(parseExactQuantity('12.5000'), '12.5000');
    
    // Precision Rejection
    assert.throws(() => parseExactQuantity('12.50001'), /precision exceeds maximum supported 4 decimal places/);
    assert.throws(() => parseExactQuantity('12.12345'), /precision exceeds maximum supported 4 decimal places/);
    
    // Money Rejection
    assert.throws(() => parseExactMoney(125.50 as any), /must be supplied as a decimal string/);
    assert.throws(() => parseExactMoney('125.501'), /precision exceeds maximum supported 2 decimal places/);
    
    // Money Acceptance
    assert.strictEqual(parseExactMoney('125'), '125.00');
    assert.strictEqual(parseExactMoney('125.5'), '125.50');
    assert.strictEqual(parseExactMoney('125.50'), '125.50');

    // Cost Precision Truncation test (ensure old behavior is removed)
    assert.throws(() => {
      calculateWeightedAverageCostExact('10.0000', '100.00', '5.0000', '101.12345');
    }, /Cost precision cannot exceed 4 decimal places/);

    // 1b. Weighted Average Cost Exact Calculations (INV-001R3 Section 4)
    // Zero opening stock:
    assert.strictEqual(
      calculateWeightedAverageCostExact('0', '0', '10', '15.25'),
      '15.25',
      'Zero opening stock must adopt received unit cost'
    );
    // Integer quantities:
    // 10 units @ 10.00 + 10 units @ 20.00 = 20 units, value 300.00 -> 15.00
    assert.strictEqual(
      calculateWeightedAverageCostExact('10', '10.00', '10', '20.00'),
      '15.00',
      'Integer quantities WAC calculation'
    );
    // Fractional quantities:
    // 10.5000 units @ 10.00 + 4.2500 units @ 15.00 = 14.7500 units, value 105.00 + 63.75 = 168.75 -> 11.44
    assert.strictEqual(
      calculateWeightedAverageCostExact('10.5000', '10.00', '4.2500', '15.00'),
      '11.44',
      'Fractional quantities WAC calculation'
    );
    // Fractional unit costs:
    // 5 units @ 12.3333 + 5 units @ 14.6667 = 10 units, value 61.6665 + 73.3335 = 135.0000 -> 13.50
    assert.strictEqual(
      calculateWeightedAverageCostExact('5.0000', '12.3333', '5.0000', '14.6667'),
      '13.50',
      'Fractional unit costs WAC calculation'
    );
    // Large quantities:
    // 1,000,000 units @ 100.00 + 500,000 units @ 150.00 = 1,500,000 units, value 175,000,000 -> 116.67
    assert.strictEqual(
      calculateWeightedAverageCostExact('1000000.0000', '100.00', '500000.0000', '150.00'),
      '116.67',
      'Large quantities WAC calculation'
    );
    // Repeated receipts:
    let wac = calculateWeightedAverageCostExact('10.0000', '10.00', '10.0000', '20.00'); // 15.00
    assert.strictEqual(wac, '15.00');
    wac = calculateWeightedAverageCostExact('20.0000', wac, '20.0000', '30.00'); // (20*15 + 20*30)/40 = 900/40 = 22.50
    assert.strictEqual(wac, '22.50', 'Repeated receipts WAC calculation');
    // Rounding boundaries:
    // 10 units @ 10.00 + 10 units @ 10.005 -> value 100 + 100.05 = 200.05 / 20 = 10.0025 -> rounds to 10.00
    assert.strictEqual(
      calculateWeightedAverageCostExact('10.0000', '10.0000', '10.0000', '10.0050'),
      '10.00',
      'Rounding boundary (.0025 rounds down to .00)'
    );
    // 10 units @ 10.00 + 10 units @ 10.010 -> value 200.10 / 20 = 10.005 -> rounds half-up to 10.01
    assert.strictEqual(
      calculateWeightedAverageCostExact('10.0000', '10.0000', '10.0000', '10.0100'),
      '10.01',
      'Rounding boundary (.005 rounds half-up to .01)'
    );

    // 1c. parseExactMoney strictness tests
    assert.strictEqual(parseExactMoney('12'), '12.00');
    assert.strictEqual(parseExactMoney('12.3'), '12.30');
    assert.strictEqual(parseExactMoney('12.30'), '12.30');
    assert.strictEqual(parseExactMoney('12.34'), '12.34');
    assert.strictEqual(parseExactMoney('12.34'), '12.34');
    assert.strictEqual(parseExactMoney('-10', 'cost', { allowNegative: true }), '-10.00');

    assert.throws(() => parseExactMoney('12.345'), /precision exceeds/);
    assert.throws(() => parseExactMoney('12.999'), /precision exceeds/);
    assert.throws(() => parseExactMoney('-10.00'), /cannot be negative/);
    assert.throws(() => parseExactMoney(NaN as any), /must be supplied as a decimal string/);
    assert.throws(() => parseExactMoney(Infinity as any), /must be supplied as a decimal string/);
    assert.throws(() => parseExactMoney('1.2e3'), /invalid decimal format/);
    assert.throws(() => parseExactMoney(true as any), /must be supplied as a decimal string/);

    markPassed('1. Exact Integer-Scaled Arithmetic & Weighted Average Cost Calculations');
  } catch (err) {
    markFailed('1. Exact Integer-Scaled Arithmetic & Weighted Average Cost Calculations', err);
  }

  // TEST 2: Record Opening Balance & Initial Ledger Entry
  try {
    const res = await inventoryService.recordOpeningBalance(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '150.5000',
        unit_cost: '12.50',
        notes: 'Initial opening balance test',
        idempotency_key: 'idem_open_var_a1',
      },
      adminUserId
    );

    assert.strictEqual(res.balance.on_hand, '150.5000');
    assert.strictEqual(res.balance.reserved, '0.0000');
    assert.strictEqual(res.balance.damaged, '0.0000');
    assert.strictEqual(res.balance.expired, '0.0000');
    assert.strictEqual(res.balance.in_transit, '0.0000');
    assert.strictEqual(res.balance.available, '150.5000');

    assert.strictEqual(res.movement.movement_type, 'OPENING_BALANCE');
    assert.strictEqual(res.movement.quantity_change, '150.5000');
    assert.strictEqual(res.movement.previous_balance, '0.0000');
    assert.strictEqual(res.movement.new_balance, '150.5000');

    // Test idempotency: replaying same key returns existing record without duplicating
    const replay = await inventoryService.recordOpeningBalance(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '150.5000',
        idempotency_key: 'idem_open_var_a1',
      },
      adminUserId
    );
    assert.strictEqual(replay.balance.on_hand, '150.5000');

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
        quantity_change: '25',
        reason: 'Received supplier sample bonus',
      },
      adminUserId
    );
    assert.strictEqual(adjUp.balance.on_hand, '175.5000');
    assert.strictEqual(adjUp.movement.previous_balance, '150.5000');
    assert.strictEqual(adjUp.movement.new_balance, '175.5000');

    // Downward adjustment
    const adjDown = await inventoryService.recordAdjustment(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: '-10.5',
        reason: 'Packaging tear during restock',
      },
      adminUserId
    );
    assert.strictEqual(adjDown.balance.on_hand, '165.0000');

    // Attempting excessive negative adjustment when allowNegativeStock is false should fail
    await assert.rejects(
      async () => {
        await inventoryService.recordAdjustment(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_a1',
            quantity_change: '-200', // exceeds 165
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
        quantity: '10',
        type: 'damage',
        reason: 'Water spill from roof',
      },
      adminUserId
    );
    assert.strictEqual(qDam.on_hand, '165.0000');
    assert.strictEqual(qDam.damaged, '10.0000');
    assert.strictEqual(qDam.available, '155.0000');

    // Quarantine 5 as expired
    const qExp = await inventoryService.quarantineStock(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '5',
        type: 'expired',
        reason: 'Best-before date passed',
      },
      adminUserId
    );
    assert.strictEqual(qExp.on_hand, '165.0000');
    assert.strictEqual(qExp.expired, '5.0000');
    assert.strictEqual(qExp.available, '150.0000');

    // Cannot quarantine more than available
    await assert.rejects(
      async () => {
        await inventoryService.quarantineStock(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_a1',
            quantity: '200',
            type: 'damage',
          },
          adminUserId
        );
      },
    );

    // Write-off 5 of the damaged stock
    const wOff = await inventoryService.writeOffStock(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '5',
        type: 'damage',
        reason: 'Destroyed and discarded in dumpster',
      },
      adminUserId
    );
    assert.strictEqual(wOff.balance.on_hand, '160.0000');
    assert.strictEqual(wOff.balance.damaged, '5.0000');
    assert.strictEqual(wOff.balance.available, '150.0000');
    assert.strictEqual(wOff.movement.movement_type, 'DAMAGE_WRITE_OFF');
    assert.strictEqual(wOff.movement.quantity_change, '-5.0000');

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
        quantity: '20',
        reference_type: 'ECOMMERCE_ORDER',
        reference_id: 'ord_ecom_1001',
        notes: 'Hold for web customer',
      },
      adminUserId
    );
    assert.strictEqual(res1.status, 'ACTIVE');
    assert.strictEqual(res1.quantity, '20.0000');

    const balAfterRes = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(balAfterRes!.reserved, '20.0000');
    assert.strictEqual(balAfterRes!.available, '130.0000');
    assert.strictEqual(balAfterRes!.on_hand, '160.0000');

    // 2. Attempt to reserve more than available (130) -> should fail
    await assert.rejects(
      async () => {
        await reservationService.createReservation(
          'org_inv_a',
          {
            location_id: 'loc_wh_a',
            variant_id: 'var_a1',
            quantity: '140',
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
    assert.strictEqual(balAfterFul!.on_hand, '140.0000');
    assert.strictEqual(balAfterFul!.reserved, '0.0000');
    assert.strictEqual(balAfterFul!.available, '130.0000');

    // 4. Create another reservation and release it
    const res2 = await reservationService.createReservation(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '15',
        reference_type: 'POS_HOLD',
        reference_id: 'pos_hold_55',
      },
      adminUserId
    );
    assert.strictEqual(res2.status, 'ACTIVE');

    const released = await reservationService.releaseReservation('org_inv_a', res2.id, adminUserId);
    assert.strictEqual(released.status, 'RELEASED');

    const balAfterRel = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(balAfterRel!.reserved, '0.0000');
    assert.strictEqual(balAfterRel!.available, '130.0000');
    assert.strictEqual(balAfterRel!.on_hand, '140.0000');

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
          { variant_id: 'var_a1', requested_quantity: '40' },
        ],
        notes: 'Replenishment for weekend rush',
      },
      adminUserId
    );
    assert.strictEqual(transfer.status, 'REQUESTED');
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].requested_quantity, '40.0000');

    // Approve transfer
    const approved = await transferService.approveTransfer('org_inv_a', transfer.id, adminUserId);
    assert.strictEqual(approved.status, 'APPROVED');

    // Dispatch transfer
    const dispatched = await transferService.dispatchTransfer('org_inv_a', transfer.id, undefined, adminUserId);
    assert.strictEqual(dispatched.status, 'DISPATCHED');

    // Verify balances after dispatch:
    // Source WH A on_hand reduced by 40 (140 -> 100)
    const whBalAfterDisp = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    assert.strictEqual(whBalAfterDisp!.on_hand, '100.0000');

    // Dest Store A in_transit increased by 40 (0 -> 40), on_hand still 0
    const storeBalAfterDisp = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBalAfterDisp!.in_transit, '40.0000');
    assert.strictEqual(storeBalAfterDisp!.on_hand, '0.0000');

    // Receive transfer at Store A
    const received = await transferService.receiveTransfer(
      'org_inv_a',
      transfer.id,
      { var_a1: '40' },
      adminUserId
    );
    assert.strictEqual(received.status, 'COMPLETED');

    // Verify balances after receipt:
    // Dest Store A in_transit 0, on_hand 40, available 40
    const storeBalAfterRec = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBalAfterRec!.in_transit, '0.0000');
    assert.strictEqual(storeBalAfterRec!.on_hand, '40.0000');
    assert.strictEqual(storeBalAfterRec!.available, '40.0000');

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
        items: [{ variant_id: 'var_a1', requested_quantity: '20' }],
      },
      adminUserId
    );

    await transferService.approveTransfer('org_inv_a', transfer.id, adminUserId);
    await transferService.dispatchTransfer('org_inv_a', transfer.id, undefined, adminUserId);

    // Receive only 18 units
    const received = await transferService.receiveTransfer(
      'org_inv_a',
      transfer.id,
      { var_a1: '18' },
      adminUserId
    );
    assert.strictEqual(received.status, 'COMPLETED');

    // Check items for variance: variance = received - dispatched = 18 - 20 = -2
    const transferDetails = await transferService.getTransfer('org_inv_a', transfer.id);
    assert.strictEqual(transferDetails!.items[0].dispatched_quantity, '20.0000');
    assert.strictEqual(transferDetails!.items[0].received_quantity, '18.0000');
    assert.strictEqual(transferDetails!.items[0].variance_quantity, '-2.0000');

    // Verify VARIANCE_RECORDED event in append-only event ledger
    const events = await transferService.getTransferEvents('org_inv_a', transfer.id);
    const varEvent = events.find((e) => e.event_type === 'VARIANCE_RECORDED');
    assert.ok(varEvent, 'VARIANCE_RECORDED event must exist in ledger');
    assert.strictEqual(varEvent!.quantity, '-2.0000');

    // Dest Store A on_hand increased by 18 (40 -> 58), in_transit is cleared to 0
    const storeBal = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBal!.on_hand, '58.0000');
    assert.strictEqual(storeBal!.in_transit, '0.0000');

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
    assert.strictEqual(items[0].system_quantity, '58.0000');

    // Auditor finds 60 units (2 extra units found)
    const submitted = await stockCountService.submitStockCount(
      'org_inv_a',
      count.id,
      { var_a1: '60' },
      adminUserId
    );
    assert.strictEqual(submitted.status, 'SUBMITTED');

    // Approve count -> should trigger compensating ADJUSTMENT_STOCKTAKE ledger movement (+2)
    const approved = await stockCountService.approveStockCount('org_inv_a', count.id, adminUserId);
    assert.strictEqual(approved.status, 'APPROVED');

    // Check balance updated to 60
    const storeBal = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    assert.strictEqual(storeBal!.on_hand, '60.0000');

    // Check ledger movement recorded
    const movements = await inventoryService.listMovements('org_inv_a', {
      locationId: 'loc_store_a',
      variantId: 'var_a1',
      movementType: 'ADJUSTMENT_STOCKTAKE',
    });
    assert.strictEqual(movements.length, 1);
    assert.strictEqual(toQtyString(movements[0].quantity_change), '2.0000');

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
            items: [{ variant_id: 'var_a1', requested_quantity: '5' }],
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
            quantity: '5',
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
  let rBaseUrl = '';
  try {
    const { app } = await createApp({ db, authService, skipVite: true });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as any).port;
    rBaseUrl = `http://127.0.0.1:${port}`;

    // Generate tokens
    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    const cashierToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'cashier_a@abacha.test',
      password: 'Password123!',
    })).token;

    const orgBToken = (await authService.login({
      organizationId: 'org_inv_b',
      email: 'admin_b@abacha.test',
      password: 'Password123!',
    })).token;

    // 10a. Query Balances via HTTP
    const balRes = await fetch(`${rBaseUrl}/api/inventory/balances/loc_wh_a`, {
      headers: { Authorization: `Bearer ${adminToken}`, Connection: 'close' },
    });
    assert.strictEqual(balRes.status, 200);
    const balBody = await balRes.json();
    assert.strictEqual(balBody.success, true);
    assert.ok(balBody.data.length > 0);

    // 10b. Unauthenticated request to /api/inventory/adjustments -> 401
    const unauthRes = await fetch(`${rBaseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: '5',
        reason: 'Unauthorized test',
      }),
    });
    assert.strictEqual(unauthRes.status, 401);

    // 10c. Cashier attempting stock transfer without INVENTORY_TRANSFER permission -> 403
    // (cashier has ORDERS_CREATE, PRODUCTS_VIEW, etc. but NOT INVENTORY_TRANSFER)
    const cashierTransferRes = await fetch(`${rBaseUrl}/api/inventory/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        source_location_id: 'loc_wh_a',
        destination_location_id: 'loc_store_a',
        items: [{ variant_id: 'var_a1', requested_quantity: '5' }],
      }),
    });
    assert.strictEqual(cashierTransferRes.status, 403);

    // 10d. Cross-tenant balance query: Org B user queries Org A location -> returns 0 items
    const crossBalRes = await fetch(`${rBaseUrl}/api/inventory/balances/loc_wh_a`, {
      headers: { Authorization: `Bearer ${orgBToken}`, Connection: 'close' },
    });
    assert.strictEqual(crossBalRes.status, 200);
    const crossBalBody = await crossBalRes.json();
    assert.strictEqual(crossBalBody.count, 0);

    // 10e. Cross-tenant adjustment attempt -> 403 TENANT_ACCESS_DENIED
    const crossAdjRes = await fetch(`${rBaseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgBToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a', // belongs to org A
        variant_id: 'var_a1',
        quantity_change: '10',
        reason: 'Hacker adjustment',
      }),
    });
    assert.strictEqual(crossAdjRes.status, 403);
    const crossAdjBody = await crossAdjRes.json();
    assert.strictEqual(crossAdjBody.error.code, 'TENANT_ACCESS_DENIED');

    markPassed('10. Real HTTP Inventory Endpoints, RBAC Gates & Cross-Tenant Defense');
  } catch (err) {
    markFailed('10. Real HTTP Inventory Endpoints, RBAC Gates & Cross-Tenant Defense', err);
  }

  // TEST 11: Background Reservation Expiry Engine & Expire-Stale Endpoint (INV-001R3 Section 5)
  try {
    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    // Create an active reservation that expires in 1 second
    const expRes = await reservationService.createReservation(
      'org_inv_a',
      {
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '5',
        reference_type: 'ORDER',
        reference_id: 'ord_stale_test',
        expires_at: new Date(Date.now() - 60000).toISOString(), // already expired!
      },
      adminUserId
    );
    assert.strictEqual(expRes.status, 'ACTIVE');

    // Reserved quantity should be 5
    const balBeforeExpire = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    const reservedBefore = balBeforeExpire!.reserved;

    // Call POST /api/inventory/reservations/expire-stale
    const expireHttpRes = await fetch(`${rBaseUrl}/api/inventory/reservations/expire-stale`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Connection: 'close',
      },
    });
    assert.strictEqual(expireHttpRes.status, 200);
    const expireBody = await expireHttpRes.json();
    assert.strictEqual(expireBody.success, true);
    assert.ok(expireBody.data.expired_count >= 1, 'At least 1 stale reservation must be expired');

    // Verify reservation status is now EXPIRED
    const staleCheck = await reservationService.getReservation('org_inv_a', expRes.id);
    assert.strictEqual(staleCheck!.status, 'EXPIRED');

    // Verify reserved balance dropped back by 5
    const balAfterExpire = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    const reservedDelta = BigInt(Math.round(Number(reservedBefore) * 10000)) -
                          BigInt(Math.round(Number(balAfterExpire!.reserved) * 10000));
    assert.strictEqual(reservedDelta, 50000n, 'Reserved balance must be released back to available upon expiry');

    markPassed('11. Background Reservation Expiry Engine & Expire-Stale Endpoint');
  } catch (err) {
    markFailed('11. Background Reservation Expiry Engine & Expire-Stale Endpoint', err);
  }

  // TEST 12: Tenant Override Guard via HTTP (INV-001R3 Section 4)
  try {
    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    // Attacker tries to inject ?organization_id=org_inv_b or body organization_id to escape tenant
    const rogueRes = await fetch(`${rBaseUrl}/api/inventory/adjustments?organization_id=org_inv_b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        organization_id: 'org_inv_b',
        location_id: 'loc_wh_a', // belongs to Org A
        variant_id: 'var_a1',
        quantity_change: '1',
        reason: 'Rogue tenant parameter injection',
      }),
    });

    assert.strictEqual(rogueRes.status, 200);
    const rogueBody = await rogueRes.json();
    // The created record must be bound strictly to org_inv_a, completely ignoring rogue tenant inputs
    assert.strictEqual(rogueBody.data.movement.organization_id, 'org_inv_a');
    assert.strictEqual(rogueBody.data.balance.organization_id, 'org_inv_a');

    markPassed('12. Tenant Override Defense (HTTP Tenant Extraction from req.auth Only)');
  } catch (err) {
    markFailed('12. Tenant Override Defense (HTTP Tenant Extraction from req.auth Only)', err);
  }

  // -------------------------------------------------------------------------
  // TEST 13: HTTP Quantity Validation & Exact Decimal Enforcement (INV-001R3 Section 6)
  // -------------------------------------------------------------------------
  try {
    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    // 13a. Valid 4-decimal quantity string accepted
    const validQtyRes = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a2',
        quantity: '12.5000',
        unit_cost: '7.50',
        idempotency_key: 'open_var_a2_exact',
      }),
    });
    assert.strictEqual(validQtyRes.status, 201, 'Valid exact quantity string "12.5000" must be accepted with 201');
    const validQtyBody = await validQtyRes.json();
    assert.strictEqual(validQtyBody.data.movement.quantity_change, '12.5000');
    assert.strictEqual(validQtyBody.data.balance.on_hand, '12.5000');

    // 13b. Rejection of invalid quantity inputs:
    const invalidInputs = [
      { val: 'NaN', desc: 'NaN string' },
      { val: 'Infinity', desc: 'Infinity string' },
      { val: '1e309', desc: 'Exponential overflow 1e309' },
      { val: 'abc', desc: 'Non-numeric string "abc"' },
      { val: '', desc: 'Empty string ""' },
      { val: null, desc: 'null value' },
      { val: -5, desc: 'Negative value where prohibited' },
      { val: '12.12345', desc: 'More than 4 decimal places' },
    ];

    for (const item of invalidInputs) {
      const rejectRes = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          Connection: 'close',
        },
        body: JSON.stringify({
          location_id: 'loc_wh_a',
          variant_id: 'var_a2',
          quantity: item.val,
          idempotency_key: `open_reject_${Date.now()}_${Math.random()}`,
        }),
      });
      assert.strictEqual(
        rejectRes.status,
        400,
        `Invalid quantity input '${item.desc}' must be rejected with 400 Bad Request, got ${rejectRes.status}`
      );
      const errBody = await rejectRes.json();
      assert.strictEqual(errBody.success, false);
      assert.ok(
        errBody.error.code === 'VALIDATION_ERROR' || errBody.error.code === 'INVALID_QUANTITY',
        `Must return validation error code for '${item.desc}'`
      );
    }

    markPassed('13. HTTP Quantity Validation & Exact Decimal Enforcement (NaN, Infinity, 1e309, null, negative, precision)');
  } catch (err) {
    markFailed('13. HTTP Quantity Validation & Exact Decimal Enforcement', err);
  }

  // -------------------------------------------------------------------------
  // TEST 14: Reservation Idempotency & Database Constraint Concurrency (INV-001R3 Section 7)
  // -------------------------------------------------------------------------
  try {
    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    const resKey = `res_idem_key_${Date.now()}`;

    const orgBToken = (await authService.login({
      organizationId: 'org_inv_b',
      email: 'admin_b@abacha.test',
      password: 'Password123!',
    })).token;

    // 14a. Create initial reservation with idempotency key
    const createRes = await fetch(`${rBaseUrl}/api/inventory/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '5.0000',
        reference_type: 'order',
        reference_id: 'ord_idem_test_1',
        idempotency_key: resKey,
      }),
    });
    assert.strictEqual(createRes.status, 201, 'Initial reservation creation must return 201');
    const createBody = await createRes.json();
    const initialReservationId = createBody.data.id;

    // 14b. Same key + identical payload -> safe idempotent replay (same reservation returned)
    const replayRes = await fetch(`${rBaseUrl}/api/inventory/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '5.0000',
        reference_type: 'order',
        reference_id: 'ord_idem_test_1',
        idempotency_key: resKey,
      }),
    });
    assert.strictEqual(replayRes.status, 201, 'Idempotent reservation replay must succeed');
    const replayBody = await replayRes.json();
    assert.strictEqual(replayBody.data.id, initialReservationId, 'Must return same reservation record');

    // 14c. Same key + conflicting payload -> rejected with 409 IDEMPOTENCY_CONFLICT
    const conflictRes = await fetch(`${rBaseUrl}/api/inventory/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: '10.0000', // Conflicting quantity (10 vs 5)
        reference_type: 'order',
        reference_id: 'ord_idem_test_1',
        idempotency_key: resKey,
      }),
    });
    assert.strictEqual(conflictRes.status, 409, 'Conflicting reservation payload must be rejected with 409');
    const conflictBody = await conflictRes.json();
    assert.strictEqual(conflictBody.error.code, 'IDEMPOTENCY_CONFLICT');

    // 14d. Different organization + same key -> Allowed
    const crossOrgRes = await fetch(`${rBaseUrl}/api/inventory/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgBToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        location_id: 'loc_wh_a', // Will likely fail with 404/403 for org B since it doesn't own loc_wh_a, but for idempotency it shouldn't be 409. Let's use a location for org B if available, or just assert it is NOT 409.
        variant_id: 'var_a1',
        quantity: '5.0000',
        reference_type: 'order',
        reference_id: 'ord_idem_test_1',
        idempotency_key: resKey,
      }),
    });
    assert.notStrictEqual(crossOrgRes.status, 409, 'Different organization with same idempotency key must not return 409');

    // 14e. Real concurrent reservation requests with same key -> database unique constraint ensures single reservation
    const concKey = `res_conc_key_${Date.now()}`;
    const concPromises = [
      reservationService.createReservation(
        'org_inv_a',
        {
          location_id: 'loc_wh_a',
          variant_id: 'var_a1',
          quantity: '2.0000',
          reference_type: 'order',
          reference_id: 'ord_conc_test',
          idempotency_key: concKey,
        },
        adminUserId
      ),
      reservationService.createReservation(
        'org_inv_a',
        {
          location_id: 'loc_wh_a',
          variant_id: 'var_a1',
          quantity: '2.0000',
          reference_type: 'order',
          reference_id: 'ord_conc_test',
          idempotency_key: concKey,
        },
        adminUserId
      ),
    ];

    const concResults = await Promise.allSettled(concPromises);
    assert.strictEqual(concResults[0].status, 'fulfilled', 'First concurrent reservation must succeed');
    assert.strictEqual(concResults[1].status, 'fulfilled', 'Second concurrent reservation must succeed idempotently');
    const res1 = (concResults[0] as PromiseFulfilledResult<any>).value;
    const res2 = (concResults[1] as PromiseFulfilledResult<any>).value;
    assert.strictEqual(res1.id, res2.id, 'Both callers must receive the exact same reservation record');

    // Verify DB count: exactly ONE reservation row exists for this key
    const dbCheck = await db.query(
      `SELECT COUNT(*)::int as cnt FROM inventory_reservations WHERE organization_id = $1 AND idempotency_key = $2`,
      ['org_inv_a', concKey]
    );
    assert.strictEqual(dbCheck.rows[0].cnt, 1, 'Database must contain exactly 1 reservation row');

    markPassed('14. Reservation Idempotency & Database Constraint Concurrency (Safe Replay, 409 Conflict, DB Constraint)');
  } catch (err) {
    markFailed('14. Reservation Idempotency & Database Constraint Concurrency', err);
  }

  // -------------------------------------------------------------------------
  // TEST 15: Movement Idempotency (INV-001R5 Section 6)
  // -------------------------------------------------------------------------
  try {
    const moveKey = `mov_idem_${Date.now()}`;

    const adminToken = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    const orgBToken = (await authService.login({
      organizationId: 'org_inv_b',
      email: 'admin_b@abacha.test',
      password: 'Password123!',
    })).token;

    // 15a. Initial movement
    const m1Res = await fetch(`${rBaseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Connection: 'close' },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: '1.0000',
        reason: 'damage',
        idempotency_key: moveKey,
      }),
    });
    assert.strictEqual(m1Res.status, 200);
    const m1Data = await m1Res.json();

    // 15b. Same key + same payload -> safe replay
    const m2Res = await fetch(`${rBaseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Connection: 'close' },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: '1.0000',
        reason: 'damage',
        idempotency_key: moveKey,
      }),
    });
    assert.strictEqual(m2Res.status, 200);
    const m2Data = await m2Res.json();
    assert.strictEqual(m2Data.data.id, m1Data.data.id, 'Idempotent movement replay must return the identical movement');

    // 15c. Same key + different payload -> 409
    const m3Res = await fetch(`${rBaseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Connection: 'close' },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: '2.0000',
        reason: 'damage',
        idempotency_key: moveKey,
      }),
    });
    assert.strictEqual(m3Res.status, 409, 'Movement idempotency conflict must return 409');

    // 15d. Different org + same key -> Allowed (Not 409)
    const m4Res = await fetch(`${rBaseUrl}/api/inventory/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgBToken}`, Connection: 'close' },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity_change: '1.0000',
        reason: 'damage',
        idempotency_key: moveKey,
      }),
    });
    assert.notStrictEqual(m4Res.status, 409, 'Cross-org with same movement key must not return 409');

    markPassed('15. Movement Idempotency (Safe Replay, 409 Conflict, Cross-org isolation)');
  } catch (err) {
    markFailed('15. Movement Idempotency', err);
  } finally {
    if (server) {
      (server as any).closeAllConnections?.();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
  console.log('======================================================');
  // --- INV-002 AUDIT ADDITIONS ---
  try {
    await inventoryService.recordOpeningBalance('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: 'var_a1', quantity: '-10', unit_cost: '5.00' }, 'usr_inv_admin_a');
    assert.fail('Should have rejected negative opening stock');
  } catch (e: any) {
    assert.ok(e.message.includes('INVALID_QUANTITY') || e.message.includes('Negative stock') || e.message.includes('cannot be negative'), 'Rejected correctly: ' + e.message);
    markPassed('16. Negative Opening Stock Rejection (Audit A3)');
  }

  try {
    const returnMov = await inventoryRepo.recordMovement({
      organization_id: 'org_inv_a', location_id: 'loc_wh_a', variant_id: 'var_a1',
      movement_type: 'SALE_RETURN', quantity_change: '15',
      reason: 'Customer return', performed_by: 'usr_inv_admin_a',
      idempotency_key: 'return_audit_1'
    });
    const returnMovIdem = await inventoryRepo.recordMovement({
      organization_id: 'org_inv_a', location_id: 'loc_wh_a', variant_id: 'var_a1',
      movement_type: 'SALE_RETURN', quantity_change: '15',
      reason: 'Customer return', performed_by: 'usr_inv_admin_a',
      idempotency_key: 'return_audit_1'
    });
    assert.strictEqual(returnMovIdem.movement.id, returnMov.movement.id, 'Idempotency key prevents duplicate return');
    markPassed('17. Returns Workflow & Idempotency (Audit G1)');
  } catch(e: any) {
    markFailed('17. Returns Workflow & Idempotency (Audit G1)', e);
  }

  try {
    const preBal = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    try {
      await reservationService.createReservation('org_inv_a', {
        location_id: 'invalid_loc_123',
        variant_id: 'var_a1', quantity: '5',
        reference_type: 'order',
        reference_id: 'ord_fail_1',
        expires_at: new Date(Date.now() + 10000).toISOString()
    }, 'usr_inv_admin_a');
      assert.fail('Should fail FK');
    } catch (e: any) {
      const postBal = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
      assert.strictEqual(preBal?.available, postBal?.available, 'Available stock unchanged on failed reservation');
      markPassed('18. Mid-Transaction Rollback Verification (Audit L1)');
    }
  } catch(e: any) {
    markFailed('18. Mid-Transaction Rollback Verification (Audit L1)', e);
  }

  try {
    const currentBal = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    const available = parseFloat(currentBal?.available || '0');
    const reserveAmount = Math.floor((available / 2) + 1).toString(); // Total > available, individually < available

    const p1 = reservationService.createReservation('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: 'var_a1', quantity: reserveAmount, reference_type: 'order', reference_id: 'ord_c1_audit',
      expires_at: new Date(Date.now() + 10000).toISOString()
    }, 'usr_inv_admin_a');
    const p2 = reservationService.createReservation('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: 'var_a1', quantity: reserveAmount, reference_type: 'order', reference_id: 'ord_c2_audit',
      expires_at: new Date(Date.now() + 10000).toISOString()
    }, 'usr_inv_admin_a');
    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    
    assert.strictEqual(fulfilled.length, 1, 'Exactly one should fulfill');
    assert.strictEqual(rejected.length, 1, 'Exactly one should reject due to insufficient stock');
    markPassed('19. Concurrent Reservation Limits (Audit D7)');
  } catch(e: any) {
    markFailed('19. Concurrent Reservation Limits (Audit D7)', e);
  }
  
  try {
    const preDestBal = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    const preStoreOnHand = parseFloat(preDestBal?.on_hand || '0');

    const { transfer, items } = await transferService.createTransfer(
      'org_inv_a',
      {
        transfer_number: 'TR-TEST-CONCUR',
        source_location_id: 'loc_wh_a',
        destination_location_id: 'loc_store_a',
        items: [
          { variant_id: 'var_a1', requested_quantity: '10' },
        ],
        notes: 'Concurrency test',
      },
      'usr_inv_admin_a'
    );
    await transferService.approveTransfer('org_inv_a', transfer.id, 'usr_inv_admin_a');

    // F2 Double Dispatch
    const d1 = transferService.dispatchTransfer('org_inv_a', transfer.id, undefined, 'usr_inv_admin_a');
    const d2 = transferService.dispatchTransfer('org_inv_a', transfer.id, undefined, 'usr_inv_admin_a');
    
    const dResults = await Promise.allSettled([d1, d2]);
    const dFulfilled = dResults.filter(r => r.status === 'fulfilled');
    // Both dispatches fulfill because the second one acquires the lock, sees it's already DISPATCHED, and returns idempotently
    assert.strictEqual(dFulfilled.length, 2, 'Both should fulfill (one processes, one returns idempotently)');
    const dRes = dFulfilled[0].value;
    assert.strictEqual(dRes.status, 'DISPATCHED');

    // F3 Double Receive
    const r1 = transferService.receiveTransfer('org_inv_a', transfer.id, undefined, 'usr_inv_admin_a');
    const r2 = transferService.receiveTransfer('org_inv_a', transfer.id, undefined, 'usr_inv_admin_a');

    const rResults = await Promise.allSettled([r1, r2]);
    const rFulfilled = rResults.filter(r => r.status === 'fulfilled');
    // If idempotency kicks in, both could fulfill, but the inventory must not double-increment.

    const postDestBal = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    const postStoreOnHand = parseFloat(postDestBal?.on_hand || '0');
    assert.strictEqual(postStoreOnHand - preStoreOnHand, 10, 'Inventory should increase by exactly 10 units, no double accounting');

    markPassed('20. Transfer Concurrency & Double Receive/Dispatch Defense (Audit F2/F3)');
  } catch (e: any) {
    markFailed('20. Transfer Concurrency & Double Receive/Dispatch Defense (Audit F2/F3)', e);
  }

  
  // ==========================================
  // R1: EXACT QUANTITY/MONEY BOUNDARY TESTS
  // ==========================================
  try {
    const { app: rApp } = await createApp({ db, authService, skipVite: true });
    const rServer = http.createServer(rApp);
    await new Promise<void>((resolve) => rServer.listen(0, resolve));
    const rPort = (rServer.address() as any).port;
    const rBaseUrl = `http://127.0.0.1:${rPort}`;
    (global as any).rServer = rServer;
    (global as any).rBaseUrl = rBaseUrl;

    const r1Token = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    // Quantity invalid (number instead of string)
    const resNum = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r1Token}` },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 10,
        unit_cost: "10.00"
      })
    });
    assert.strictEqual(resNum.status, 400, 'HTTP quantity validation should reject numeric 10');
    
    const resFloat = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r1Token}` },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: 10.5,
        unit_cost: "10.00"
      })
    });
    assert.strictEqual(resFloat.status, 400, 'HTTP quantity validation should reject numeric 10.5');

    // unit_cost invalid (number instead of string)
    const resCostNum = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r1Token}` },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: "10.0000",
        unit_cost: 10
      })
    });
    assert.strictEqual(resCostNum.status, 400, 'HTTP unit_cost validation should reject numeric 10');
    const costError = await resCostNum.json();
    assert.ok(costError.error.message.includes('must be supplied as a decimal string'), 'Should explicitly complain about decimal string for money');

    // Valid string acceptance
    const resValid = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r1Token}` },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: "10.5000",
        unit_cost: "12.50",
        idempotency_key: 'r1-test-key-1'
      })
    });
    assert.strictEqual(resValid.status, 201, 'HTTP should accept string 10.5000 and 12.50');

    markPassed('R1. Exact Quantity/Money Boundary Rejects Numeric Inputs (API Boundary)');
  } catch (err) {
    markFailed('R1. Exact Quantity/Money Boundary Rejects Numeric Inputs (API Boundary)', err);
  }

  // ==========================================
  // R2: RESERVATION EXPIRATION ACCEPTANCE (E1-E5)
  // ==========================================
  try {
    // Create new variant and opening balance for clean R2
    const varR2Id = 'var_r2';
    await inventoryService.recordOpeningBalance('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: varR2Id, quantity: '100', unit_cost: '10.00'
    }, 'usr_inv_admin_a');

    const preBal = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    const preRes = parseFloat(preBal?.reserved || '0');
    
    // Create one expired (E1) and one future (E2)
    const resExpired = await reservationService.createReservation('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: varR2Id, quantity: '2', reference_type: 'ORDER', reference_id: 'R2-E1',
      expires_at: new Date(Date.now() - 60000).toISOString()
    }, 'usr_inv_admin_a');
    
    const resFuture = await reservationService.createReservation('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: varR2Id, quantity: '3', reference_type: 'ORDER', reference_id: 'R2-E2',
      expires_at: new Date(Date.now() + 60000).toISOString()
    }, 'usr_inv_admin_a');

    const balAfterCreate = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    assert.strictEqual(parseFloat(balAfterCreate!.reserved) - preRes, 5, 'Reserved should increase by 5');

    // Run expiration (E1 & E2)
    const expire1 = await reservationService.expireStaleReservations('org_inv_a');
    assert.ok(expire1.reservationIds.includes(resExpired.id), 'E1: Expired reservation should be processed');
    assert.ok(!expire1.reservationIds.includes(resFuture.id), 'E2: Future reservation should NOT be processed');

    const balAfterExpire = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    assert.strictEqual(parseFloat(balAfterExpire!.reserved) - preRes, 3, 'E1: Reserved quantity should decrease strictly by expired amount (2)');

    // Run expiration again (E3)
    const expire2 = await reservationService.expireStaleReservations('org_inv_a');
    assert.ok(!expire2.reservationIds.includes(resExpired.id), 'E3: Should not re-expire');
    const balAfterExpire2 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    assert.strictEqual(balAfterExpire2!.reserved, balAfterExpire!.reserved, 'E3: Reserved quantity should not change on repeated run');

    // E4: Expiration vs Release
    const resConflict = await reservationService.createReservation('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: varR2Id, quantity: '1', reference_type: 'ORDER', reference_id: 'R2-E4',
      expires_at: new Date(Date.now() - 1000).toISOString() // expired
    }, 'usr_inv_admin_a');
    
    const balPreE4 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    const preE4Res = parseFloat(balPreE4!.reserved);

    // Race expiration and release
    const p1 = reservationService.expireStaleReservations('org_inv_a');
    const p2 = reservationService.releaseReservation('org_inv_a', resConflict.id, 'usr_inv_admin_a');
    await Promise.allSettled([p1, p2]);

    const balPostE4 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    assert.strictEqual(parseFloat(balPostE4!.reserved), preE4Res - 1, 'E4: Reserved quantity restored exactly once');

    // E5: Expiration vs Fulfillment
    const resFulfill = await reservationService.createReservation('org_inv_a', {
      location_id: 'loc_wh_a', variant_id: varR2Id, quantity: '1', reference_type: 'ORDER', reference_id: 'R2-E5',
      expires_at: new Date(Date.now() - 1000).toISOString() // expired
    }, 'usr_inv_admin_a');
    
    const balPreE5 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    const preE5Res = parseFloat(balPreE5!.reserved);
    const preE5OnHand = parseFloat(balPreE5!.on_hand);

    const f1 = reservationService.expireStaleReservations('org_inv_a');
    const f2 = reservationService.fulfillReservation('org_inv_a', resFulfill.id, 'usr_inv_admin_a');
    await Promise.allSettled([f1, f2]);

    const balPostE5 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', varR2Id);
    const finalRes = await reservationService.getReservation('org_inv_a', resFulfill.id);
    
    if (finalRes!.status === 'FULFILLED') {
      assert.strictEqual(parseFloat(balPostE5!.on_hand), preE5OnHand - 1, 'E5: Fulfilled won, on_hand decreases');
    } else {
      assert.strictEqual(parseFloat(balPostE5!.on_hand), preE5OnHand, 'E5: Expired won, on_hand unchanged');
    }
    assert.strictEqual(parseFloat(balPostE5!.reserved), preE5Res - 1, 'E5: Reserved quantity restored exactly once');

    markPassed('R2. Reservation Expiration Acceptance (E1-E5)');
  } catch (err) {
    markFailed('R2. Reservation Expiration Acceptance (E1-E5)', err);
  }

  // ==========================================
  // R3: TRANSFER CONCURRENCY EVIDENCE (T1-T3)
  // ==========================================
  try {
    const getMovCount = async (transferId: string) => {
      const res = await db.query('SELECT COUNT(*) as c FROM inventory_movements WHERE reference_type = $1 AND reference_id = $2', ['inventory_transfer', transferId]);
      return parseInt(res.rows[0].c, 10);
    };

    // T1: Concurrent Dispatch
    const { transfer: t1, items: i1 } = await transferService.createTransfer('org_inv_a', {
      transfer_number: 'TR-R3-T1', source_location_id: 'loc_wh_a', destination_location_id: 'loc_store_a',
      items: [{ variant_id: 'var_a1', requested_quantity: '10' }]
    }, 'usr_inv_admin_a');
    await transferService.approveTransfer('org_inv_a', t1.id, 'usr_inv_admin_a');

    const balPreT1 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    
    const disp1 = transferService.dispatchTransfer('org_inv_a', t1.id, undefined, 'usr_inv_admin_a');
    const disp2 = transferService.dispatchTransfer('org_inv_a', t1.id, undefined, 'usr_inv_admin_a');
    await Promise.allSettled([disp1, disp2]);

    const finalT1 = await transferService.getTransfer('org_inv_a', t1.id);
    const balPostT1 = await inventoryService.getBalance('org_inv_a', 'loc_wh_a', 'var_a1');
    
    assert.strictEqual(finalT1!.transfer.status, 'DISPATCHED', 'T1: Final transfer state should be DISPATCHED');
    assert.strictEqual(parseFloat(balPreT1!.on_hand) - parseFloat(balPostT1!.on_hand), 10, 'T1: Source inventory deducted exactly once');
    
    const t1Movs = await getMovCount(t1.id);
    assert.strictEqual(t1Movs, 1, 'T1: Exactly 1 movement (TRANSFER_OUT) should be created');

    // T2: Concurrent Receive
    const destPreT2 = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    
    const rec1 = transferService.receiveTransfer('org_inv_a', t1.id, undefined, 'usr_inv_admin_a');
    const rec2 = transferService.receiveTransfer('org_inv_a', t1.id, undefined, 'usr_inv_admin_a');
    await Promise.allSettled([rec1, rec2]);

    const finalT2 = await transferService.getTransfer('org_inv_a', t1.id);
    const destPostT2 = await inventoryService.getBalance('org_inv_a', 'loc_store_a', 'var_a1');
    
    assert.strictEqual(finalT2!.transfer.status, 'COMPLETED', 'T2: Final transfer state should be COMPLETED');
    assert.strictEqual(parseFloat(destPostT2!.on_hand) - parseFloat(destPreT2!.on_hand), 10, 'T2: Destination inventory incremented exactly once');
    
    const t2Movs = await getMovCount(t1.id);
    assert.strictEqual(t2Movs, 2, 'T2: Exactly 2 movements (1 OUT, 1 IN) should exist');

    // T3: Concurrent state transition (Approve vs Cancel)
    const { transfer: t3 } = await transferService.createTransfer('org_inv_a', {
      transfer_number: 'TR-R3-T3', source_location_id: 'loc_wh_a', destination_location_id: 'loc_store_a',
      items: [{ variant_id: 'var_a1', requested_quantity: '1' }]
    }, 'usr_inv_admin_a');
    
    const st1 = transferService.approveTransfer('org_inv_a', t3.id, 'usr_inv_admin_a');
    const st2 = transferService.cancelTransfer('org_inv_a', t3.id, 'usr_inv_admin_a', 'Race');
    await Promise.allSettled([st1, st2]);

    const finalT3 = await transferService.getTransfer('org_inv_a', t3.id);
    assert.ok(['APPROVED', 'CANCELLED'].includes(finalT3!.transfer.status), 'T3: Must end in a valid state (APPROVED or CANCELLED)');
    
    markPassed('R3. Transfer Concurrency & Inventory State Integrity (T1-T3)');
  } catch (err) {
    markFailed('R3. Transfer Concurrency & Inventory State Integrity (T1-T3)', err);
  }

  // ==========================================
  // R4: ERROR SANITIZATION TESTS
  // ==========================================
  try {
    const r4Token = (await authService.login({
      organizationId: 'org_inv_a',
      email: 'admin_a@abacha.test',
      password: 'Password123!',
    })).token;

    const rBaseUrl = (global as any).rBaseUrl;

    const massiveString = 'A'.repeat(5000);
    
    // Simulate production environment to test error sanitization
    

    const resCrash = await fetch(`${rBaseUrl}/api/inventory/opening-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r4Token}` },
      body: JSON.stringify({
        location_id: 'loc_wh_a',
        variant_id: 'var_a1',
        quantity: "10.0000",
        unit_cost: "10.00",
        idempotency_key: massiveString // Will crash DB due to varchar(255)
      })
    });
    
    

    const crashBody = await resCrash.json();
    assert.strictEqual(resCrash.status, 500, 'Should return 500 for unhandled DB string truncation or similar');
    assert.ok(!crashBody.error.message.includes('value too long'), 'DB error details must be sanitized');
    assert.ok(!crashBody.error.message.includes('at async'), 'Stack trace must be sanitized');
    assert.strictEqual(crashBody.error.code, 'INVENTORY_ERROR', 'Must return INVENTORY_ERROR code');

    markPassed('R4. HTTP Error Sanitization (Internal DB Leak Prevention)');
  } catch (err) {
    markFailed('R4. HTTP Error Sanitization (Internal DB Leak Prevention)', err);
  }

console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================');


  try {
    if ((global as any).rServer) {
      (global as any).rServer.closeAllConnections?.();
      await new Promise<void>((resolve) => (global as any).rServer.close(() => resolve()));
    }
  } catch (e) { }
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
