process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { signToken } from '../server/auth/token';
import { hashPassword } from '../server/auth/password';

async function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  token?: string,
  body?: any,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: any }> {
  const address = server.address() as { port: number };
  const payload = body ? JSON.stringify(body) : undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders || {}),
  };

  if (payload) {
    headers['Content-Length'] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${address.port}${path}`,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Super Admin Platform & Subscription Management Suite ---');

  const db = getDatabaseClient({ forceNew: true });
  await runMigrations(db);

  const appContainer = await createApp({ db, skipVite: true });
  const server = http.createServer(appContainer.app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const timeSuffix = Date.now();
    const orgAlpha = `org_plat_alpha_${timeSuffix}`;

    // Setup Organizations
    await db.query(
      `INSERT INTO organizations (id, name, code, is_active) VALUES
       ('platform', 'Platform Operations', 'PLATFORM', true),
       ($1, 'Alpha Retail', $2, true)
       ON CONFLICT (id) DO NOTHING`,
      [orgAlpha, `ALPHA_${timeSuffix}`]
    );

    // Setup Test Users
    const { hash: passwordHash, salt: passwordSalt } = hashPassword('SecurePassword123!');

    // 1. Super Admin User
    const superAdminId = `usr_superadmin_${timeSuffix}`;
    await db.query(
      `INSERT INTO users (id, organization_id, email, password_hash, password_salt, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [superAdminId, 'platform', `superadmin_${timeSuffix}@example.com`, passwordHash, passwordSalt, 'Super Admin', 'super_admin']
    );

    // 2. Org Admin User
    const ownerId = `usr_owner_${timeSuffix}`;
    await db.query(
      `INSERT INTO users (id, organization_id, email, password_hash, password_salt, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [ownerId, orgAlpha, `owner_${timeSuffix}@example.com`, passwordHash, passwordSalt, 'Org Admin', 'admin']
    );

    // Tokens
    const superAdminToken = signToken({
      userId: superAdminId,
      organizationId: 'platform',
      email: `superadmin_${timeSuffix}@example.com`,
      role: 'super_admin',
    });

    const ownerToken = signToken({
      userId: ownerId,
      organizationId: orgAlpha,
      email: `owner_${timeSuffix}@example.com`,
      role: 'admin',
    });

    // ------------------------------------------------------------------
    // TEST 1: SECURITY BOUNDARIES (NON-SUPER-ADMIN DENIAL)
    // ------------------------------------------------------------------
    console.log('[Test 1] Verifying non-super_admin role restrictions on Super Admin endpoints...');

    const resForbiddenCreatePlan = await makeRequest(server, 'POST', '/api/platform/plans', ownerToken, {
      code: 'custom_pro',
      name: 'Custom Pro',
      max_users: 10,
      max_locations: 2,
      max_products: 500,
      max_monthly_orders: 1000,
      max_monthly_pos_transactions: 1000,
      features: {},
    });
    assert.strictEqual(resForbiddenCreatePlan.status, 403, 'Org owner must be denied plan creation');
    assert.strictEqual(resForbiddenCreatePlan.body.error.code, 'PERMISSION_DENIED');

    const resForbiddenListSubs = await makeRequest(server, 'GET', '/api/platform/subscriptions', ownerToken);
    assert.strictEqual(resForbiddenListSubs.status, 403, 'Org owner must be denied listing all subscriptions');

    const resForbiddenAssignPlan = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/assign`,
      ownerToken,
      { planCode: 'enterprise' }
    );
    assert.strictEqual(resForbiddenAssignPlan.status, 403, 'Org owner must be denied assigning plans');

    console.log('  -> Security boundaries verified: 403 PERMISSION_DENIED enforced.');

    // ------------------------------------------------------------------
    // TEST 2: PLAN MANAGEMENT (GET, POST, PUT)
    // ------------------------------------------------------------------
    console.log('[Test 2] Testing Plan Management (Create, List, Update)...');

    // List Plans (Super Admin)
    const resListPlans = await makeRequest(server, 'GET', '/api/platform/plans', superAdminToken);
    assert.strictEqual(resListPlans.status, 200, 'Super admin should list plans');
    assert(Array.isArray(resListPlans.body.data), 'Plans list must be array');
    assert(resListPlans.body.data.length >= 3, 'Default plans (starter, pro, enterprise) should exist');

    // Create New Custom Plan
    const customPlanCode = `custom_enterprise_${timeSuffix}`;
    const resCreatePlan = await makeRequest(server, 'POST', '/api/platform/plans', superAdminToken, {
      code: customPlanCode,
      name: 'Custom Enterprise Plan',
      description: 'Dedicated enterprise tier with unlimited scale',
      price_monthly: 29999,
      price_yearly: 299990,
      billing_interval: 'monthly',
      max_users: 100,
      max_locations: 20,
      max_products: 50000,
      max_monthly_orders: 100000,
      max_monthly_pos_transactions: 100000,
      max_storage_bytes: 107374182400,
      features: {
        multi_location: true,
        advanced_reports: true,
        pos_offline: true,
        custom_domain: true,
        api_access: true,
      },
      is_active: true,
    });

    assert.strictEqual(resCreatePlan.status, 201, 'Custom plan creation should succeed');
    assert.strictEqual(resCreatePlan.body.data.code, customPlanCode);
    const createdPlanId = resCreatePlan.body.data.id;

    // Reject Duplicate Plan Code
    const resDuplicatePlan = await makeRequest(server, 'POST', '/api/platform/plans', superAdminToken, {
      code: customPlanCode,
      name: 'Duplicate Plan Code',
      max_users: 10,
      max_locations: 1,
      max_products: 100,
      max_monthly_orders: 100,
      max_monthly_pos_transactions: 100,
      features: {},
    });
    assert.strictEqual(resDuplicatePlan.status, 400, 'Duplicate plan code must be rejected with 400');
    assert.strictEqual(resDuplicatePlan.body.error.code, 'PLAN_CODE_EXISTS');

    // Update Plan
    const resUpdatePlan = await makeRequest(server, 'PUT', `/api/platform/plans/${createdPlanId}`, superAdminToken, {
      name: 'Custom Enterprise Plan (v2)',
      max_users: 150,
      price_monthly: 34999,
    });
    assert.strictEqual(resUpdatePlan.status, 200, 'Plan update should succeed');
    assert.strictEqual(resUpdatePlan.body.data.name, 'Custom Enterprise Plan (v2)');
    assert.strictEqual(resUpdatePlan.body.data.max_users, 150);
    assert.strictEqual(resUpdatePlan.body.data.version, 2, 'Version counter should increment');

    console.log('  -> Plan Management CRUD and versioning verified.');

    // ------------------------------------------------------------------
    // TEST 3: SUPER ADMIN TENANT SUBSCRIPTION OPERATIONS
    // ------------------------------------------------------------------
    console.log('[Test 3] Testing Super Admin Subscription Operations & State Transitions...');

    // Assign Plan
    const resAssign = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/assign`,
      superAdminToken,
      {
        planCode: customPlanCode,
        reason: 'Upgraded tenant to Custom Enterprise tier',
      }
    );
    assert.strictEqual(resAssign.status, 200, 'Plan assignment should succeed');
    assert.strictEqual(resAssign.body.data.status, 'active');
    assert.strictEqual(resAssign.body.data.plan_code, customPlanCode);

    // Verify Tenant Self-Service reflects the change immediately
    const resTenantSelf = await makeRequest(server, 'GET', '/api/tenant/subscription', ownerToken, undefined, {
      'x-organization-id': orgAlpha,
    });
    assert.strictEqual(resTenantSelf.status, 200);
    assert.strictEqual(resTenantSelf.body.data.plan.code, customPlanCode);
    assert.strictEqual(resTenantSelf.body.data.limits.max_users, 150);
    assert.strictEqual(resTenantSelf.body.data.isAllowedAccess, true);

    // Start / Extend Trial
    const trialDaysFuture = 14;
    const resTrial = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/trial`,
      superAdminToken,
      {
        trialDays: trialDaysFuture,
        reason: 'Extended 14-day evaluation trial',
      }
    );
    assert.strictEqual(resTrial.status, 200, 'Trial extension should succeed');
    assert.strictEqual(resTrial.body.data.status, 'trial');
    assert(resTrial.body.data.trial_ends_at, 'Trial end date should be populated');

    // Invalid Trial Date Validation (Past Date)
    const resInvalidTrial = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/trial`,
      superAdminToken,
      {
        trialEndsAt: new Date(Date.now() - 86400000).toISOString(),
        reason: 'Expired date',
      }
    );
    assert.strictEqual(resInvalidTrial.status, 400, 'Past trial end date must be rejected with 400');
    assert.strictEqual(resInvalidTrial.body.error.code, 'INVALID_TRIAL_DATE');

    // Suspend Subscription
    const resSuspend = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/suspend`,
      superAdminToken,
      { reason: 'Billing non-compliance audit' }
    );
    assert.strictEqual(resSuspend.status, 200, 'Subscription suspension should succeed');
    assert.strictEqual(resSuspend.body.data.status, 'suspended');

    // Attempt double suspend -> 400 INVALID_STATE_TRANSITION
    const resDoubleSuspend = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/suspend`,
      superAdminToken,
      { reason: 'Second suspend attempt' }
    );
    assert.strictEqual(resDoubleSuspend.status, 400, 'Double suspend must fail with 400');
    assert.strictEqual(resDoubleSuspend.body.error.code, 'INVALID_STATE_TRANSITION');

    // Verify Tenant Entitlements Fail Closed when Suspended
    const resTenantSuspendedSelf = await makeRequest(
      server,
      'GET',
      '/api/tenant/subscription',
      ownerToken,
      undefined,
      { 'x-organization-id': orgAlpha }
    );
    assert.strictEqual(resTenantSuspendedSelf.status, 200);
    assert.strictEqual(resTenantSuspendedSelf.body.data.isAllowedAccess, false, 'Suspended tenant access must fail closed');

    // Reactivate Subscription
    const resReactivate = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/reactivate`,
      superAdminToken,
      { reason: 'Compliance issue cleared' }
    );
    assert.strictEqual(resReactivate.status, 200, 'Reactivation should succeed');
    assert.strictEqual(resReactivate.body.data.status, 'active');

    // Cancel Subscription
    const resCancel = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/cancel`,
      superAdminToken,
      { reason: 'Account termination request' }
    );
    assert.strictEqual(resCancel.status, 200, 'Cancellation should succeed');
    assert.strictEqual(resCancel.body.data.status, 'cancelled');

    // Restore Subscription
    const resRestore = await makeRequest(
      server,
      'POST',
      `/api/platform/subscriptions/${orgAlpha}/restore`,
      superAdminToken,
      { reason: 'Customer requested account restoration' }
    );
    assert.strictEqual(resRestore.status, 200, 'Restoration of cancelled subscription should succeed');
    assert.strictEqual(resRestore.body.data.status, 'active');

    console.log('  -> All subscription operations & state transitions verified.');

    // ------------------------------------------------------------------
    // TEST 4: SUBSCRIPTION HISTORY LOGS
    // ------------------------------------------------------------------
    console.log('[Test 4] Testing Subscription History Logs...');

    const resHistory = await makeRequest(
      server,
      'GET',
      `/api/platform/subscriptions/${orgAlpha}/history`,
      superAdminToken
    );
    assert.strictEqual(resHistory.status, 200, 'History log retrieval should succeed');
    assert(Array.isArray(resHistory.body.data), 'History data must be array');
    assert(resHistory.body.data.length >= 6, 'All transition history entries should be recorded');

    const actionsInHistory = resHistory.body.data.map((h: any) => h.action);
    assert(actionsInHistory.includes('SUPER_ADMIN_ASSIGN_PLAN'), 'Assign plan action recorded');
    assert(actionsInHistory.includes('SUPER_ADMIN_EXTEND_TRIAL'), 'Extend trial action recorded');
    assert(actionsInHistory.includes('SUPER_ADMIN_SUSPEND_SUBSCRIPTION'), 'Suspend action recorded');
    assert(actionsInHistory.includes('SUPER_ADMIN_REACTIVATE_SUBSCRIPTION'), 'Reactivate action recorded');
    assert(actionsInHistory.includes('SUPER_ADMIN_CANCEL_SUBSCRIPTION'), 'Cancel action recorded');
    assert(actionsInHistory.includes('SUPER_ADMIN_RESTORE_SUBSCRIPTION'), 'Restore action recorded');

    console.log('  -> Subscription history tracking verified.');

    console.log('✅ ALL SUPER ADMIN PLATFORM & SUBSCRIPTION MANAGEMENT TESTS PASSED!');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
