import assert from 'node:assert/strict';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { SubscriptionService } from '../server/services/subscriptionService';

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);
    await db.query("UPDATE subscription_plans SET currency = 'USD' WHERE id = 'plan_professional'");

    await db.query(
      "INSERT INTO subscription_plans (id, code, name, amount, currency, billing_interval, trial_days, display_order) " +
      "VALUES ('plan_metrics_gbp', 'metrics-gbp', 'Metrics GBP', 100, 'GBP', 'monthly', 0, 99)"
    );
    await db.query(
      "INSERT INTO organizations (id, name, code, is_active, plan_tier) VALUES " +
      "('org_metrics_usd', 'Metrics USD', 'METRICS-USD', true, 'professional'), " +
      "('org_metrics_gbp', 'Metrics GBP', 'METRICS-GBP', true, 'professional'), " +
      "('org_metrics_churned', 'Metrics Churned', 'METRICS-CHURNED', true, 'professional')"
    );
    await db.query(
      "INSERT INTO organization_subscriptions " +
      "(id, organization_id, plan_id, status, current_period_start, current_period_end, created_at) VALUES " +
      "('sub_metrics_usd', 'org_metrics_usd', 'plan_professional', 'active', CURRENT_TIMESTAMP - INTERVAL '60 days', CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '90 days'), " +
      "('sub_metrics_gbp', 'org_metrics_gbp', 'plan_metrics_gbp', 'active', CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '20 days', CURRENT_TIMESTAMP - INTERVAL '90 days'), " +
      "('sub_metrics_churned', 'org_metrics_churned', 'plan_metrics_gbp', 'cancelled', CURRENT_TIMESTAMP - INTERVAL '60 days', CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '90 days')"
    );
    await db.query(
      "UPDATE organization_subscriptions SET cancelled_at = CURRENT_TIMESTAMP - INTERVAL '10 days' WHERE id = 'sub_metrics_churned'"
    );

    const overview = await new SubscriptionService(undefined, db).getBillingOverview();
    assert.equal(overview.currency, 'MULTI', 'mixed currencies must be explicit');
    assert.equal(overview.mrr, 0, 'legacy scalar MRR must not sum incompatible currencies');
    assert.equal(overview.arr, 0, 'legacy scalar ARR must not sum incompatible currencies');
    assert.deepEqual(
      overview.revenueByCurrency.map((item) => [item.currency, item.mrr, item.arr]),
      [['GBP', 100, 1200], ['USD', 250, 3000]],
      'MRR and ARR must be normalized and grouped by currency'
    );
    assert.equal(overview.churnRate30d, 50, 'churn is cancellations divided by the start-of-window paid cohort');
    console.log('[PASS] billing metrics group MRR/ARR by currency and calculate cohort churn');
  } finally {
    console.log('[DIAG] billing metrics: closing isolated database');
    await db.close();
    console.log('[DIAG] billing metrics: database closed; active resources:', process.getActiveResourcesInfo());
  }
}

main().catch((error) => {
  console.error('[FAIL] billing metrics:', error);
  process.exitCode = 1;
});
