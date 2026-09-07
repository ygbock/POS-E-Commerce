import sys
content = open('tests/inventory.test.ts').read()

test_20 = """
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
    assert.strictEqual(dFulfilled.length, 1, 'Exactly one dispatch should succeed due to lock');

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
"""

content = content.replace("console.log(` Results: ${passed} passed, ${failed} failed`);", test_20 + "\n  console.log(` Results: ${passed} passed, ${failed} failed`);")
open('tests/inventory.test.ts', 'w').write(content)
