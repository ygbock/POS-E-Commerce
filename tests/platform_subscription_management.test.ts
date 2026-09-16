import assert from 'node:assert/strict';
import http from 'http';
import { signToken } from '../server/auth/token.ts';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrator.ts';
import { createApp } from '../server.ts';

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log('PASSED');
  } catch (err: any) {
    console.log('FAILED');
    console.error(`    Error: ${err.message || err}`);
    throw err;
  }
}

async function request(baseUrl: string, path: string, options: {
  method?: string;
  token?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let bodyData: string | undefined;
  if (options.body !== undefined) {
    bodyData = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(bodyData).toString();
  }

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode || 500, body: parsed });
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function main() {
  console.log('\n=================================================================');
  console.log(' TASK-5.6.3: Platform Subscription Management (13 Test Scenarios)');
  console.log('=================================================================\n');

  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  // Seed sample organizations
  await db.query(
    `INSERT INTO organizations (id, name, code, slug, is_active, plan_tier)
     VALUES 
       ('org_sub_alpha', 'Alpha Corp', 'ALPHA_SUB', 'alpha-sub', true, 'starter'),
       ('org_sub_beta', 'Beta Inc', 'BETA_SUB', 'beta-sub', true, 'professional'),
       ('org_sub_gamma', 'Gamma LLC', 'GAMMA_SUB', 'gamma-sub', true, 'enterprise'),
       ('org_platform', 'Platform HQ', 'PLATFORM', 'platform-hq', true, 'enterprise')
     ON CONFLICT (id) DO NOTHING`
  );

  const { app } = await createApp({ db, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Generate Cryptographically Signed Test Tokens
    const systemOwnerToken = signToken({
      userId: 'usr_sys_owner',
      email: 'owner@platform.internal',
      organizationId: 'org_platform',
      role: 'system_owner',
      permissions: ['platform.view', 'platform.tenants', 'platform.support', 'platform.billing'],
    });

    const platformFinanceToken = signToken({
      userId: 'usr_plt_finance',
      email: 'finance@platform.internal',
      organizationId: 'org_platform',
      role: 'platform_finance',
      permissions: ['platform.view', 'platform.billing'],
    });

    const platformAdminToken = signToken({
      userId: 'usr_plt_admin',
      email: 'admin@platform.internal',
      organizationId: 'org_platform',
      role: 'platform_admin',
      permissions: ['platform.view', 'platform.tenants', 'platform.support'], // NO platform.billing
    });

    const tenantSuperAdminToken = signToken({
      userId: 'usr_tenant_owner',
      email: 'owner@alpha.internal',
      organizationId: 'org_sub_alpha',
      role: 'super_admin',
      permissions: ['*'],
    });

    const tenantAdminToken = signToken({
      userId: 'usr_tenant_admin',
      email: 'admin@alpha.internal',
      organizationId: 'org_sub_alpha',
      role: 'admin',
      permissions: ['products.view', 'orders.view'],
    });

    // ------------------------------------------------------------------
    // SCENARIO 1: Platform Authorization Boundary Enforcement
    // ------------------------------------------------------------------
    await runTest('Scenario 1: Platform Authorization Boundary Enforcement', async () => {
      // Unauthenticated -> 401
      const resUnauth = await request(baseUrl, '/api/platform/plans');
      assert.equal(resUnauth.status, 401, 'Unauthenticated request must return 401');

      // Tenant roles -> 403
      const resTenantOwner = await request(baseUrl, '/api/platform/plans', { token: tenantSuperAdminToken });
      assert.equal(resTenantOwner.status, 403, 'Tenant super_admin must be rejected with 403');

      const resTenantAdmin = await request(baseUrl, '/api/platform/subscriptions', { token: tenantAdminToken });
      assert.equal(resTenantAdmin.status, 403, 'Tenant admin must be rejected with 403');

      // platform_admin has NO platform.billing -> 403
      const resPltAdminPlans = await request(baseUrl, '/api/platform/plans', { token: platformAdminToken });
      assert.equal(resPltAdminPlans.status, 403, 'platform_admin without platform.billing must return 403');

      const resPltAdminBilling = await request(baseUrl, '/api/platform/billing', { token: platformAdminToken });
      assert.equal(resPltAdminBilling.status, 403, 'platform_admin without platform.billing must return 403 on billing');

      // platform_finance has platform.billing -> 200
      const resPltFinance = await request(baseUrl, '/api/platform/plans', { token: platformFinanceToken });
      assert.equal(resPltFinance.status, 200, 'platform_finance with platform.billing must return 200');

      // system_owner has platform.billing -> 200
      const resSysOwner = await request(baseUrl, '/api/platform/billing', { token: systemOwnerToken });
      assert.equal(resSysOwner.status, 200, 'system_owner with platform.billing must return 200');
    });

    // ------------------------------------------------------------------
    // SCENARIO 2: Plan Catalog Retrieval & Plan Details
    // ------------------------------------------------------------------
    await runTest('Scenario 2: Plan Catalog Retrieval & Plan Details', async () => {
      const resPlans = await request(baseUrl, '/api/platform/plans', { token: systemOwnerToken });
      assert.equal(resPlans.status, 200);
      assert.ok(Array.isArray(resPlans.body.data), 'Plans must return an array');
      const codes = resPlans.body.data.map((p: any) => p.code);
      assert.ok(codes.includes('starter'), 'Should contain starter plan');
      assert.ok(codes.includes('professional'), 'Should contain professional plan');
      assert.ok(codes.includes('enterprise'), 'Should contain enterprise plan');

      // Retrieve by code
      const resPro = await request(baseUrl, '/api/platform/plans/professional', { token: platformFinanceToken });
      assert.equal(resPro.status, 200);
      assert.equal(resPro.body.data.code, 'professional');
      assert.ok(resPro.body.data.limits.users >= 5, 'Pro plan must include users limit');

      // Retrieve by id
      const proId = resPro.body.data.id;
      const resProById = await request(baseUrl, `/api/platform/plans/${proId}`, { token: systemOwnerToken });
      assert.equal(resProById.status, 200);
      assert.equal(resProById.body.data.id, proId);

      // Non-existent plan
      const resNonExistent = await request(baseUrl, '/api/platform/plans/non-existent-plan', { token: systemOwnerToken });
      assert.equal(resNonExistent.status, 404);
    });

    // ------------------------------------------------------------------
    // SCENARIO 3: Plan Mutation Validation & Billing Integrity
    // ------------------------------------------------------------------
    await runTest('Scenario 3: Plan Mutation Validation & In-Transaction Audit', async () => {
      // Invalid pricing: negative amount
      const resNeg = await request(baseUrl, '/api/platform/plans/starter', {
        method: 'PATCH',
        token: systemOwnerToken,
        body: { amount: -50 },
      });
      assert.equal(resNeg.status, 422, 'Negative amount must be rejected with 422');

      // Invalid limits: negative limit
      const resBadLimit = await request(baseUrl, '/api/platform/plans/starter', {
        method: 'PATCH',
        token: systemOwnerToken,
        body: { limits: { users: -10 } },
      });
      assert.equal(resBadLimit.status, 422, 'Negative limit must be rejected with 422');

      // Invalid features: non-boolean feature
      const resBadFeature = await request(baseUrl, '/api/platform/plans/starter', {
        method: 'PATCH',
        token: systemOwnerToken,
        body: { features: { storefront: 'yes' } },
      });
      assert.equal(resBadFeature.status, 422, 'Non-boolean feature must be rejected with 422');

      // Valid update
      const resValidUpdate = await request(baseUrl, '/api/platform/plans/starter', {
        method: 'PATCH',
        token: systemOwnerToken,
        body: {
          description: 'Updated Starter Tier Description for SMBs',
          limits: { users: 4, locations: 1, products: 150, monthly_orders: 400 },
        },
      });
      assert.equal(resValidUpdate.status, 200);
      assert.equal(resValidUpdate.body.data.description, 'Updated Starter Tier Description for SMBs');
      assert.equal(resValidUpdate.body.data.limits.users, 4);

      // Verify audit log generated in audit_events
      const auditRes = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_PLAN_UPDATED' ORDER BY timestamp DESC LIMIT 1"
      );
      assert.ok(auditRes.rows.length > 0, 'Must generate PLATFORM_PLAN_UPDATED audit log');
      assert.equal(auditRes.rows[0].actor_id, 'usr_sys_owner');
    });

    // ------------------------------------------------------------------
    // SCENARIO 4: Tenant Subscription Listing & Filtering
    // ------------------------------------------------------------------
    await runTest('Scenario 4: Tenant Subscription Listing & Filtering', async () => {
      const resAll = await request(baseUrl, '/api/platform/subscriptions', { token: platformFinanceToken });
      assert.equal(resAll.status, 200);
      assert.ok(Array.isArray(resAll.body.data));
      assert.ok(resAll.body.data.length >= 3, 'Should list seeded subscriptions');

      // Filter by status
      const resFilter = await request(baseUrl, '/api/platform/subscriptions?status=trialing', { token: systemOwnerToken });
      assert.equal(resFilter.status, 200);
      for (const sub of resFilter.body.data) {
        assert.equal(sub.status, 'trialing');
      }

      // Subscription detail with authoritative usage counters
      const resDetail = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha', { token: systemOwnerToken });
      assert.equal(resDetail.status, 200);
      assert.equal(resDetail.body.data.organization_id, 'org_sub_alpha');
      assert.ok(resDetail.body.data.plan, 'Detail must include plan details');
      assert.ok(resDetail.body.data.usage, 'Detail must include authoritative usage');
      assert.equal(typeof resDetail.body.data.usage.users, 'number');
      assert.equal(typeof resDetail.body.data.usage.products, 'number');
    });

    // ------------------------------------------------------------------
    // SCENARIO 5: Plan Change Transactional Transition
    // ------------------------------------------------------------------
    await runTest('Scenario 5: Plan Change Transactional Transition & Audit Evidence', async () => {
      // Upgrade org_sub_alpha from starter to professional
      const resChange = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/change-plan', {
        method: 'POST',
        token: systemOwnerToken,
        body: {
          planCodeOrId: 'professional',
          reason: 'Customer upgraded to Professional plan',
        },
      });
      assert.equal(resChange.status, 200);
      assert.equal(resChange.body.data.plan.code, 'professional');

      // Verify organization table synced
      const orgCheck = await db.query<any>('SELECT plan_tier FROM organizations WHERE id = $1', ['org_sub_alpha']);
      assert.equal(orgCheck.rows[0].plan_tier, 'professional');

      // Verify audit record created
      const auditRes = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_SUBSCRIPTION_PLAN_CHANGED' AND organization_id = $1",
        ['org_sub_alpha']
      );
      const auditPayload = typeof auditRes.rows[0].after_state === 'string'
        ? JSON.parse(auditRes.rows[0].after_state)
        : auditRes.rows[0].after_state;
      assert.equal(auditPayload.planCode, 'professional');
    });

    // ------------------------------------------------------------------
    // SCENARIO 6: Trial Extension Transactional Transition
    // ------------------------------------------------------------------
    await runTest('Scenario 6: Trial Extension Transactional Transition', async () => {
      // Negative / zero days rejected
      const resBadDays = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/extend-trial', {
        method: 'POST',
        token: systemOwnerToken,
        body: { days: -5 },
      });
      assert.equal(resBadDays.status, 422);

      // Valid extension: 14 days
      const resExtend = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/extend-trial', {
        method: 'POST',
        token: systemOwnerToken,
        body: {
          days: 14,
          reason: 'Complimentary trial extension by support',
        },
      });
      assert.equal(resExtend.status, 200);
      assert.equal(resExtend.body.data.status, 'trialing');
      assert.ok(new Date(resExtend.body.data.trial_ends_at).getTime() > Date.now() + 13 * 24 * 60 * 60 * 1000);

      // Audit record
      const auditRes = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_SUBSCRIPTION_TRIAL_EXTENDED' AND organization_id = $1",
        ['org_sub_alpha']
      );
      assert.ok(auditRes.rows.length > 0, 'Audit record for trial extension must exist');
    });

    // ------------------------------------------------------------------
    // SCENARIO 7: Subscription Suspension Transactional Transition
    // ------------------------------------------------------------------
    await runTest('Scenario 7: Subscription Suspension Transactional Transition', async () => {
      const resSuspend = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/suspend', {
        method: 'POST',
        token: systemOwnerToken,
        body: { reason: 'Account suspended for administrative review' },
      });
      assert.equal(resSuspend.status, 200);
      assert.equal(resSuspend.body.data.status, 'paused');

      // Audit record
      const auditRes = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_SUBSCRIPTION_SUSPENDED' AND organization_id = $1",
        ['org_sub_alpha']
      );
      assert.ok(auditRes.rows.length > 0, 'Audit record for suspension must exist');
    });

    // ------------------------------------------------------------------
    // SCENARIO 8: Subscription Reactivation Transactional Transition
    // ------------------------------------------------------------------
    await runTest('Scenario 8: Subscription Reactivation Transactional Transition', async () => {
      const resReactivate = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/reactivate', {
        method: 'POST',
        token: systemOwnerToken,
        body: { reason: 'Administrative review cleared, restoring service' },
      });
      assert.equal(resReactivate.status, 200);
      // Because trial is still active from Scenario 6, status returns to trialing
      assert.ok(['active', 'trialing'].includes(resReactivate.body.data.status));

      // Audit record
      const auditRes = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_SUBSCRIPTION_REACTIVATED' AND organization_id = $1",
        ['org_sub_alpha']
      );
      assert.ok(auditRes.rows.length > 0, 'Audit record for reactivation must exist');
    });

    // ------------------------------------------------------------------
    // SCENARIO 9: Immediate Cancellation vs. Period-End Cancellation
    // ------------------------------------------------------------------
    await runTest('Scenario 9: Immediate Cancellation vs Period-End Cancellation', async () => {
      // Test Period-End Cancellation on org_sub_beta
      const resCancelPeriodEnd = await request(baseUrl, '/api/platform/subscriptions/org_sub_beta/cancel', {
        method: 'POST',
        token: systemOwnerToken,
        body: { immediate: false, reason: 'Customer requested cancellation at period end' },
      });
      assert.equal(resCancelPeriodEnd.status, 200);
      // Status remains active/trialing while cancel_at_period_end is true
      assert.equal(resCancelPeriodEnd.body.data.cancel_at_period_end, true);
      assert.notEqual(resCancelPeriodEnd.body.data.status, 'cancelled');

      // Test Immediate Cancellation on org_sub_alpha
      const resCancelImmediate = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/cancel', {
        method: 'POST',
        token: systemOwnerToken,
        body: { immediate: true, reason: 'Immediate cancellation requested' },
      });
      assert.equal(resCancelImmediate.status, 200);
      assert.equal(resCancelImmediate.body.data.status, 'cancelled');
      assert.ok(resCancelImmediate.body.data.cancelled_at !== null);
      assert.equal(resCancelImmediate.body.data.cancel_at_period_end, false);
    });

    // ------------------------------------------------------------------
    // SCENARIO 10: Restoration Semantics & Coherence Validation
    // ------------------------------------------------------------------
    await runTest('Scenario 10: Restoration Semantics & Coherence Validation', async () => {
      // Restore the cancelled subscription on org_sub_alpha
      const resRestore = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/restore', {
        method: 'POST',
        token: systemOwnerToken,
        body: { reason: 'Customer renewed cancelled subscription' },
      });
      assert.equal(resRestore.status, 200);
      assert.equal(resRestore.body.data.status, 'active');
      assert.equal(resRestore.body.data.cancelled_at, null);
      assert.equal(resRestore.body.data.cancel_at_period_end, false);

      // Audit record
      const auditRes = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_SUBSCRIPTION_RESTORED' AND organization_id = $1",
        ['org_sub_alpha']
      );
      assert.ok(auditRes.rows.length > 0, 'Audit record for restoration must exist');
    });

    // ------------------------------------------------------------------
    // SCENARIO 11: Invalid State Transitions Rejected
    // ------------------------------------------------------------------
    await runTest('Scenario 11: Invalid State Transitions Rejected', async () => {
      // Cancel org_sub_gamma immediately first
      await request(baseUrl, '/api/platform/subscriptions/org_sub_gamma/cancel', {
        method: 'POST',
        token: systemOwnerToken,
        body: { immediate: true },
      });

      // 1. Cannot suspend an already cancelled subscription
      const resSuspendCancelled = await request(baseUrl, '/api/platform/subscriptions/org_sub_gamma/suspend', {
        method: 'POST',
        token: systemOwnerToken,
      });
      assert.equal(resSuspendCancelled.status, 422);

      // 2. Cannot extend trial on a cancelled subscription
      const resExtendCancelled = await request(baseUrl, '/api/platform/subscriptions/org_sub_gamma/extend-trial', {
        method: 'POST',
        token: systemOwnerToken,
        body: { days: 7 },
      });
      assert.equal(resExtendCancelled.status, 422);

      // 3. Cannot reactivate an already cancelled subscription (must restore)
      const resReactivateCancelled = await request(baseUrl, '/api/platform/subscriptions/org_sub_gamma/reactivate', {
        method: 'POST',
        token: systemOwnerToken,
      });
      assert.equal(resReactivateCancelled.status, 422);

      // 4. Cannot change plan on a cancelled subscription
      const resChangeCancelled = await request(baseUrl, '/api/platform/subscriptions/org_sub_gamma/change-plan', {
        method: 'POST',
        token: systemOwnerToken,
        body: { planCodeOrId: 'starter' },
      });
      assert.equal(resChangeCancelled.status, 422);
    });

    // ------------------------------------------------------------------
    // SCENARIO 12: Multi-Tenant Isolation & Idempotency
    // ------------------------------------------------------------------
    await runTest('Scenario 12: Multi-Tenant Isolation & Idempotency', async () => {
      // Get baseline beta state
      const betaBefore = await request(baseUrl, '/api/platform/subscriptions/org_sub_beta', { token: systemOwnerToken });

      // Perform mutations on alpha with idempotency key
      const key = 'idem_' + Date.now();
      const resChange1 = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/change-plan', {
        method: 'POST',
        token: systemOwnerToken,
        headers: { 'X-Idempotency-Key': key },
        body: { planCodeOrId: 'enterprise' },
      });
      assert.equal(resChange1.status, 200);

      // Repeat with same key -> idempotent response
      const resChange2 = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/change-plan', {
        method: 'POST',
        token: systemOwnerToken,
        headers: { 'X-Idempotency-Key': key },
        body: { planCodeOrId: 'enterprise' },
      });
      assert.equal(resChange2.status, 200);
      assert.equal(resChange2.body.data.plan.code, 'enterprise');

      // Verify beta remains completely untouched
      const betaAfter = await request(baseUrl, '/api/platform/subscriptions/org_sub_beta', { token: systemOwnerToken });
      assert.equal(betaAfter.body.data.plan.code, betaBefore.body.data.plan.code);
      assert.equal(betaAfter.body.data.status, betaBefore.body.data.status);
    });

    // ------------------------------------------------------------------
    // SCENARIO 13: Transaction Rollback Integrity & Deterministic MRR Calculation
    // ------------------------------------------------------------------
    await runTest('Scenario 13: Transaction Rollback Integrity & Deterministic MRR Calculation', async () => {
      // 1. Transaction failure rollback check:
      // Pass a non-existent plan on change-plan -> error 404, nothing changes
      const alphaOrgBefore = await db.query<any>('SELECT plan_tier FROM organizations WHERE id = $1', ['org_sub_alpha']);
      const resFailed = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/change-plan', {
        method: 'POST',
        token: systemOwnerToken,
        body: { planCodeOrId: 'non_existent_tier_xyz' },
      });
      assert.equal(resFailed.status, 404);
      const alphaOrgAfter = await db.query<any>('SELECT plan_tier FROM organizations WHERE id = $1', ['org_sub_alpha']);
      assert.equal(alphaOrgAfter.rows[0].plan_tier, alphaOrgBefore.rows[0].plan_tier, 'Org state must not mutate on failure');

      // 2. Deterministic MRR Verification
      // Ensure one active paid subscription with trial ended
      await db.query(`
        UPDATE organization_subscriptions
        SET status = 'active', trial_ends_at = NULL
        WHERE organization_id = 'org_sub_alpha'
      `);

      const resBilling = await request(baseUrl, '/api/platform/billing', { token: platformFinanceToken });
      assert.equal(resBilling.status, 200);
      assert.equal(resBilling.body.data.status, 'operational');
      assert.equal(typeof resBilling.body.data.mrr, 'number');
      assert.ok(resBilling.body.data.mrr > 0, 'MRR must be calculated authoritatively from database plans');
      assert.ok(Array.isArray(resBilling.body.data.planDistribution), 'Must return plan distribution array');

      // Fetch audit history endpoint for org_sub_alpha
      const resHistory = await request(baseUrl, '/api/platform/subscriptions/org_sub_alpha/history', { token: systemOwnerToken });
      assert.equal(resHistory.status, 200);
      assert.ok(Array.isArray(resHistory.body.data));
      assert.ok(resHistory.body.data.length >= 3, 'Audit history must contain lifecycle events');
    });

    console.log('\nAll 13 test scenarios in TASK-5.6.3 passed cleanly!\n');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
