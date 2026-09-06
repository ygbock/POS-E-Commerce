import assert from 'node:assert';
import { getDatabaseClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { InventoryRepository } from '../server/repositories/inventoryRepository';
import { InventoryTransferRepository } from '../server/repositories/inventoryTransferRepository';
import { TransferService } from '../server/inventory/transferService';
import { InventoryService } from '../server/inventory/inventoryService';

/**
 * INV-001 Stock Transfer Domain & Event Ledger Test Suite
 * 
 * Tests:
 * 1. Transfer Creation & Validation (source != dest, duplicate variants, tenant locations & variants)
 * 2. Transfer Approval & Rejection Lifecycles
 * 3. Atomic Dispatch & Available Stock Invariants (TRANSFER_OUT movement + in_transit balance)
 * 4. Transfer Events Append-Only Ledger Audit Trail
 * 5. Atomic Receipt & Reconciled Balances (in_transit cleared + TRANSFER_IN movement)
 * 6. Discrepancy & Variance Accounting (received < dispatched, VARIANCE_RECORDED event)
 * 7. Over-Receipt Protection
 * 8. Cancellation State Guard (cannot cancel in-transit/completed transfers)
 * 9. Organization-Scoped Idempotency (Create, Dispatch, Receive replayed safely)
 * 10. Cross-Tenant Isolation Defense (Locations, Transfers, Events strictly isolated)
 */

async function runTransferTests() {
  console.log('======================================================');
  console.log(' Omnicore INV-001 Stock Transfer & Ledger Domain Tests');
  console.log('======================================================');

  const db: DatabaseClient = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  await runMigrations(db);

  const inventoryRepo = new InventoryRepository(db);
  const transferRepo = new InventoryTransferRepository(db);
  const transferService = new TransferService(inventoryRepo, transferRepo, db);
  const inventoryService = new InventoryService(inventoryRepo, undefined, db);

  const actorId = 'usr_transfer_tester';
  const orgA = 'org_transfer_a';
  const orgB = 'org_transfer_b';

  let passed = 0;
  let failed = 0;

  function markPassed(testName: string) {
    console.log(`  [TEST] ${testName}... PASSED`);
    passed++;
  }

  function markFailed(testName: string, err: any) {
    console.error(`  [TEST] ${testName}... FAILED!`, err);
    failed++;
  }

  // Setup: Seed organizations, locations, products, variants, opening stock
  try {
    await db.exec(`
      DELETE FROM stock_count_items;
      DELETE FROM stock_counts;
      DELETE FROM inventory_transfer_events;
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

    await db.exec(`
      INSERT INTO organizations (id, name, code, is_active) VALUES 
        ('org_transfer_a', 'Transfer Corp A', 'TR_ORG_A', TRUE),
        ('org_transfer_b', 'Transfer Corp B', 'TR_ORG_B', TRUE);

      INSERT INTO units_of_measure (id, organization_id, code, name, category) VALUES
        ('uom_tr_a', 'org_transfer_a', 'EA', 'Each', 'Count'),
        ('uom_tr_b', 'org_transfer_b', 'EA', 'Each', 'Count');

      INSERT INTO locations (id, organization_id, code, name, type) VALUES
        ('loc_tr_hub_a', 'org_transfer_a', 'HUB_A', 'Central Hub A', 'Warehouse'),
        ('loc_tr_retail_a', 'org_transfer_a', 'RET_A', 'Retail Store A', 'Retail Store'),
        ('loc_tr_hub_b', 'org_transfer_b', 'HUB_B', 'Central Hub B', 'Warehouse');

      INSERT INTO products (id, organization_id, name, slug, unit_code, product_type) VALUES
        ('prod_tr_1', 'org_transfer_a', 'Test Product 1', 'test-product-1', 'EA', 'standard'),
        ('prod_tr_b', 'org_transfer_b', 'Org B Product', 'org-b-product', 'EA', 'standard');

      INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price) VALUES
        ('var_tr_1', 'org_transfer_a', 'prod_tr_1', 'SKU-TR-1', 'BAR-TR-1', 'Variant 1', 15.00, 25.00),
        ('var_tr_2', 'org_transfer_a', 'prod_tr_1', 'SKU-TR-2', 'BAR-TR-2', 'Variant 2', 30.00, 50.00),
        ('var_tr_b1', 'org_transfer_b', 'prod_tr_b', 'SKU-TR-B1', 'BAR-TR-B1', 'Org B Variant', 10.00, 20.00);
    `);

    // Seed Opening Stock for Org A at Central Hub A:
    // var_tr_1: 200 on hand
    // var_tr_2: 100 on hand
    await inventoryService.recordOpeningBalance(
      orgA,
      { location_id: 'loc_tr_hub_a', variant_id: 'var_tr_1', quantity: 200, unit_cost: 15.00 },
      actorId
    );
    await inventoryService.recordOpeningBalance(
      orgA,
      { location_id: 'loc_tr_hub_a', variant_id: 'var_tr_2', quantity: 100, unit_cost: 30.00 },
      actorId
    );
  } catch (err) {
    console.error('Failed to setup test seed:', err);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // TEST 1: Transfer Creation & Validation
  // -------------------------------------------------------------------------
  try {
    // 1a. Disallow same source and destination
    await assert.rejects(
      async () => {
        await transferService.createTransfer(
          orgA,
          {
            source_location_id: 'loc_tr_hub_a',
            destination_location_id: 'loc_tr_hub_a',
            items: [{ variant_id: 'var_tr_1', requested_quantity: 10 }],
          },
          actorId
        );
      },
      /Source and destination locations must be different/
    );

    // 1b. Disallow duplicate variants in items array
    await assert.rejects(
      async () => {
        await transferService.createTransfer(
          orgA,
          {
            source_location_id: 'loc_tr_hub_a',
            destination_location_id: 'loc_tr_retail_a',
            items: [
              { variant_id: 'var_tr_1', requested_quantity: 10 },
              { variant_id: 'var_tr_1', requested_quantity: 5 },
            ],
          },
          actorId
        );
      },
      /Duplicate variant/
    );

    // 1c. Disallow non-positive quantities
    await assert.rejects(
      async () => {
        await transferService.createTransfer(
          orgA,
          {
            source_location_id: 'loc_tr_hub_a',
            destination_location_id: 'loc_tr_retail_a',
            items: [{ variant_id: 'var_tr_1', requested_quantity: 0 }],
          },
          actorId
        );
      },
      /greater than zero/
    );

    // 1d. Create valid transfer in REQUESTED state
    const { transfer, items, events } = await transferService.createTransfer(
      orgA,
      {
        transfer_number: 'TR-UNIT-001',
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [
          { variant_id: 'var_tr_1', requested_quantity: 50 },
          { variant_id: 'var_tr_2', requested_quantity: 30 },
        ],
        notes: 'Replenish retail location',
      },
      actorId
    );

    assert.strictEqual(transfer.status, 'REQUESTED');
    assert.strictEqual(transfer.source_location_id, 'loc_tr_hub_a');
    assert.strictEqual(transfer.destination_location_id, 'loc_tr_retail_a');
    assert.strictEqual(items.length, 2);
    assert.strictEqual(events.length, 2); // CREATED + REQUESTED
    assert.strictEqual(events[0].event_type, 'CREATED');
    assert.strictEqual(events[1].event_type, 'REQUESTED');

    markPassed('1. Transfer Creation & Validation Invariants');
  } catch (err) {
    markFailed('1. Transfer Creation & Validation Invariants', err);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Transfer Approval & Rejection Lifecycles
  // -------------------------------------------------------------------------
  let approvedTransferId: string;
  try {
    const { transfer } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 25 }],
      },
      actorId
    );

    // Approve
    const approved = await transferService.approveTransfer(orgA, transfer.id, actorId);
    assert.strictEqual(approved.status, 'APPROVED');
    assert.strictEqual(approved.approved_by, actorId);
    approvedTransferId = approved.id;

    // Rejecting an already approved transfer should fail
    await assert.rejects(
      async () => {
        await transferService.rejectTransfer(orgA, approved.id, actorId, 'Changed mind');
      },
      /Cannot reject transfer in state 'APPROVED'/
    );

    // Create another transfer to test rejection
    const { transfer: rejectedTr } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 10 }],
      },
      actorId
    );

    const rejected = await transferService.rejectTransfer(orgA, rejectedTr.id, actorId, 'Insufficient operational budget');
    assert.strictEqual(rejected.status, 'REJECTED');

    // Verify rejection event in ledger
    const events = await transferService.getTransferEvents(orgA, rejectedTr.id);
    const rejEvent = events.find((e) => e.event_type === 'REJECTED');
    assert.ok(rejEvent);
    assert.strictEqual(rejEvent!.reason, 'Insufficient operational budget');

    markPassed('2. Transfer Approval & Rejection Lifecycles');
  } catch (err) {
    markFailed('2. Transfer Approval & Rejection Lifecycles', err);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Atomic Dispatch & Available Stock Invariants
  // -------------------------------------------------------------------------
  try {
    // Current stock at Hub A: var_tr_1 has 200 on hand
    // approvedTransferId requests 25 units of var_tr_1

    // 3a. Disallow dispatching more than approved quantity
    await assert.rejects(
      async () => {
        await transferService.dispatchTransfer(
          orgA,
          approvedTransferId,
          { var_tr_1: 30 }, // 30 > 25 approved
          actorId
        );
      },
      /cannot exceed approved quantity/
    );

    // 3b. Test insufficient available stock error:
    // Create a transfer for 500 units (we only have 200)
    const { transfer: hugeTr } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 500 }],
      },
      actorId
    );
    await transferService.approveTransfer(orgA, hugeTr.id, actorId);

    await assert.rejects(
      async () => {
        await transferService.dispatchTransfer(orgA, hugeTr.id, undefined, actorId);
      },
      /INSUFFICIENT_STOCK/
    );

    // 3c. Valid dispatch of approvedTransferId (25 units)
    const dispatched = await transferService.dispatchTransfer(orgA, approvedTransferId, undefined, actorId);
    assert.strictEqual(dispatched.status, 'DISPATCHED');
    assert.strictEqual(dispatched.dispatched_by, actorId);

    // Verify stock at source Hub A: on_hand reduced from 200 to 175
    const hubBal = await inventoryService.getBalance(orgA, 'loc_tr_hub_a', 'var_tr_1');
    assert.strictEqual(hubBal!.on_hand, 175);

    // Verify stock at destination Retail A: in_transit increased to 25, on_hand remains 0
    const retailBal = await inventoryService.getBalance(orgA, 'loc_tr_retail_a', 'var_tr_1');
    assert.strictEqual(retailBal!.in_transit, 25);
    assert.strictEqual(retailBal!.on_hand, 0);

    markPassed('3. Atomic Dispatch & Available Stock Invariants');
  } catch (err) {
    markFailed('3. Atomic Dispatch & Available Stock Invariants', err);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Transfer Events Append-Only Ledger Audit Trail
  // -------------------------------------------------------------------------
  try {
    const events = await transferService.getTransferEvents(orgA, approvedTransferId);

    // Must have: CREATED, REQUESTED, APPROVED, DISPATCHED, IN_TRANSIT
    const eventTypes = events.map((e) => e.event_type);
    assert.ok(eventTypes.includes('CREATED'));
    assert.ok(eventTypes.includes('REQUESTED'));
    assert.ok(eventTypes.includes('APPROVED'));
    assert.ok(eventTypes.includes('DISPATCHED'));
    assert.ok(eventTypes.includes('IN_TRANSIT'));

    // Check quantities and actor
    const dispEvent = events.find((e) => e.event_type === 'DISPATCHED');
    assert.strictEqual(dispEvent!.quantity, 25);
    assert.strictEqual(dispEvent!.actor_id, actorId);
    assert.strictEqual(dispEvent!.source_location_id, 'loc_tr_hub_a');
    assert.strictEqual(dispEvent!.destination_location_id, 'loc_tr_retail_a');

    markPassed('4. Transfer Events Append-Only Ledger Audit Trail');
  } catch (err) {
    markFailed('4. Transfer Events Append-Only Ledger Audit Trail', err);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Atomic Receipt & Reconciled Balances
  // -------------------------------------------------------------------------
  try {
    // Receive the full 25 units at Retail A
    const received = await transferService.receiveTransfer(
      orgA,
      approvedTransferId,
      { var_tr_1: 25 },
      actorId
    );
    assert.strictEqual(received.status, 'COMPLETED');
    assert.strictEqual(received.received_by, actorId);

    // Verify balances at Retail A:
    // in_transit cleared (25 -> 0)
    // on_hand credited (+25 -> 25)
    // available is 25
    const retailBal = await inventoryService.getBalance(orgA, 'loc_tr_retail_a', 'var_tr_1');
    assert.strictEqual(retailBal!.in_transit, 0);
    assert.strictEqual(retailBal!.on_hand, 25);
    assert.strictEqual(retailBal!.available, 25);

    // Verify item record
    const details = await transferService.getTransfer(orgA, approvedTransferId);
    assert.strictEqual(details!.items[0].dispatched_quantity, 25);
    assert.strictEqual(details!.items[0].received_quantity, 25);
    assert.strictEqual(details!.items[0].variance_quantity, 0);

    // Verify events: RECEIVED and COMPLETED
    const events = await transferService.getTransferEvents(orgA, approvedTransferId);
    const eventTypes = events.map((e) => e.event_type);
    assert.ok(eventTypes.includes('RECEIVED'));
    assert.ok(eventTypes.includes('COMPLETED'));

    markPassed('5. Atomic Receipt & Reconciled Balances');
  } catch (err) {
    markFailed('5. Atomic Receipt & Reconciled Balances', err);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Discrepancy & Variance Accounting
  // -------------------------------------------------------------------------
  try {
    // Current stock at Hub A: var_tr_1 has 175
    // Dispatch 20 units, but receive only 17 (3 units damaged/lost during transport)
    const { transfer } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 20 }],
      },
      actorId
    );

    await transferService.approveTransfer(orgA, transfer.id, actorId);
    await transferService.dispatchTransfer(orgA, transfer.id, undefined, actorId);

    // Receive only 17
    const completed = await transferService.receiveTransfer(
      orgA,
      transfer.id,
      { var_tr_1: 17 },
      actorId
    );
    assert.strictEqual(completed.status, 'COMPLETED');

    // Details check: variance = received - dispatched = 17 - 20 = -3
    const details = await transferService.getTransfer(orgA, transfer.id);
    assert.strictEqual(details!.items[0].dispatched_quantity, 20);
    assert.strictEqual(details!.items[0].received_quantity, 17);
    assert.strictEqual(details!.items[0].variance_quantity, -3);

    // Balances check:
    // Destination Retail A:
    // on_hand increases from 25 by 17 -> 42
    // in_transit is completely cleared to 0 (the missing 3 units do NOT remain stuck in transit!)
    const retailBal = await inventoryService.getBalance(orgA, 'loc_tr_retail_a', 'var_tr_1');
    assert.strictEqual(retailBal!.in_transit, 0);
    assert.strictEqual(retailBal!.on_hand, 42);

    // Events check: VARIANCE_RECORDED event in ledger with quantity = -3
    const events = await transferService.getTransferEvents(orgA, transfer.id);
    const varianceEvent = events.find((e) => e.event_type === 'VARIANCE_RECORDED');
    assert.ok(varianceEvent, 'VARIANCE_RECORDED event must be appended');
    assert.strictEqual(varianceEvent!.quantity, -3);
    assert.strictEqual(varianceEvent!.transfer_item_id, details!.items[0].id);

    markPassed('6. Discrepancy & Variance Accounting (variance = received - dispatched)');
  } catch (err) {
    markFailed('6. Discrepancy & Variance Accounting (variance = received - dispatched)', err);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Over-Receipt Protection
  // -------------------------------------------------------------------------
  try {
    const { transfer } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 10 }],
      },
      actorId
    );
    await transferService.approveTransfer(orgA, transfer.id, actorId);
    await transferService.dispatchTransfer(orgA, transfer.id, undefined, actorId);

    // Try receiving 15 (exceeds dispatched 10) without allowOverReceive flag
    await assert.rejects(
      async () => {
        await transferService.receiveTransfer(
          orgA,
          transfer.id,
          { var_tr_1: 15 },
          actorId,
          undefined,
          { allowOverReceive: false }
        );
      },
      /Over-receiving is not permitted/
    );

    markPassed('7. Over-Receipt Protection Guard');
  } catch (err) {
    markFailed('7. Over-Receipt Protection Guard', err);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Cancellation Guard & Rules
  // -------------------------------------------------------------------------
  try {
    // 8a. Can cancel a REQUESTED transfer
    const { transfer: trToCancel } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 5 }],
      },
      actorId
    );
    const cancelled = await transferService.cancelTransfer(orgA, trToCancel.id, actorId, 'No longer needed');
    assert.strictEqual(cancelled.status, 'CANCELLED');

    // 8b. Cannot cancel a DISPATCHED / IN_TRANSIT transfer
    const { transfer: trInTransit } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 5 }],
      },
      actorId
    );
    await transferService.approveTransfer(orgA, trInTransit.id, actorId);
    await transferService.dispatchTransfer(orgA, trInTransit.id, undefined, actorId);

    await assert.rejects(
      async () => {
        await transferService.cancelTransfer(orgA, trInTransit.id, actorId, 'Try cancel transit');
      },
      /Dispatched transfers cannot be cancelled/
    );

    markPassed('8. Cancellation Guard & Terminal State Rules');
  } catch (err) {
    markFailed('8. Cancellation Guard & Terminal State Rules', err);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Organization-Scoped Idempotency
  // -------------------------------------------------------------------------
  try {
    const createKey = `idemp_create_${Date.now()}`;

    // 9a. Create replay
    const res1 = await transferService.createTransfer(
      orgA,
      {
        transfer_number: 'TR-IDEMP-01',
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_2', requested_quantity: 10 }],
        idempotency_key: createKey,
      },
      actorId
    );

    const res2 = await transferService.createTransfer(
      orgA,
      {
        transfer_number: 'TR-IDEMP-01',
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_2', requested_quantity: 10 }],
        idempotency_key: createKey,
      },
      actorId
    );

    assert.strictEqual(res1.transfer.id, res2.transfer.id, 'Idempotent creation returns the same transfer');

    // 9b. Dispatch replay
    await transferService.approveTransfer(orgA, res1.transfer.id, actorId);
    const dispatchKey = `idemp_disp_${Date.now()}`;

    const disp1 = await transferService.dispatchTransfer(orgA, res1.transfer.id, undefined, actorId, dispatchKey);
    const disp2 = await transferService.dispatchTransfer(orgA, res1.transfer.id, undefined, actorId, dispatchKey);
    assert.strictEqual(disp1.id, disp2.id);

    // Verify stock was only deducted once!
    // Hub A var_tr_2 had 100 on hand initially. After 10 deducted, it must be 90 (not 80!)
    const balHub2 = await inventoryService.getBalance(orgA, 'loc_tr_hub_a', 'var_tr_2');
    assert.strictEqual(balHub2!.on_hand, 90, 'Stock must only be deducted once upon replay');

    // 9c. Receive replay
    const receiveKey = `idemp_rec_${Date.now()}`;
    const rec1 = await transferService.receiveTransfer(orgA, res1.transfer.id, { var_tr_2: 10 }, actorId, receiveKey);
    const rec2 = await transferService.receiveTransfer(orgA, res1.transfer.id, { var_tr_2: 10 }, actorId, receiveKey);
    assert.strictEqual(rec1.id, rec2.id);

    // Verify stock at retail was only credited once (10 on hand, not 20)
    const balRetail2 = await inventoryService.getBalance(orgA, 'loc_tr_retail_a', 'var_tr_2');
    assert.strictEqual(balRetail2!.on_hand, 10, 'Stock must only be credited once upon replay');

    markPassed('9. Organization-Scoped Idempotency (Create, Dispatch, Receive)');
  } catch (err) {
    markFailed('9. Organization-Scoped Idempotency (Create, Dispatch, Receive)', err);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Multi-Tenant Boundary Enforcement
  // -------------------------------------------------------------------------
  try {
    // 10a. Cross-tenant location access: Org A cannot create transfer with Org B location
    await assert.rejects(
      async () => {
        await transferService.createTransfer(
          orgA,
          {
            source_location_id: 'loc_tr_hub_a',
            destination_location_id: 'loc_tr_hub_b', // Org B's location!
            items: [{ variant_id: 'var_tr_1', requested_quantity: 10 }],
          },
          actorId
        );
      },
      /TENANT_ACCESS_DENIED/
    );

    // 10b. Cross-tenant variant access: Org A cannot transfer Org B's variant
    await assert.rejects(
      async () => {
        await transferService.createTransfer(
          orgA,
          {
            source_location_id: 'loc_tr_hub_a',
            destination_location_id: 'loc_tr_retail_a',
            items: [{ variant_id: 'var_tr_b1', requested_quantity: 5 }], // Org B's variant!
          },
          actorId
        );
      },
      /TENANT_ACCESS_DENIED/
    );

    // 10c. Cross-tenant transfer inspection: Org B cannot view or manipulate Org A's transfer
    const { transfer: trA } = await transferService.createTransfer(
      orgA,
      {
        source_location_id: 'loc_tr_hub_a',
        destination_location_id: 'loc_tr_retail_a',
        items: [{ variant_id: 'var_tr_1', requested_quantity: 5 }],
      },
      actorId
    );

    const viewFromB = await transferService.getTransfer(orgB, trA.id);
    assert.strictEqual(viewFromB, null, 'Org B must not be able to find Org A transfer');

    await assert.rejects(
      async () => {
        await transferService.approveTransfer(orgB, trA.id, actorId);
      },
      /TRANSFER_NOT_FOUND/
    );

    markPassed('10. Multi-Tenant Boundary Enforcement (Locations, Variants, Transfers)');
  } catch (err) {
    markFailed('10. Multi-Tenant Boundary Enforcement (Locations, Variants, Transfers)', err);
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

runTransferTests().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
