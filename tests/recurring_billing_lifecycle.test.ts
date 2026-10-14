import assert from 'node:assert/strict';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { RecurringBillingService } from '../server/services/recurringBillingService';

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);
    await db.query("INSERT INTO organizations (id,name,code,is_active,plan_tier) VALUES ('org_cycle_test','Cycle Test','CYCLE-TEST',true,'professional')");
    await db.query(
      "INSERT INTO organization_subscriptions (id,organization_id,plan_id,status,current_period_start,current_period_end) " +
      "VALUES ('sub_cycle_test','org_cycle_test','plan_professional','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '2 days')"
    );
    const billing = new RecurringBillingService(db);
    const first = await billing.processCycle({ invoiceLeadDays: 7 });
    assert.equal(first.invoicesCreated, 1, 'renewal invoice should be generated within the lead window');
    const second = await billing.processCycle({ invoiceLeadDays: 7 });
    assert.equal(second.invoicesCreated, 0, 'repeated sweeps must not duplicate the renewal invoice');
    const invoices = await db.query(
      "SELECT id,status,metadata->>'billing_cycle' AS cycle FROM billing_invoices WHERE subscription_id='sub_cycle_test'"
    );
    assert.equal(invoices.rows.length, 1);
    assert.equal(invoices.rows[0].status, 'open');
    assert.equal(invoices.rows[0].cycle, 'recurring');

    await db.query("UPDATE organization_subscriptions SET current_period_end=CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id='sub_cycle_test'");
    const overdue = await billing.processCycle();
    assert.equal(overdue.subscriptionsMarkedPastDue, 1, 'expired unpaid period must become past due');
    const state = await db.query("SELECT status FROM organization_subscriptions WHERE id='sub_cycle_test'");
    assert.equal(state.rows[0].status, 'past_due');

    await db.query("UPDATE organization_subscriptions SET status='active',cancel_at_period_end=TRUE,current_period_end=CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id='sub_cycle_test'");
    const cancelled = await billing.processCycle();
    assert.equal(cancelled.subscriptionsCancelled, 1, 'period-end cancellation must be finalized');
    const finalState = await db.query("SELECT status,cancel_at_period_end FROM organization_subscriptions WHERE id='sub_cycle_test'");
    assert.equal(finalState.rows[0].status, 'cancelled');
    assert.equal(finalState.rows[0].cancel_at_period_end, false);

    console.log('Recurring billing lifecycle: PASS');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
