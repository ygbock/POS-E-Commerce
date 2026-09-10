process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import { OfflineQueue } from '../src/services/offlineQueue';
import { syncService } from '../src/services/syncService';

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

  // Baseline preparation: clean up the queue
  await OfflineQueue.clearQueue();

  // Test 1: Offline Enqueueing Behavior
  try {
    const payload = {
      locationId: 'loc_store_a',
      sessionId: 'sess_123',
      customerId: 'cust_abc',
      cartItems: [{ variant_id: 'var_apple', quantity: '2', discount_percentage: '0' }],
      paymentMethod: 'Cash',
      amountPaid: '20.00',
    };

    // Set mock network status to offline
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

    const txs = await OfflineQueue.getTransactions();
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].id, tx.id);

    markPassed('Offline Queue Enqueueing');
  } catch (err) {
    markFailed('Offline Queue Enqueueing', err);
  }

  // Test 2: Sync Prevention when Offline
  try {
    // Attempt sync while still offline
    const syncStarted = await syncService.sync();
    assert.strictEqual(syncStarted, false, 'Sync should not start when offline');

    const txs = await OfflineQueue.getTransactions();
    assert.strictEqual(txs[0].status, 'pending');

    markPassed('Sync Blocked when Offline');
  } catch (err) {
    markFailed('Sync Blocked when Offline', err);
  }

  // Test 3: Sync Retry on Transient Server Failures (500 Error)
  try {
    // Simulate online
    syncService.setMockOffline(false);
    assert.strictEqual(syncService.getState(), 'online');

    // Mock global fetch to return 500
    let fetchCallCount = 0;
    (globalThis as any).fetch = async (url: string, options: any) => {
      fetchCallCount++;
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      };
    };

    // Trigger sync
    const syncResult = await syncService.sync();
    assert.strictEqual(syncResult, false, 'Sync should return false on transient attempt failure');
    assert.strictEqual(fetchCallCount, 1);

    // Verify transaction status is 'pending' and attempts incremented
    const txs = await OfflineQueue.getTransactions();
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].status, 'pending');
    assert.strictEqual(txs[0].attempts, 1);

    markPassed('Sync Retry on Transient Server Failures');
  } catch (err) {
    markFailed('Sync Retry on Transient Server Failures', err);
  }

  // Test 4: Backoff Avoidance and Delay Checks
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

    // Immediately trigger sync again (should skip because of backoff)
    await syncService.sync();
    assert.strictEqual(fetchCallCount, 0, 'Should not hit fetch again immediately due to backoff delay');

    markPassed('Sync Exponential Backoff Triggers');
  } catch (err) {
    markFailed('Sync Exponential Backoff Triggers', err);
  }

  // Test 5: Permanent Failure Handling (400 Validation Error)
  try {
    await OfflineQueue.clearQueue();

    const payload = {
      locationId: 'loc_store_a',
      sessionId: 'sess_123',
      customerId: 'cust_abc',
      cartItems: [{ variant_id: 'var_apple', quantity: '1000', discount_percentage: '0' }], // Insufficient stock
      paymentMethod: 'Cash',
      amountPaid: '10000.00',
    };

    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      payload,
      'org_pos_a',
      'sess_123'
    );

    // Mock global fetch to return 400
    let fetchCallCount = 0;
    (globalThis as any).fetch = async (url: string, options: any) => {
      fetchCallCount++;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'VALIDATION_ERROR: Insufficient stock' } }),
      };
    };

    // Force sync by clearing backoff timestamps in test
    const txsBefore = await OfflineQueue.getTransactions();
    txsBefore[0].lastAttemptAt = new Date(Date.now() - 100000).toISOString();
    await OfflineQueue.updateTransaction(txsBefore[0]);

    await syncService.sync();
    assert.strictEqual(fetchCallCount, 1);

    const txsAfter = await OfflineQueue.getTransactions();
    assert.strictEqual(txsAfter.length, 1);
    assert.strictEqual(txsAfter[0].status, 'failed', '400 validation error must result in failed');

    markPassed('Permanent Failure Handling (400)');
  } catch (err) {
    markFailed('Permanent Failure Handling (400)', err);
  }

  // Test 6: Successful Sync on Recovery (200 OK)
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

    const tx = await OfflineQueue.enqueue(
      'pos_checkout',
      payload,
      'org_pos_a',
      'sess_123'
    );

    // Mock global fetch to return 200 success
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

    // On success, the transaction should be fully removed from the active queue
    const txsAfter = await OfflineQueue.getTransactions();
    assert.strictEqual(txsAfter.length, 0, 'Synced transactions must be cleared from the active queue');

    markPassed('Successful Synchronization Recovery');
  } catch (err) {
    markFailed('Successful Synchronization Recovery', err);
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
