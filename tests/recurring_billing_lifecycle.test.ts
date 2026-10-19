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
    // Paid trials must receive their first renewal invoice before the trial ends,
    // even when current_period_end is later than trial_ends_at.
    await db.query("INSERT INTO organizations (id,name,code,is_active,plan_tier) VALUES ('org_cycle_trial','Trial Cycle','CYCLE-TRIAL',true,'professional')");
    await db.query(
      "INSERT INTO organization_subscriptions (id,organization_id,plan_id,status,current_period_start,current_period_end,trial_ends_at) " +
      "VALUES ('sub_cycle_trial','org_cycle_trial','plan_professional','trialing',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '30 days',CURRENT_TIMESTAMP + INTERVAL '2 days')"
    );
    const trialInvoiceSummary = await billing.processCycle({ invoiceLeadDays: 7 });
    assert.equal(trialInvoiceSummary.invoicesCreated, 1, 'paid trial should receive a renewal invoice within the trial lead window');
    const trialInvoice = await db.query(
      "SELECT id,period_start,metadata->>'renewal_period_start' AS renewal_start FROM billing_invoices WHERE subscription_id='sub_cycle_trial'"
    );
    assert.equal(trialInvoice.rows.length, 1);
    const trialEnd = await db.query("SELECT trial_ends_at FROM organization_subscriptions WHERE id='sub_cycle_trial'");
    assert.equal(new Date(trialInvoice.rows[0].renewal_start).getTime(), new Date(trialEnd.rows[0].trial_ends_at).getTime(), 'invoice period must begin when the trial ends');

    // Once the invoice is paid, the lifecycle worker should activate the paid period from trial end.
    await db.query("UPDATE billing_invoices SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=$1", [trialInvoice.rows[0].id]);
    // Keep the unrelated baseline subscription outside the simulated future trial-expiry clock.
    await db.query("UPDATE organization_subscriptions SET current_period_end=CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE id='sub_cycle_test'");
    await billing.processCycle({ now: new Date(new Date(trialEnd.rows[0].trial_ends_at).getTime() + 1000) });
    const trialState = await db.query("SELECT status,current_period_start,current_period_end FROM organization_subscriptions WHERE id='sub_cycle_trial'");
    assert.equal(trialState.rows[0].status, 'active', 'paid trial renewal should become active');
    assert.equal(new Date(trialState.rows[0].current_period_start).getTime(), new Date(trialInvoice.rows[0].renewal_start).getTime());


    // The injected clock must control SQL due selection, not only in-memory decisions.
    await db.query("INSERT INTO organizations (id,name,code,is_active,plan_tier) VALUES ('org_cycle_clock','Clock Cycle','CYCLE-CLOCK',true,'professional')");
    await db.query(
      "INSERT INTO organization_subscriptions (id,organization_id,plan_id,status,current_period_start,current_period_end) " +
      "VALUES ('sub_cycle_clock','org_cycle_clock','plan_professional','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '20 days')"
    );
    const clockNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const clockSummary = await billing.processCycle({ now: clockNow, invoiceLeadDays: 7 });
    assert.equal(clockSummary.invoicesCreated, 1, 'injected future clock should select subscriptions due within the lead window');

    const clockInvoice = await db.query("SELECT id FROM billing_invoices WHERE subscription_id='sub_cycle_clock'");
    assert.equal(clockInvoice.rows.length, 1);
    await db.query("UPDATE billing_invoices SET due_at=CURRENT_TIMESTAMP + INTERVAL '2 days' WHERE id=$1", [clockInvoice.rows[0].id]);
    const overdueClock = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const overdueClockSummary = await billing.processCycle({ now: overdueClock, invoiceLeadDays: 0 });
    assert.ok(overdueClockSummary.invoicesMarkedPastDue >= 1, 'injected future clock should mark invoices overdue based on due_at');

    // A free trial ending without payment should expire without creating a $0 invoice.
    await db.query("INSERT INTO organizations (id,name,code,is_active,plan_tier) VALUES ('org_cycle_free_trial','Free Trial Cycle','CYCLE-FREE',true,'starter')");
    await db.query(
      "INSERT INTO organization_subscriptions (id,organization_id,plan_id,status,current_period_start,current_period_end,trial_ends_at) " +
      "VALUES ('sub_cycle_free_trial','org_cycle_free_trial','plan_starter','trialing',CURRENT_TIMESTAMP - INTERVAL '2 days',CURRENT_TIMESTAMP + INTERVAL '30 days',CURRENT_TIMESTAMP - INTERVAL '1 day')"
    );
    const freeTrialSummary = await billing.processCycle();
    assert.equal(freeTrialSummary.subscriptionsExpired, 1, 'expired free trial should transition to expired');
    const freeTrialInvoices = await db.query("SELECT id FROM billing_invoices WHERE subscription_id='sub_cycle_free_trial'");
    assert.equal(freeTrialInvoices.rows.length, 0, 'free trial expiry should not create a zero-value renewal invoice');

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
    const recoveredInvoice = await db.query(
      "SELECT id,status FROM billing_invoices WHERE subscription_id='sub_cycle_test' AND metadata->>'billing_cycle'='recurring'"
    );
    assert.equal(recoveredInvoice.rows.length, 2, 'missed advance window should still create the next renewal invoice');

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
