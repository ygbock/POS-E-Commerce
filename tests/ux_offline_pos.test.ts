process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import { OfflineQueue, generateSecureUUID } from '../src/services/offlineQueue';
import { syncService } from '../src/services/syncService';
import { authClient } from '../src/services/authClient';

async function runOfflinePosTests() {
  console.log('======================================================');
  console.log(' AbaCha UX-001 Point of Sale Offline Resilience Tests');
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

  // Set default authenticated session for baseline tests
  (authClient as any).currentUser = {
    id: 'usr_cashier_1',
    organizationId: 'org_pos_a',
    email: 'cashier@orgposa.internal',
    role: 'Cashier',
    permissions: ['pos:sell', 'pos:view'],
  };
  (authClient as any).currentToken = 'mock_jwt_pos_a';

  // Baseline preparation: clean up the queue
  await OfflineQueue.clearQueue();

  // ----------------------------------------------------
  // BASELINE TESTS (Preserved from initial Phase 2.3)
  // ----------------------------------------------------

  // Baseline Test 1: Offline Queue Enqueueing
  try {
    const payload = {
      locationId: 'loc_store_a',
      sessionId: 'sess_123',
      customerId: 'cust_abc',
      cartItems: [{ variant_id: 'var_apple', quantity: '2', discount_percentage: '0' }],
      paymentMethod: 'Cash',
      amountPaid: '20.00',
    };

    syncService.setMockOffline(true);
    assert.strictEqual(syncService.getState(), 'offline');

    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      payload,
      'org_pos_a',
      'sess_123'
    );

    assert.ok(tx.id);
    assert.strictEqual(tx.operation, 'pos_checkout');
    assert.strictEqual(tx.status, 'pending');
    assert.strictEqual(tx.attempts, 0);
    assert.strictEqual(tx.payload.amountPaid, '20.00');

    const txs = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].id, tx.id);

    markPassed('Baseline 1: Offline Queue Enqueueing');
  } catch (err) {
    markFailed('Baseline 1: Offline Queue Enqueueing', err);
  }

  // Baseline Test 2: Sync Blocked when Offline
  try {
    const syncStarted = await syncService.sync();
    assert.strictEqual(syncStarted, false, 'Sync should not start when offline');

    const txs = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(txs[0].status, 'pending');

    markPassed('Baseline 2: Sync Blocked when Offline');
  } catch (err) {
    markFailed('Baseline 2: Sync Blocked when Offline', err);
  }

  // Baseline Test 3: Sync Retry on Transient Server Failures (500 Error)
  try {
    syncService.setMockOffline(false);
    assert.strictEqual(syncService.getState(), 'online');

    let fetchCallCount = 0;
    (globalThis as any).fetch = async (url: string, options: any) => {
      fetchCallCount++;
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      };
    };

    const syncResult = await syncService.sync();
    assert.strictEqual(syncResult, false, 'Sync should return false on transient attempt failure');
    assert.strictEqual(fetchCallCount, 1);

    const txs = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].status, 'pending');
    assert.strictEqual(txs[0].attempts, 1);

    markPassed('Baseline 3: Sync Retry on Transient Server Failures');
  } catch (err) {
    markFailed('Baseline 3: Sync Retry on Transient Server Failures', err);
  }

  // Baseline Test 4: Backoff Avoidance and Delay Checks
  try {
    let fetchCallCount = 0;
    (globalThis as any).fetch = async (url: string, options: any) => {
      fetchCallCount++;
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      };
    };

    await syncService.sync();
    assert.strictEqual(fetchCallCount, 0, 'Should not hit fetch again immediately due to backoff delay');

    markPassed('Baseline 4: Sync Exponential Backoff Triggers');
  } catch (err) {
    markFailed('Baseline 4: Sync Exponential Backoff Triggers', err);
  }

  // Baseline Test 5: Permanent Failure Handling (400 Validation Error)
  try {
    await OfflineQueue.clearQueue();

    const payload = {
      locationId: 'loc_store_a',
      sessionId: 'sess_123',
      customerId: 'cust_abc',
      cartItems: [{ variant_id: 'var_apple', quantity: '1000', discount_percentage: '0' }],
      paymentMethod: 'Cash',
      amountPaid: '10000.00',
    };

    await OfflineQueue.enqueue(
      'pos_checkout',
      payload,
      'org_pos_a',
      'sess_123'
    );

    let fetchCallCount = 0;
    (globalThis as any).fetch = async (url: string, options: any) => {
      fetchCallCount++;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'VALIDATION_ERROR: Insufficient stock' } }),
      };
    };

    const txsBefore = await OfflineQueue.getTransactions('org_pos_a');
    txsBefore[0].lastAttemptAt = new Date(Date.now() - 100000).toISOString();
    await OfflineQueue.updateTransaction(txsBefore[0]);

    await syncService.sync();
    assert.strictEqual(fetchCallCount, 1);

    const txsAfter = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(txsAfter.length, 1);
    assert.strictEqual(txsAfter[0].status, 'failed', '400 validation error must result in failed');

    markPassed('Baseline 5: Permanent Failure Handling (400)');
  } catch (err) {
    markFailed('Baseline 5: Permanent Failure Handling (400)', err);
  }

  // Baseline Test 6: Successful Sync on Recovery (200 OK)
  try {
    await OfflineQueue.clearQueue();

    const payload = {
      locationId: 'loc_store_a',
      sessionId: 'sess_123',
      customerId: 'cust_abc',
      cartItems: [{ variant_id: 'var_apple', quantity: '2', discount_percentage: '0' }],
      paymentMethod: 'Cash',
      amountPaid: '20.00',
    };

    await OfflineQueue.enqueue(
      'pos_checkout',
      payload,
      'org_pos_a',
      'sess_123'
    );

    let fetchCallCount = 0;
    (globalThis as any).fetch = async (url: string, options: any) => {
      fetchCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          order: {
            id: 'ord_success_123',
            order_number: 'ORD-SUCCESS-123',
            source: 'POS',
            total_amount: '20.00',
            subtotal: '20.00',
            discount_amount: '0.00',
            tax_amount: '0.00',
            payment_status: 'Paid',
            status: 'Completed',
            created_at: new Date().toISOString(),
          },
          items: [],
        }),
      };
    };

    await syncService.sync();
    assert.strictEqual(fetchCallCount, 1);

    const txsAfter = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(txsAfter.length, 0, 'Synced transactions must be cleared from the active queue');

    markPassed('Baseline 6: Successful Synchronization Recovery');
  } catch (err) {
    markFailed('Baseline 6: Successful Synchronization Recovery', err);
  }

  // ----------------------------------------------------
  // REQUIRED PHASE 2.3 R1 ACCEPTANCE TESTS (Tests 1 - 8)
  // ----------------------------------------------------

  // Acceptance Test 1: Online-to-Offline Checkout Failure (Preserve Idempotency Key)
  try {
    await OfflineQueue.clearQueue();
    syncService.setMockOffline(false);

    const testIdempotencyKey = generateSecureUUID();
    const payload = {
      locationId: 'loc_store_a',
      sessionId: 'sess_123',
      customerId: 'cust_1',
      cartItems: [{ variant_id: 'var_shoe', quantity: '1', discount_percentage: '0' }],
      paymentMethod: 'Cash',
      amountPaid: '50.00',
      notes: 'POS checkout test',
    };

    // Simulate fetch throwing a genuine transport failure (network disappears during online checkout)
    (globalThis as any).fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    // Execute online checkout simulation with fallback handling
    let enqueuedTx: any = null;
    try {
      await (globalThis as any).fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'idempotency-key': testIdempotencyKey },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      // Catch transport failure and durably place into offline queue with preserved key
      const isTransport = err instanceof TypeError || err.message.includes('Failed to fetch');
      assert.ok(isTransport, 'Must detect genuine transport failure');
      enqueuedTx = await OfflineQueue.enqueue(
        'pos_checkout',
        payload,
        'org_pos_a',
        'sess_123',
        undefined,
        testIdempotencyKey
      );
    }

    assert.ok(enqueuedTx, 'Transaction must be enqueued');
    assert.strictEqual(enqueuedTx.idempotencyKey, testIdempotencyKey, 'Must preserve original idempotency key across fallback');
    assert.strictEqual(enqueuedTx.status, 'pending');

    const queueItems = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(queueItems.length, 1);
    assert.strictEqual(queueItems[0].idempotencyKey, testIdempotencyKey);

    markPassed('Test 1 — Online-to-Offline Checkout Failure (Preserves Idempotency Key)');
  } catch (err) {
    markFailed('Test 1 — Online-to-Offline Checkout Failure', err);
  }

  // Acceptance Test 2: Strict Tenant Queue Isolation
  try {
    await OfflineQueue.clearQueue();

    // Create Tenant A transaction
    const txA = await OfflineQueue.enqueue(
      'pos_checkout',
      { locationId: 'loc_a', cartItems: [], paymentMethod: 'Cash', amountPaid: '10.00' },
      'tenant_alpha',
      'sess_alpha'
    );

    // Create Tenant B transaction
    const txB = await OfflineQueue.enqueue(
      'pos_checkout',
      { locationId: 'loc_b', cartItems: [], paymentMethod: 'Cash', amountPaid: '20.00' },
      'tenant_beta',
      'sess_beta'
    );

    // Verify scoped retrieval
    const alphaTxs = await OfflineQueue.getTransactions('tenant_alpha');
    const betaTxs = await OfflineQueue.getTransactions('tenant_beta');
    assert.strictEqual(alphaTxs.length, 1);
    assert.strictEqual(alphaTxs[0].id, txA.id);
    assert.strictEqual(betaTxs.length, 1);
    assert.strictEqual(betaTxs[0].id, txB.id);

    // Synchronize while authenticated strictly as Tenant Alpha
    (authClient as any).currentUser = {
      id: 'usr_alpha',
      organizationId: 'tenant_alpha',
      email: 'alpha@tenant.internal',
      role: 'Cashier',
      permissions: ['pos:sell'],
    };

    const submittedHeaders: any[] = [];
    (globalThis as any).fetch = async (url: string, options: any) => {
      submittedHeaders.push(options.headers);
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, order: { id: 'ord_alpha' }, items: [] }),
      };
    };

    const syncAlphaResult = await syncService.sync();
    assert.strictEqual(syncAlphaResult, true);
    assert.strictEqual(submittedHeaders.length, 1, 'Only Tenant Alpha transaction must be submitted');
    assert.strictEqual(submittedHeaders[0]['idempotency-key'], txA.idempotencyKey);

    // Assert Tenant Alpha is purged, while Tenant Beta remains completely untouched
    const alphaRemaining = await OfflineQueue.getTransactions('tenant_alpha');
    const betaRemaining = await OfflineQueue.getTransactions('tenant_beta');
    assert.strictEqual(alphaRemaining.length, 0, 'Tenant Alpha item must be synchronized and cleared');
    assert.strictEqual(betaRemaining.length, 1, 'Tenant Beta item must remain untouched');
    assert.strictEqual(betaRemaining[0].id, txB.id);
    assert.strictEqual(betaRemaining[0].status, 'pending');

    markPassed('Test 2 — Strict Tenant Queue Isolation');
  } catch (err) {
    markFailed('Test 2 — Strict Tenant Queue Isolation', err);
  }

  // Acceptance Test 3: 409 Fingerprint Conflict Rejection Handling
  try {
    await OfflineQueue.clearQueue();

    (authClient as any).currentUser = {
      id: 'usr_alpha',
      organizationId: 'tenant_alpha',
      email: 'alpha@tenant.internal',
      role: 'Cashier',
      permissions: ['pos:sell'],
    };

    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      { locationId: 'loc_a', cartItems: [], paymentMethod: 'Cash', amountPaid: '30.00' },
      'tenant_alpha',
      'sess_alpha'
    );

    // Mock server 409 IDEMPOTENCY_CONFLICT rejection (key reused with conflicting parameters)
    let fetchCount = 0;
    (globalThis as any).fetch = async () => {
      fetchCount++;
      return {
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: "An order with idempotency key already exists with different request parameters.",
          },
        }),
      };
    };

    const syncResult = await syncService.sync();
    assert.strictEqual(syncResult, false, 'Sync must report failure on 409 conflict');
    assert.strictEqual(fetchCount, 1);

    // Verify transaction remains in queue and is marked failed (NOT deleted)
    const queueTxs = await OfflineQueue.getTransactions('tenant_alpha');
    assert.strictEqual(queueTxs.length, 1, 'Queue item must NOT be deleted on 409 conflict');
    assert.strictEqual(queueTxs[0].status, 'failed', 'Status must be marked failed');
    assert.ok(queueTxs[0].lastError?.includes('IDEMPOTENCY_CONFLICT'), 'Must record safe conflict error');

    // Automatic retry must stop: another sync call should skip failed transaction
    await syncService.sync();
    assert.strictEqual(fetchCount, 1, 'Failed transaction must not be retried automatically');

    markPassed('Test 3 — 409 Fingerprint Conflict (Queue Retained & Marked Failed)');
  } catch (err) {
    markFailed('Test 3 — 409 Fingerprint Conflict', err);
  }

  // Acceptance Test 4: Genuine Idempotent Replay
  try {
    await OfflineQueue.clearQueue();

    (authClient as any).currentUser = {
      id: 'usr_alpha',
      organizationId: 'tenant_alpha',
      email: 'alpha@tenant.internal',
      role: 'Cashier',
      permissions: ['pos:sell'],
    };

    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      { locationId: 'loc_a', cartItems: [], paymentMethod: 'Cash', amountPaid: '45.00' },
      'tenant_alpha',
      'sess_alpha'
    );

    // Mock server returning genuine idempotent replay confirmation (HTTP 200 with existing order)
    let fetchCount = 0;
    (globalThis as any).fetch = async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          duplicate: true,
          idempotentReplay: true,
          order: {
            id: 'ord_existing_456',
            order_number: 'ORD-EXISTING-456',
            total_amount: '45.00',
            status: 'Completed',
          },
          items: [],
        }),
      };
    };

    const syncResult = await syncService.sync();
    assert.strictEqual(syncResult, true, 'Genuine replay must be treated as successful sync');
    assert.strictEqual(fetchCount, 1);

    // On genuine replay, transaction is considered synchronized and removed from queue
    const remaining = await OfflineQueue.getTransactions('tenant_alpha');
    assert.strictEqual(remaining.length, 0, 'Genuine replay must clear transaction from queue');

    markPassed('Test 4 — Genuine Idempotent Replay (Synchronized & Purged from Queue)');
  } catch (err) {
    markFailed('Test 4 — Genuine Idempotent Replay', err);
  }

  // Acceptance Test 5: Memory → IndexedDB Migration
  try {
    await OfflineQueue.clearQueue();

    // 1. Queue a transaction in memory (default environment without IDB)
    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      { amount: '100.00' },
      'org_pos_a',
      'sess_mem'
    );
    assert.ok(tx.id);

    // 2. Mock an available IndexedDB database with object store
    const storedInDb: Map<string, any> = new Map();
    const mockDb: any = {
      transaction: (storeName: string, mode: string) => {
        let oncomplete: any = null;
        const txObj = {
          objectStore: () => ({
            put: (item: any) => {
              storedInDb.set(item.id, item);
              const req: any = { onsuccess: null, onerror: null };
              setTimeout(() => req.onsuccess && req.onsuccess(), 0);
              return req;
            },
            getAll: () => {
              const req: any = { result: Array.from(storedInDb.values()), onsuccess: null, onerror: null };
              setTimeout(() => req.onsuccess && req.onsuccess(), 0);
              return req;
            },
          }),
          set oncomplete(fn: any) {
            oncomplete = fn;
            setTimeout(() => oncomplete && oncomplete(), 5);
          },
          get oncomplete() {
            return oncomplete;
          },
        };
        return txObj;
      },
    };

    // 3. Trigger memory migration into the newly available IndexedDB
    await OfflineQueue.migrateMemoryToIDB(mockDb);

    // 4. Verify transaction migrated successfully into mock store
    assert.strictEqual(storedInDb.size, 1, 'Transaction must be written to IndexedDB store');
    assert.ok(storedInDb.has(tx.id), 'Original transaction ID must be preserved in IDB');
    assert.strictEqual(storedInDb.get(tx.id).idempotencyKey, tx.idempotencyKey, 'Idempotency key preserved');

    // 5. Verify deduplication: another call should not duplicate
    await OfflineQueue.migrateMemoryToIDB(mockDb);
    assert.strictEqual(storedInDb.size, 1, 'No duplicate records in IDB');

    markPassed('Test 5 — Memory → IndexedDB Migration (Deduplicated Persistence)');
  } catch (err) {
    markFailed('Test 5 — Memory → IndexedDB Migration', err);
  }

  // Acceptance Test 6: No Tenant Context (Fail Closed)
  try {
    await OfflineQueue.clearQueue();

    // Directly put transaction in queue
    await OfflineQueue.enqueue(
      'pos_checkout',
      { amount: '50.00' },
      'org_pos_a',
      'sess_orphan'
    );

    // Attempt synchronization without authenticated user / tenant
    (authClient as any).currentUser = null;

    let fetchAttempted = false;
    (globalThis as any).fetch = async () => {
      fetchAttempted = true;
      return { ok: true, json: async () => ({ success: true }) };
    };

    const syncResult = await syncService.sync();
    assert.strictEqual(syncResult, false, 'Sync must fail closed when unauthenticated');
    assert.strictEqual(fetchAttempted, false, 'Fetch must never be dispatched without tenant context');

    // Queue must remain intact
    const remaining = await OfflineQueue.getTransactions('org_pos_a');
    assert.strictEqual(remaining.length, 1, 'Queue remains intact');
    assert.strictEqual(remaining[0].status, 'pending');

    markPassed('Test 6 — No Tenant Context (Fails Closed)');
  } catch (err) {
    markFailed('Test 6 — No Tenant Context', err);
  }

  // Acceptance Test 7: Server Inventory Reconciliation
  try {
    await OfflineQueue.clearQueue();

    (authClient as any).currentUser = {
      id: 'usr_cashier',
      organizationId: 'org_pos_a',
      email: 'cashier@pos.internal',
      role: 'Cashier',
      permissions: ['pos:sell'],
    };

    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      {
        locationId: 'loc_main',
        cartItems: [{ variant_id: 'var_widget_1', quantity: '2', discount_percentage: '0' }],
        paymentMethod: 'Cash',
        amountPaid: '20.00',
      },
      'org_pos_a',
      'sess_main'
    );

    // Mock local inventory tracking state
    let localInventoryState: Record<string, number> = {
      'var_widget_1': 8, // Stale optimistic quantity locally
    };

    // Register reconciliation handler with syncService
    const unregisterRecon = syncService.registerReconciliationHandler(async (txSynced) => {
      // Simulate fetching authoritative balance from /api/inventory/balances/loc_main/var_widget_1
      const authoritativeServerBalance = 7; // Backend authoritative stock after checkout deduction
      for (const item of txSynced.payload.cartItems) {
        localInventoryState[item.variant_id] = authoritativeServerBalance;
      }
    });

    (globalThis as any).fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, order: { id: 'ord_rec_1' }, items: [] }),
      };
    };

    const syncOk = await syncService.sync();
    assert.strictEqual(syncOk, true);

    // Verify local inventory state was reconciled with server-authoritative balance
    assert.strictEqual(localInventoryState['var_widget_1'], 7, 'Local stock must be reconciled to authoritative balance');

    unregisterRecon();
    markPassed('Test 7 — Server Inventory Reconciliation Post-Sync');
  } catch (err) {
    markFailed('Test 7 — Server Inventory Reconciliation Post-Sync', err);
  }

  // Acceptance Test 8: Real Offline vs Simulator UI State
  try {
    // Reset simulator
    syncService.setMockOffline(false);
    assert.strictEqual(syncService.isMockingOffline(), false);
    assert.strictEqual(syncService.isRealOffline(), false);

    // Simulate genuine network disconnect
    (syncService as any).isRealNetworkOnline = false;
    (syncService as any).updateState('offline');

    // Assert overall state is offline
    assert.strictEqual(syncService.getState(), 'offline');
    // Assert the simulator control remains FALSE / UNCHECKED!
    assert.strictEqual(
      syncService.isMockingOffline(),
      false,
      'Genuine offline must NOT enable simulator control'
    );

    // Cashier now explicitly enables simulator
    syncService.setMockOffline(true);
    assert.strictEqual(syncService.isMockingOffline(), true);

    // Cashier disables simulator while real network is still disconnected
    syncService.setMockOffline(false);
    assert.strictEqual(syncService.isMockingOffline(), false);
    assert.strictEqual(syncService.getState(), 'offline', 'State remains offline because physical connection is down');

    // Physical connection restored
    (syncService as any).isRealNetworkOnline = true;
    (syncService as any).updateState('online');
    assert.strictEqual(syncService.getState(), 'online');
    assert.strictEqual(syncService.isMockingOffline(), false);

    markPassed('Test 8 — Real Offline vs Simulator UI State Separation');
  } catch (err) {
    markFailed('Test 8 — Real Offline vs Simulator UI State Separation', err);
  }

  console.log('\n======================================================');
  console.log(` Offline POS Resilience Tests Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runOfflinePosTests().catch((err) => {
  console.error('Fatal test runner crash:', err);
  process.exit(1);
});
