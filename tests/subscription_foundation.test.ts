import assert from 'assert';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { SubscriptionRepository } from '../server/repositories/subscriptionRepository';
import { SubscriptionService } from '../server/services/subscriptionService';

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

    await run('canonical subscription plans exist with authoritative limits/features', async () => {
      const repo = new SubscriptionRepository(db);
      const plans = await repo.listPlans();
      assert.strictEqual(plans.length, 3);
      assert.deepStrictEqual(plans.map(p => p.code), ['starter', 'professional', 'enterprise']);
      assert.strictEqual(plans[0].limits.users, 5);
      assert.strictEqual(plans[2].features.api_access, true);
    });

    await run('plan lookup normalizes input', async () => {
      const repo = new SubscriptionRepository(db);
      const plan = await repo.getPlanByCode(' PROFESSIONAL ');
      assert.ok(plan);
      assert.strictEqual(plan?.code, 'professional');
    });

    await run('subscription lookup is organization-scoped', async () => {
      await db.query(
        "INSERT INTO organizations (id, name, code, is_active, plan_tier) VALUES " +
        "('org_sub_a', 'Subscription A', 'SUB-A', true, 'starter'), " +
        "('org_sub_b', 'Subscription B', 'SUB-B', true, 'enterprise')"
      );
      await db.query(
        "INSERT INTO organization_subscriptions " +
        "(id, organization_id, plan_id, status, current_period_start, current_period_end) VALUES " +
        "('sub_a', 'org_sub_a', 'plan_starter', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days'), " +
        "('sub_b', 'org_sub_b', 'plan_enterprise', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')"
      );
      const repo = new SubscriptionRepository(db);
      const a = await repo.getForOrganization('org_sub_a');
      assert.ok(a);
      assert.strictEqual(a?.plan.code, 'starter');
      assert.strictEqual(a?.organization_id, 'org_sub_a');
    });

    await run('database permits only one billable subscription per tenant', async () => {
      await assert.rejects(db.query(
        "INSERT INTO organization_subscriptions " +
        "(id, organization_id, plan_id, status, current_period_start, current_period_end) VALUES " +
        "('sub_a_duplicate', 'org_sub_a', 'plan_professional', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')"
      ));
    });

    await run('service fails closed for missing tenant and unavailable feature', async () => {
      const service = new SubscriptionService(new SubscriptionRepository(db));
      await assert.rejects(() => service.getTenantSubscription(''), /TENANT_REQUIRED/);
      await assert.rejects(() => service.assertFeatureEnabled('org_sub_a', 'api_access'), /FEATURE_NOT_INCLUDED/);
    });

    console.log('\nTASK-5.6.1 subscription foundation: ' + passed + ' passed, ' + failed + ' failed');
  } finally { await db.close(); }
  if (failed > 0) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
