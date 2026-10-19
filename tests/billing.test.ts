import assert from 'assert';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { SubscriptionRepository } from '../server/repositories/subscriptionRepository';
import { BillingService, signBillingPayload, verifyBillingSignature } from '../server/services/billingService';

let passed = 0;
let failed = 0;

async function run(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log('  [PASS] ' + name); passed++; }
  catch (error: any) { console.error('  [FAIL] ' + name + ': ' + (error?.message || error)); failed++; }
}

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);

    await db.query(
      "INSERT INTO organizations (id, name, code, is_active, plan_tier) VALUES ('org_billing_test', 'Billing Test', 'BILLING-TEST', true, 'professional')"
    );
    await db.query(
      "INSERT INTO organization_subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end) " +
      "VALUES ('sub_billing_test', 'org_billing_test', 'plan_professional', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')"
    );

    await run('webhook signatures are cryptographically verified', async () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
      const signature = signBillingPayload(payload, 'billing-test-secret');
      assert.ok(verifyBillingSignature(payload, signature, 'billing-test-secret'));
      assert.ok(!verifyBillingSignature(payload, signature, 'wrong-secret'));
      assert.ok(!verifyBillingSignature(payload + 'x', signature, 'billing-test-secret'));
    });

    await run('invoice creation snapshots authoritative subscription pricing', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const invoice = await billing.createInvoice('org_billing_test', { reason: 'test invoice' });
      assert.strictEqual(invoice.status, 'open');
      assert.strictEqual(invoice.currency, 'SLE');
      assert.strictEqual(invoice.total, '250.00');
      assert.ok(invoice.invoice_number.startsWith('INV-'));
      const history = await db.query(
        "SELECT to_status FROM billing_invoice_status_history WHERE invoice_id = $1 ORDER BY created_at DESC",
        [invoice.id]
      );
      assert.strictEqual(history.rows[0]?.to_status, 'open');
    });

    await run('paid webhook settles invoice and is replay safe', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const invoice = await billing.createInvoice('org_billing_test', { reason: 'webhook test' });
      const payloadObject = {
        id: 'evt_invoice_paid_1',
        type: 'invoice.paid',
        organizationId: 'org_billing_test',
        invoiceId: invoice.id,
        providerInvoiceId: 'provider-inv-1',
        subscriptionId: 'sub_billing_test',
      };
      const payload = JSON.stringify(payloadObject);

      const first = await billing.processWebhook(payloadObject, payload, 'test-provider');
      assert.strictEqual(first.duplicate, false);
      assert.strictEqual(first.invoice?.status, 'paid');

      const second = await billing.processWebhook(payloadObject, payload, 'test-provider');
      assert.strictEqual(second.duplicate, true);

      const events = await db.query(
        "SELECT COUNT(*)::int AS count FROM billing_events WHERE provider = 'test-provider' AND provider_event_id = 'evt_invoice_paid_1'"
      );
      assert.strictEqual(Number(events.rows[0]?.count), 1);
    });

    await run('out-of-order failure webhooks cannot reverse a paid invoice', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const invoice = await billing.createInvoice('org_billing_test');
      await billing.transitionInvoiceStatus(invoice.id, 'paid', 'test');
      const event = {
        id: 'evt_late_failure_after_paid',
        type: 'invoice.payment_failed',
        organizationId: 'org_billing_test',
        invoiceId: invoice.id,
        subscriptionId: 'sub_billing_test',
      };
      const result = await billing.processWebhook(event, JSON.stringify(event), 'test-provider');
      assert.strictEqual(result.invoice?.status, 'paid');
      const persisted = await billing.getInvoice(invoice.id);
      assert.strictEqual(persisted?.status, 'paid');
      assert.ok(persisted?.paid_at, 'paid timestamp must be preserved');
      const sub = await new SubscriptionRepository(db).getForOrganization('org_billing_test');
      assert.strictEqual(sub?.status, 'active', 'late failure must not downgrade the subscription');
    });

    await run('webhook cannot update a subscription unrelated to its invoice', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const invoice = await billing.createInvoice('org_billing_test');
      const event = {
        id: 'evt_mismatched_subscription',
        type: 'invoice.paid',
        organizationId: 'org_billing_test',
        invoiceId: invoice.id,
        subscriptionId: 'sub_unrelated',
      };
      await assert.rejects(
        () => billing.processWebhook(event, JSON.stringify(event), 'test-provider'),
        /WEBHOOK_SUBSCRIPTION_MISMATCH/
      );
      const persisted = await billing.getInvoice(invoice.id);
      assert.strictEqual(persisted?.status, 'open', 'mismatched webhook must not settle the invoice');
      const eventRows = await db.query(
        "SELECT COUNT(*)::int AS count FROM billing_events WHERE provider='test-provider' AND provider_event_id='evt_mismatched_subscription'"
      );
      assert.strictEqual(Number(eventRows.rows[0]?.count), 0, 'rejected event must roll back atomically');
    });

    await run('unmatched invoice webhooks remain retryable', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const event = {
        id: 'evt_invoice_mapping_not_ready',
        type: 'invoice.paid',
        organizationId: 'org_billing_test',
        invoiceId: 'inv_provider_mapping_not_ready',
      };
      await assert.rejects(
        () => billing.processWebhook(event, JSON.stringify(event), 'test-provider'),
        /INVOICE_NOT_FOUND/
      );
      const eventRows = await db.query(
        "SELECT COUNT(*)::int AS count FROM billing_events WHERE provider='test-provider' AND provider_event_id='evt_invoice_mapping_not_ready'"
      );
      assert.strictEqual(Number(eventRows.rows[0]?.count), 0, 'unresolved invoice event must not be marked processed');
    });

    await run('subscription.active notifications do not settle invoices without payment confirmation', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const invoice = await billing.createInvoice('org_billing_test');
      const event = {
        id: 'evt_subscription_active_no_payment',
        type: 'subscription.active',
        organizationId: 'org_billing_test',
        invoiceId: invoice.id,
        subscriptionId: 'sub_billing_test',
      };
      const result = await billing.processWebhook(event, JSON.stringify(event), 'test-provider');
      assert.strictEqual(result.invoice, null);
      const persisted = await billing.getInvoice(invoice.id);
      assert.strictEqual(persisted?.status, 'open');
    });

    await run('failed payment marks invoice past_due without trusting client payment state', async () => {
      const billing = new BillingService(db, new SubscriptionRepository(db));
      const invoice = await billing.createInvoice('org_billing_test');
      const event = {
        id: 'evt_invoice_failed_1',
        type: 'invoice.payment_failed',
        organizationId: 'org_billing_test',
        invoiceId: invoice.id,
        subscriptionId: 'sub_billing_test',
      };
      const result = await billing.processWebhook(event, JSON.stringify(event), 'test-provider');
      assert.strictEqual(result.invoice?.status, 'past_due');
      const sub = await new SubscriptionRepository(db).getForOrganization('org_billing_test');
      assert.strictEqual(sub?.status, 'past_due');
    });

    console.log('\nTASK-5.6.4 billing engine: ' + passed + ' passed, ' + failed + ' failed');
  } finally {
    await db.close();
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
