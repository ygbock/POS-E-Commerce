import assert from 'node:assert/strict';
import http from 'http';
import { signToken } from '../server/auth/token.ts';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrator.ts';
import { createApp } from '../server.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log('PASSED');
  } catch (err: any) {
    console.log('FAILED');
    console.error(`    Error: ${err.message || err}`);
    if (err.stack) console.error(err.stack);
    throw err;
  }
}

async function request(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {},
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { ...(options.headers || {}) };

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
    const req = http.request(url, { method: options.method || 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode || 500, body: parsed });
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

/** Minimal valid provision payload */
function validPayload(overrides: Record<string, any> = {}) {
  return {
    name: 'Acme Corp',
    slug: 'acme-corp',
    planTier: 'starter',
    adminEmail: 'admin@acme.corp',
    adminName: 'Acme Admin',
    adminPassword: 'AcmeSecure123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=================================================================');
  console.log(' TASK-5.6.4: Tenant Provisioning & Lifecycle (21 Test Scenarios)');
  console.log('=================================================================\n');

  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  // Seed platform operator organization (used for auth tokens)
  await db.query(`
    INSERT INTO organizations (id, name, code, slug, is_active, plan_tier)
    VALUES ('org_plt_prov', 'Platform HQ', 'PLT_PROV', 'platform-prov', true, 'enterprise')
    ON CONFLICT (id) DO NOTHING
  `);

  const { app } = await createApp({ db, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const BASE = `http://127.0.0.1:${port}`;

  // ------------------------------------------------------------------
  // Signed test tokens
  // ------------------------------------------------------------------
  const sysOwnerToken = signToken({
    userId: 'usr_prov_sys_owner',
    email: 'owner@platform.internal',
    organizationId: 'org_plt_prov',
    role: 'system_owner',
    permissions: ['platform.view', 'platform.tenants', 'platform.support', 'platform.billing'],
  });

  // platform_admin has platform.tenants but NOT platform.billing
  const platformAdminToken = signToken({
    userId: 'usr_prov_plt_admin',
    email: 'plt_admin@platform.internal',
    organizationId: 'org_plt_prov',
    role: 'platform_admin',
    permissions: ['platform.view', 'platform.tenants', 'platform.support'],
  });

  // Tenant-level user — must never reach platform endpoints
  const tenantUserToken = signToken({
    userId: 'usr_prov_tenant_user',
    email: 'user@tenant.internal',
    organizationId: 'org_plt_prov',
    role: 'admin',
    permissions: ['products.view'],
  });

  // Holds the provisioned tenant ID across test cases
  let provisionedOrgId = '';

  try {
    // ------------------------------------------------------------------
    // SCENARIO 1: Authorization Boundaries
    // ------------------------------------------------------------------
    await runTest('Scenario 1: Authorization boundary — provisioning endpoints require platform.tenants', async () => {
      // Unauthenticated
      const resUnauth = await request(BASE, '/api/platform/tenants', { method: 'GET' });
      assert.equal(resUnauth.status, 401, 'Unauthenticated must get 401');

      // Tenant-level role
      const resTenant = await request(BASE, '/api/platform/tenants', { method: 'GET', token: tenantUserToken });
      assert.equal(resTenant.status, 403, 'Tenant-level role must get 403');

      // POST without auth
      const resPostUnauth = await request(BASE, '/api/platform/tenants', { method: 'POST', body: validPayload() });
      assert.equal(resPostUnauth.status, 401, 'POST without auth must get 401');

      // POST with tenant role
      const resPostTenant = await request(BASE, '/api/platform/tenants', {
        method: 'POST', token: tenantUserToken, body: validPayload(),
      });
      assert.equal(resPostTenant.status, 403, 'POST with tenant role must get 403');

      // platform_admin has platform.tenants -> should be allowed
      const resAdminList = await request(BASE, '/api/platform/tenants', { token: platformAdminToken });
      assert.equal(resAdminList.status, 200, 'platform_admin with platform.tenants must get 200 on GET /tenants');
    });

    // ------------------------------------------------------------------
    // SCENARIO 2: Provisioning Input Validation
    // ------------------------------------------------------------------
    await runTest('Scenario 2: Provisioning rejects missing/invalid fields with correct error codes', async () => {
      const post = (body: any) => request(BASE, '/api/platform/tenants', { method: 'POST', token: sysOwnerToken, body });

      // Missing slug
      const r1 = await post(validPayload({ slug: '' }));
      assert.equal(r1.status, 422, 'Missing slug must be 422');
      assert.equal(r1.body.error.code, 'TENANT_SLUG_REQUIRED', 'Must return TENANT_SLUG_REQUIRED');

      // Invalid slug format
      const r2 = await post(validPayload({ slug: 'AB' }));
      assert.equal(r2.status, 422);
      assert.equal(r2.body.error.code, 'INVALID_TENANT_SLUG', 'Must return INVALID_TENANT_SLUG');

      // Reserved slug
      const r3 = await post(validPayload({ slug: 'admin' }));
      assert.equal(r3.status, 409);
      assert.equal(r3.body.error.code, 'RESERVED_TENANT_SLUG', 'Must return RESERVED_TENANT_SLUG');

      // Missing name
      const r4 = await post(validPayload({ name: '  ' }));
      assert.equal(r4.status, 422);
      assert.equal(r4.body.error.code, 'TENANT_NAME_REQUIRED', 'Must return TENANT_NAME_REQUIRED');

      // Invalid plan tier
      const r5 = await post(validPayload({ planTier: 'premium' }));
      assert.equal(r5.status, 422);
      assert.equal(r5.body.error.code, 'INVALID_PLAN_TIER', 'Must return INVALID_PLAN_TIER');

      // Invalid admin email
      const r6 = await post(validPayload({ adminEmail: 'not-an-email' }));
      assert.equal(r6.status, 422);
      assert.equal(r6.body.error.code, 'INVALID_ADMIN_EMAIL', 'Must return INVALID_ADMIN_EMAIL');

      // Admin name too short
      const r7 = await post(validPayload({ adminName: 'A' }));
      assert.equal(r7.status, 422);
      assert.equal(r7.body.error.code, 'INVALID_ADMIN_NAME', 'Must return INVALID_ADMIN_NAME');

      // Weak password (too short)
      const r8 = await post(validPayload({ adminPassword: 'Short1' }));
      assert.equal(r8.status, 422);
      assert.equal(r8.body.error.code, 'ADMIN_PASSWORD_POLICY', 'Must return ADMIN_PASSWORD_POLICY for short password');

      // Weak password (no uppercase)
      const r9 = await post(validPayload({ adminPassword: 'alllowercase123' }));
      assert.equal(r9.status, 422);
      assert.equal(r9.body.error.code, 'ADMIN_PASSWORD_POLICY', 'Must return ADMIN_PASSWORD_POLICY for no-uppercase password');
    });

    // ------------------------------------------------------------------
    // SCENARIO 3: Successful Atomic Provisioning
    // ------------------------------------------------------------------
    await runTest('Scenario 3: Successful provisioning creates org, admin, and subscription atomically', async () => {
      const res = await request(BASE, '/api/platform/tenants', {
        method: 'POST',
        token: sysOwnerToken,
        body: validPayload({ slug: 'acme-test-001', adminEmail: 'admin@acme-test.internal' }),
      });

      assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.success, 'Must return success: true');

      const { tenant, subscription, initialAdmin } = res.body.data;

      // Organization
      assert.ok(tenant.id, 'Tenant must have an ID');
      assert.match(tenant.id, /^org_/, 'Tenant ID must start with org_');
      assert.equal(tenant.name, 'Acme Corp');
      assert.equal(tenant.slug, 'acme-test-001');
      assert.equal(tenant.plan, 'starter');
      assert.equal(tenant.status, 'active');

      // Subscription
      assert.ok(subscription.id, 'Subscription must have an ID');
      assert.match(subscription.id, /^sub_/, 'Subscription ID must start with sub_');
      assert.equal(subscription.status, 'trialing', 'New tenants start on trialing');
      assert.ok(subscription.trialEndsAt, 'Must have a trial end date');
      assert.ok(new Date(subscription.trialEndsAt) > new Date(), 'Trial must be in the future');

      // Initial admin
      assert.ok(initialAdmin.id, 'Admin must have an ID');
      assert.match(initialAdmin.id, /^usr_/, 'Admin ID must start with usr_');
      assert.equal(initialAdmin.email, 'admin@acme-test.internal');
      assert.equal(initialAdmin.role, 'admin');
      // Password MUST NOT appear in the response
      assert.ok(!('password' in initialAdmin), 'Password must not be in response');
      assert.ok(!('passwordHash' in initialAdmin), 'Password hash must not be in response');
      assert.ok(!('password_hash' in initialAdmin), 'Password hash must not be in response');

      // Verify in DB
      const orgRow = await db.query<any>('SELECT * FROM organizations WHERE id = $1', [tenant.id]);
      assert.equal(orgRow.rows.length, 1, 'Organization must exist in DB');
      assert.equal(orgRow.rows[0].is_active, true, 'Organization must be active');

      const userRow = await db.query<any>('SELECT * FROM users WHERE id = $1', [initialAdmin.id]);
      assert.equal(userRow.rows.length, 1, 'Admin user must exist in DB');
      assert.ok(!userRow.rows[0].password_hash.includes('AcmeSecure'), 'Plain password must not be in DB');

      const subRow = await db.query<any>(
        "SELECT * FROM organization_subscriptions WHERE organization_id = $1 AND status = 'trialing'",
        [tenant.id],
      );
      assert.equal(subRow.rows.length, 1, 'Subscription must exist in DB');

      // Audit event must exist
      const auditRow = await db.query<any>(
        "SELECT * FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_PROVISIONED'",
        [tenant.id],
      );
      assert.equal(auditRow.rows.length, 1, 'Provisioning audit event must exist');
      const afterState = typeof auditRow.rows[0].after_state === 'string'
        ? JSON.parse(auditRow.rows[0].after_state)
        : auditRow.rows[0].after_state;
      assert.ok(!JSON.stringify(afterState).toLowerCase().includes('acmesecure'), 'Audit must not contain password');

      provisionedOrgId = tenant.id;
    });

    // ------------------------------------------------------------------
    // SCENARIO 4: Duplicate Slug / Code Rejection
    // ------------------------------------------------------------------
    await runTest('Scenario 4: Duplicate slug rejected with TENANT_SLUG_OR_CODE_EXISTS', async () => {
      assert.ok(provisionedOrgId, 'Previous test must have provisioned a tenant');

      // Attempt to provision with same slug
      const resDup = await request(BASE, '/api/platform/tenants', {
        method: 'POST',
        token: sysOwnerToken,
        body: validPayload({ slug: 'acme-test-001', adminEmail: 'different@admin.com' }),
      });
      assert.equal(resDup.status, 409, 'Duplicate slug must return 409');
      assert.equal(resDup.body.error.code, 'TENANT_SLUG_OR_CODE_EXISTS', 'Must return correct error code');
    });

    // ------------------------------------------------------------------
    // SCENARIO 5: GET /tenants returns list with filters
    // ------------------------------------------------------------------
    await runTest('Scenario 5: GET /tenants returns filtered paginated list', async () => {
      // Seed an additional tenant for filter testing
      await db.query(`
        INSERT INTO organizations (id, name, code, slug, is_active, plan_tier)
        VALUES ('org_prov_pro_1', 'ProTenant Inc', 'PROV_PRO_1', 'prov-pro-1', true, 'professional')
        ON CONFLICT (id) DO NOTHING
      `);

      // List all (no filter)
      const resAll = await request(BASE, '/api/platform/tenants', { token: sysOwnerToken });
      assert.equal(resAll.status, 200);
      assert.ok(Array.isArray(resAll.body.data), 'Must return an array');
      assert.ok(typeof resAll.body.total === 'number', 'Must return total count');
      assert.ok(typeof resAll.body.pagination === 'object', 'Must return pagination meta');

      // Filter by planTier
      const resPro = await request(BASE, '/api/platform/tenants?planTier=professional', { token: sysOwnerToken });
      assert.equal(resPro.status, 200);
      const allPro = resPro.body.data.every((t: any) => t.planTier === 'professional');
      assert.ok(allPro, 'All returned tenants must be professional plan');

      const invalidStatus = await request(BASE, '/api/platform/tenants?status=bogus', { token: sysOwnerToken });
      assert.equal(invalidStatus.status, 422);
      assert.equal(invalidStatus.body.error.code, 'INVALID_TENANT_STATUS');

      // Filter by status=active
      const resActive = await request(BASE, '/api/platform/tenants?status=active', { token: sysOwnerToken });
      assert.equal(resActive.status, 200);
      const allActive = resActive.body.data.every((t: any) => t.status === 'active');
      assert.ok(allActive, 'All returned tenants must be active');

      // Search
      const resSearch = await request(BASE, '/api/platform/tenants?search=ProTenant', { token: sysOwnerToken });
      assert.equal(resSearch.status, 200);
      const found = resSearch.body.data.some((t: any) => t.name === 'ProTenant Inc');
      assert.ok(found, 'Search must find ProTenant Inc');

      // Pagination
      const resPage = await request(BASE, '/api/platform/tenants?limit=1&offset=0', { token: sysOwnerToken });
      assert.equal(resPage.status, 200);
      assert.equal(resPage.body.data.length, 1, 'Limit must be respected');
      assert.equal(resPage.body.pagination.limit, 1);
    });

    // ------------------------------------------------------------------
    // SCENARIO 6: GET /tenants/:id detail
    // ------------------------------------------------------------------
    await runTest('Scenario 6: GET /tenants/:id returns detailed tenant view', async () => {
      assert.ok(provisionedOrgId, 'Previous test must have provisioned a tenant');

      const res = await request(BASE, `/api/platform/tenants/${provisionedOrgId}`, { token: sysOwnerToken });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

      const { data } = res.body;
      assert.equal(data.id, provisionedOrgId);
      assert.equal(data.slug, 'acme-test-001');
      assert.equal(data.isActive, true);
      assert.ok(typeof data.userCount === 'number', 'Must include userCount');
      assert.ok(typeof data.locationCount === 'number', 'Must include locationCount');
      assert.ok(data.userCount >= 1, 'Must count the initial admin user');
      assert.ok(data.subscription !== null, 'Must include subscription details');

      // Non-existent tenant
      const res404 = await request(BASE, '/api/platform/tenants/org_does_not_exist', { token: sysOwnerToken });
      assert.equal(res404.status, 404, 'Non-existent tenant must return 404');
      assert.equal(res404.body.error.code, 'TENANT_NOT_FOUND');
    });

    // ------------------------------------------------------------------
    // SCENARIO 7: Suspend Tenant (Happy Path)
    // ------------------------------------------------------------------
    await runTest('Scenario 7: Suspend tenant — deactivates org and pauses subscription', async () => {
      assert.ok(provisionedOrgId, 'Need provisioned org');

      const res = await request(BASE, `/api/platform/tenants/${provisionedOrgId}/suspend`, {
        method: 'POST',
        token: sysOwnerToken,
        body: { reason: 'Non-payment test' },
      });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.status, 'suspended');

      // Verify in DB
      const orgRow = await db.query<any>('SELECT is_active FROM organizations WHERE id = $1', [provisionedOrgId]);
      assert.equal(orgRow.rows[0].is_active, false, 'Organization must be inactive');

      const subRow = await db.query<any>(
        "SELECT status FROM organization_subscriptions WHERE organization_id = $1 AND status = 'paused'",
        [provisionedOrgId],
      );
      assert.equal(subRow.rows.length, 1, 'Subscription must be paused');

      // Audit event
      const auditRow = await db.query<any>(
        "SELECT * FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_SUSPENDED' ORDER BY timestamp DESC LIMIT 1",
        [provisionedOrgId],
      );
      assert.equal(auditRow.rows.length, 1, 'Suspension audit event must exist');
    });

    // ------------------------------------------------------------------
    // SCENARIO 8: Suspend Idempotency
    // ------------------------------------------------------------------
    await runTest('Scenario 8: Repeated suspend is idempotent — returns success without side effects', async () => {
      assert.ok(provisionedOrgId, 'Need provisioned org');

      // Suspend again on already-suspended tenant
      const res = await request(BASE, `/api/platform/tenants/${provisionedOrgId}/suspend`, {
        method: 'POST',
        token: sysOwnerToken,
        body: { reason: 'Idempotency check' },
      });
      assert.equal(res.status, 200, 'Repeated suspend must still return 200');
      assert.equal(res.body.data.status, 'suspended');

      // Still only one 'paused' subscription (no duplication)
      const subRows = await db.query<any>(
        "SELECT COUNT(*) AS c FROM organization_subscriptions WHERE organization_id = $1 AND status = 'paused'",
        [provisionedOrgId],
      );
      assert.equal(Number(subRows.rows[0].c), 1, 'Must not create duplicate paused subscriptions');
    });

    // ------------------------------------------------------------------
    // SCENARIO 9: Reactivate Tenant
    // ------------------------------------------------------------------
    await runTest('Scenario 9: Reactivate tenant — sets org active and restores subscription', async () => {
      assert.ok(provisionedOrgId, 'Need provisioned org');

      const res = await request(BASE, `/api/platform/tenants/${provisionedOrgId}/reactivate`, {
        method: 'POST',
        token: sysOwnerToken,
        body: { reason: 'Payment received' },
      });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.status, 'active');

      // Verify in DB
      const orgRow = await db.query<any>('SELECT is_active FROM organizations WHERE id = $1', [provisionedOrgId]);
      assert.equal(orgRow.rows[0].is_active, true, 'Organization must be active again');

      const subRow = await db.query<any>(
        "SELECT status FROM organization_subscriptions WHERE organization_id = $1 AND status IN ('trialing','active')",
        [provisionedOrgId],
      );
      assert.equal(subRow.rows.length, 1, 'Subscription must be active or trialing again');

      // Audit
      const auditRow = await db.query<any>(
        "SELECT * FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_REACTIVATED' ORDER BY timestamp DESC LIMIT 1",
        [provisionedOrgId],
      );
      assert.ok(auditRow.rows.length >= 1, 'Reactivation audit event must exist');
    });

    // ------------------------------------------------------------------
    // SCENARIO 10: Reactivate Idempotency
    // ------------------------------------------------------------------
    await runTest('Scenario 10: Repeated reactivate is idempotent', async () => {
      const res = await request(BASE, `/api/platform/tenants/${provisionedOrgId}/reactivate`, {
        method: 'POST',
        token: sysOwnerToken,
      });
      assert.equal(res.status, 200, 'Repeated reactivate must return 200');
      assert.equal(res.body.data.status, 'active');
    });

    // ------------------------------------------------------------------
    // SCENARIO 11: Archive Tenant
    // ------------------------------------------------------------------
    await runTest('Scenario 11: Archive tenant — deactivates org and cancels all subscriptions', async () => {
      assert.ok(provisionedOrgId, 'Need provisioned org');

      const res = await request(BASE, `/api/platform/tenants/${provisionedOrgId}/archive`, {
        method: 'POST',
        token: sysOwnerToken,
        body: { reason: 'Account closure by user request' },
      });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.status, 'archived');

      // Verify in DB
      const orgRow = await db.query<any>('SELECT is_active FROM organizations WHERE id = $1', [provisionedOrgId]);
      assert.equal(orgRow.rows[0].is_active, false, 'Org must be inactive after archive');

      const subRows = await db.query<any>(
        "SELECT status FROM organization_subscriptions WHERE organization_id = $1 AND status NOT IN ('cancelled','expired')",
        [provisionedOrgId],
      );
      assert.equal(subRows.rows.length, 0, 'No non-terminal subscriptions must remain after archive');

      // Audit at Critical severity
      const auditRow = await db.query<any>(
        "SELECT severity FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_ARCHIVED'",
        [provisionedOrgId],
      );
      assert.ok(auditRow.rows.length >= 1, 'Archive audit event must exist');
      assert.equal(auditRow.rows[0].severity, 'Critical', 'Archive must be logged at Critical severity');
    });

    // ------------------------------------------------------------------
    // SCENARIO 12: Canonical lifecycle boundaries and billing invariants
    // ------------------------------------------------------------------
    await runTest('Scenario 12: Legacy lifecycle PATCH is rejected and reactivation fails closed without subscription', async () => {
      const legacyPatch = await request(BASE, `/api/platform/tenants/${provisionedOrgId}`, {
        method: 'PATCH', token: sysOwnerToken, body: { isActive: false },
      });
      assert.equal(legacyPatch.status, 403);
      assert.equal(legacyPatch.body.error.code, 'LIFECYCLE_CHANGE_REQUIRES_LIFECYCLE_PERMISSION');

      const noSubOrg = 'org_prov_no_sub';
      await db.query(`
        INSERT INTO organizations (id, name, code, slug, is_active, lifecycle_status, plan_tier)
        VALUES ('org_prov_no_sub', 'No Sub Tenant', 'NO_SUB_TENANT', 'no-sub-tenant', false, 'suspended', 'starter')
        ON CONFLICT (id) DO UPDATE SET is_active = false, lifecycle_status = 'suspended'
      `);
      const res = await request(BASE, `/api/platform/tenants/${noSubOrg}/reactivate`, {
        method: 'POST', token: sysOwnerToken,
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SUBSCRIPTION_NOT_REACTIVATABLE');

      const state = await db.query<any>('SELECT is_active, lifecycle_status FROM organizations WHERE id = $1', [noSubOrg]);
      assert.equal(state.rows[0].is_active, false);
      assert.equal(state.rows[0].lifecycle_status, 'suspended');
    });

    // ------------------------------------------------------------------
    // SCENARIO 12: 404 for non-existent tenant lifecycle operations
    // ------------------------------------------------------------------
    await runTest('Scenario 12: Lifecycle operations on non-existent tenant return 404', async () => {
      const fakeId = 'org_does_not_exist_ever';

      const resSuspend = await request(BASE, `/api/platform/tenants/${fakeId}/suspend`, {
        method: 'POST', token: sysOwnerToken, body: {},
      });
      assert.equal(resSuspend.status, 404);
      assert.equal(resSuspend.body.error.code, 'TENANT_NOT_FOUND');

      const resReactivate = await request(BASE, `/api/platform/tenants/${fakeId}/reactivate`, {
        method: 'POST', token: sysOwnerToken, body: {},
      });
      assert.equal(resReactivate.status, 404);
      assert.equal(resReactivate.body.error.code, 'TENANT_NOT_FOUND');

      const resArchive = await request(BASE, `/api/platform/tenants/${fakeId}/archive`, {
        method: 'POST', token: sysOwnerToken, body: {},
      });
      assert.equal(resArchive.status, 404);
      assert.equal(resArchive.body.error.code, 'TENANT_NOT_FOUND');

      const resDetail = await request(BASE, `/api/platform/tenants/${fakeId}`, { token: sysOwnerToken });
      assert.equal(resDetail.status, 404);
      assert.equal(resDetail.body.error.code, 'TENANT_NOT_FOUND');
    });


    // ------------------------------------------------------------------
    // SCENARIO 13: Durable lifecycle state + archive is terminal
    // ------------------------------------------------------------------
    await runTest('Scenario 13: Durable lifecycle state distinguishes suspended from archived and blocks reactivation', async () => {
      const archivedRow = await db.query<any>(
        'SELECT lifecycle_status, is_active FROM organizations WHERE id = $1',
        [provisionedOrgId],
      );
      assert.equal(archivedRow.rows[0].lifecycle_status, 'archived');
      assert.equal(archivedRow.rows[0].is_active, false);

      const reactivateArchived = await request(BASE, `/api/platform/tenants/${provisionedOrgId}/reactivate`, {
        method: 'POST', token: sysOwnerToken,
      });
      assert.equal(reactivateArchived.status, 409);
      assert.equal(reactivateArchived.body.error.code, 'TENANT_ARCHIVED');

      const patchArchived = await request(BASE, `/api/platform/tenants/${provisionedOrgId}`, {
        method: 'PATCH', token: sysOwnerToken, body: { isActive: true },
      });
      assert.equal(patchArchived.status, 403);
      assert.equal(patchArchived.body.error.code, 'LIFECYCLE_CHANGE_REQUIRES_LIFECYCLE_PERMISSION');
    });

    // ------------------------------------------------------------------
    // SCENARIO 14: Provisioning idempotency
    // ------------------------------------------------------------------
    await runTest('Scenario 14: Provisioning idempotency returns the original result without duplicate tenant state', async () => {
      const payload = validPayload({
        slug: 'idempotent-tenant',
        adminEmail: 'admin@idempotent.internal',
      });
      const headers = { 'X-Idempotency-Key': 'tenant-provision-key-001' };

      const first = await request(BASE, '/api/platform/tenants', {
        method: 'POST', token: sysOwnerToken, body: payload, headers,
      });
      assert.equal(first.status, 201);
      const second = await request(BASE, '/api/platform/tenants', {
        method: 'POST', token: sysOwnerToken, body: { ...payload, name: 'Changed Name' }, headers,
      });
      assert.equal(second.status, 201);
      assert.equal(second.body.data.tenant.id, first.body.data.tenant.id);
      assert.equal(second.body.data.tenant.name, first.body.data.tenant.name);

      const orgs = await db.query<any>(
        "SELECT COUNT(*) AS c FROM organizations WHERE slug = 'idempotent-tenant'",
      );
      assert.equal(Number(orgs.rows[0].c), 1);
    });

    // ------------------------------------------------------------------
    // SCENARIO 15: Canonical plan enforcement
    // ------------------------------------------------------------------
    await runTest('Scenario 15: Provisioning rejects inactive canonical plans instead of silently falling back', async () => {
      await db.query("UPDATE subscription_plans SET is_active = false WHERE code = 'enterprise'");

      const res = await request(BASE, '/api/platform/tenants', {
        method: 'POST',
        token: sysOwnerToken,
        body: validPayload({
          name: 'Inactive Plan Tenant',
          slug: 'inactive-plan-tenant',
          planTier: 'enterprise',
          adminEmail: 'admin@inactive-plan.internal',
        }),
      });
      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, 'PLAN_NOT_FOUND');

      const org = await db.query<any>(
        "SELECT COUNT(*) AS c FROM organizations WHERE slug = 'inactive-plan-tenant'",
      );
      assert.equal(Number(org.rows[0].c), 0, 'Failed plan resolution must roll back organization creation');

      await db.query("UPDATE subscription_plans SET is_active = true WHERE code = 'enterprise'");
    });

    // ------------------------------------------------------------------
    // SCENARIO 16: Archived tenant listing
    // ------------------------------------------------------------------
    await runTest('Scenario 16: Tenant listing exposes archived state explicitly', async () => {
      const res = await request(BASE, '/api/platform/tenants?status=archived', { token: sysOwnerToken });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some((t: any) => t.id === provisionedOrgId));
      const archived = res.body.data.find((t: any) => t.id === provisionedOrgId);
      assert.equal(archived.status, 'archived');
    });

    // ------------------------------------------------------------------
    // SCENARIO 17: Lifecycle Idempotency (Suspend, Reactivate, Archive)
    // ------------------------------------------------------------------
    await runTest('Scenario 17: Full lifecycle idempotency prevents duplicate mutations & audit events', async () => {
      // Provision a dedicated tenant for testing lifecycle idempotency
      const provRes = await request(BASE, '/api/platform/tenants', {
        method: 'POST',
        token: sysOwnerToken,
        body: validPayload({ slug: 'idem-lifecycle-org', adminEmail: 'admin@idem-life.internal' }),
      });
      assert.equal(provRes.status, 201);
      const testOrgId = provRes.body.data.tenant.id;

      // 1. Suspend with idempotency key
      const suspHeaders = { 'X-Idempotency-Key': 'suspend-key-unique-001' };
      const susp1 = await request(BASE, `/api/platform/tenants/${testOrgId}/suspend`, {
        method: 'POST', token: sysOwnerToken, headers: suspHeaders,
      });
      assert.equal(susp1.status, 200);
      assert.equal(susp1.body.data.status, 'suspended');

      // Audit count after first suspend
      const suspAudit1 = await db.query<any>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_SUSPENDED'",
        [testOrgId],
      );
      assert.equal(Number(suspAudit1.rows[0].c), 1, 'First suspend generates exactly 1 audit event');

      // Replay suspend with same idempotency key
      const susp2 = await request(BASE, `/api/platform/tenants/${testOrgId}/suspend`, {
        method: 'POST', token: sysOwnerToken, headers: suspHeaders,
      });
      assert.equal(susp2.status, 200);
      assert.equal(susp2.body.data.status, 'suspended');
      assert.equal(susp2.body.data.timestamp, susp1.body.data.timestamp, 'Must return identical replay timestamp');

      // Audit count after replay
      const suspAudit2 = await db.query<any>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_SUSPENDED'",
        [testOrgId],
      );
      assert.equal(Number(suspAudit2.rows[0].c), 1, 'Replay MUST NOT generate duplicate audit event');

      // 2. Reactivate with idempotency key
      const reactHeaders = { 'X-Idempotency-Key': 'reactivate-key-unique-001' };
      const react1 = await request(BASE, `/api/platform/tenants/${testOrgId}/reactivate`, {
        method: 'POST', token: sysOwnerToken, headers: reactHeaders,
      });
      assert.equal(react1.status, 200);
      assert.equal(react1.body.data.status, 'active');

      const reactAudit1 = await db.query<any>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_REACTIVATED'",
        [testOrgId],
      );
      assert.equal(Number(reactAudit1.rows[0].c), 1, 'First reactivation generates exactly 1 audit event');

      // Replay reactivate
      const react2 = await request(BASE, `/api/platform/tenants/${testOrgId}/reactivate`, {
        method: 'POST', token: sysOwnerToken, headers: reactHeaders,
      });
      assert.equal(react2.status, 200);
      assert.equal(react2.body.data.status, 'active');
      assert.equal(react2.body.data.timestamp, react1.body.data.timestamp, 'Must return identical replay timestamp');

      const reactAudit2 = await db.query<any>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_REACTIVATED'",
        [testOrgId],
      );
      assert.equal(Number(reactAudit2.rows[0].c), 1, 'Replay MUST NOT generate duplicate audit event');

      // 3. Archive with idempotency key
      const archHeaders = { 'X-Idempotency-Key': 'archive-key-unique-001' };
      const arch1 = await request(BASE, `/api/platform/tenants/${testOrgId}/archive`, {
        method: 'POST', token: sysOwnerToken, headers: archHeaders,
      });
      assert.equal(arch1.status, 200);
      assert.equal(arch1.body.data.status, 'archived');

      const archAudit1 = await db.query<any>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_ARCHIVED'",
        [testOrgId],
      );
      assert.equal(Number(archAudit1.rows[0].c), 1, 'First archive generates exactly 1 audit event');

      // Replay archive
      const arch2 = await request(BASE, `/api/platform/tenants/${testOrgId}/archive`, {
        method: 'POST', token: sysOwnerToken, headers: archHeaders,
      });
      assert.equal(arch2.status, 200);
      assert.equal(arch2.body.data.status, 'archived');
      assert.equal(arch2.body.data.timestamp, arch1.body.data.timestamp, 'Must return identical replay timestamp');

      const archAudit2 = await db.query<any>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE entity_id = $1 AND action = 'PLATFORM_TENANT_ARCHIVED'",
        [testOrgId],
      );
      assert.equal(Number(archAudit2.rows[0].c), 1, 'Replay MUST NOT generate duplicate audit event');
    });

    // ------------------------------------------------------------------
    // SCENARIO 18: Concurrency Idempotency
    // ------------------------------------------------------------------
    await runTest('Scenario 18: Concurrent provisioning with identical idempotency key resolves cleanly', async () => {
      const payload = validPayload({
        slug: 'concurrent-idem-tenant',
        adminEmail: 'admin@concurrent.internal',
      });
      const headers = { 'X-Idempotency-Key': 'concurrent-idem-key-999' };

      const [resA, resB] = await Promise.all([
        request(BASE, '/api/platform/tenants', { method: 'POST', token: sysOwnerToken, body: payload, headers }),
        request(BASE, '/api/platform/tenants', { method: 'POST', token: sysOwnerToken, body: payload, headers }),
      ]);

      assert.ok([201, 409].includes(resA.status), `resA status was ${resA.status}`);
      assert.ok([201, 409].includes(resB.status), `resB status was ${resB.status}`);

      const successfulRes = resA.status === 201 ? resA : resB;
      assert.equal(successfulRes.status, 201);

      // Exactly 1 organization was created
      const orgCount = await db.query<any>(
        "SELECT COUNT(*) AS c FROM organizations WHERE slug = 'concurrent-idem-tenant'",
      );
      assert.equal(Number(orgCount.rows[0].c), 1, 'Exactly one tenant created in concurrency race');
    });

    // ------------------------------------------------------------------
    // SCENARIO 19: Subscription Reactivation Invariant
    // ------------------------------------------------------------------
    await runTest('Scenario 19: Reactivation refuses when conflicting active subscription already exists', async () => {
      // Create a tenant
      const provRes = await request(BASE, '/api/platform/tenants', {
        method: 'POST',
        token: sysOwnerToken,
        body: validPayload({ slug: 'sub-conflict-org', adminEmail: 'admin@subconflict.internal' }),
      });
      assert.equal(provRes.status, 201);
      const conflictOrgId = provRes.body.data.tenant.id;

      // Suspend it so subscription is paused
      const suspRes = await request(BASE, `/api/platform/tenants/${conflictOrgId}/suspend`, {
        method: 'POST', token: sysOwnerToken,
      });
      assert.equal(suspRes.status, 200);

      // Transition the subscription directly to 'active' (e.g. via out-of-band billing mutation)
      // while the organization is still in suspended state
      await db.query(
        "UPDATE organization_subscriptions SET status = 'active' WHERE organization_id = $1",
        [conflictOrgId],
      );

      // Attempt to reactivate — must detect conflicting active subscription and fail with 409
      const reactRes = await request(BASE, `/api/platform/tenants/${conflictOrgId}/reactivate`, {
        method: 'POST', token: sysOwnerToken,
      });
      assert.equal(reactRes.status, 409, 'Must reject when active subscription already exists');
      assert.equal(reactRes.body.error.code, 'SUBSCRIPTION_CONFLICT');
    });

    // ------------------------------------------------------------------
    // SCENARIO 20: GET /tenants Pagination Input Normalization
    // ------------------------------------------------------------------
    await runTest('Scenario 20: GET /tenants pagination defensively normalizes malformed inputs', async () => {
      // Non-numeric limit defaults to 50
      const resNaN = await request(BASE, '/api/platform/tenants?limit=abc&offset=xyz', { token: sysOwnerToken });
      assert.equal(resNaN.status, 200);
      assert.equal(resNaN.body.pagination.limit, 50);
      assert.equal(resNaN.body.pagination.offset, 0);

      // Negative limit defaults to 50
      const resNeg = await request(BASE, '/api/platform/tenants?limit=-10&offset=-5', { token: sysOwnerToken });
      assert.equal(resNeg.status, 200);
      assert.equal(resNeg.body.pagination.limit, 50);
      assert.equal(resNeg.body.pagination.offset, 0);

      // Huge limit clamped to 200
      const resHuge = await request(BASE, '/api/platform/tenants?limit=9999999', { token: sysOwnerToken });
      assert.equal(resHuge.status, 200);
      assert.equal(resHuge.body.pagination.limit, 200);
    });

    // ------------------------------------------------------------------
    // SCENARIO 21: Full Audit Trail Lifecycle State Inspection
    // ------------------------------------------------------------------
    await runTest('Scenario 21: Audit events capture complete before_state and after_state lifecycle status', async () => {
      const suspEvent = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_TENANT_SUSPENDED' ORDER BY timestamp DESC LIMIT 1"
      );
      assert.ok(suspEvent.rows.length > 0);
      const suspBefore = typeof suspEvent.rows[0].before_state === 'string'
        ? JSON.parse(suspEvent.rows[0].before_state) : suspEvent.rows[0].before_state;
      const suspAfter = typeof suspEvent.rows[0].after_state === 'string'
        ? JSON.parse(suspEvent.rows[0].after_state) : suspEvent.rows[0].after_state;
      assert.equal(suspBefore.lifecycleStatus, 'active');
      assert.equal(suspAfter.lifecycleStatus, 'suspended');

      const reactEvent = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_TENANT_REACTIVATED' ORDER BY timestamp DESC LIMIT 1"
      );
      assert.ok(reactEvent.rows.length > 0);
      const reactBefore = typeof reactEvent.rows[0].before_state === 'string'
        ? JSON.parse(reactEvent.rows[0].before_state) : reactEvent.rows[0].before_state;
      const reactAfter = typeof reactEvent.rows[0].after_state === 'string'
        ? JSON.parse(reactEvent.rows[0].after_state) : reactEvent.rows[0].after_state;
      assert.equal(reactBefore.lifecycleStatus, 'suspended');
      assert.equal(reactAfter.lifecycleStatus, 'active');

      const archEvent = await db.query<any>(
        "SELECT * FROM audit_events WHERE action = 'PLATFORM_TENANT_ARCHIVED' ORDER BY timestamp DESC LIMIT 1"
      );
      assert.ok(archEvent.rows.length > 0);
      const archAfter = typeof archEvent.rows[0].after_state === 'string'
        ? JSON.parse(archEvent.rows[0].after_state) : archEvent.rows[0].after_state;
      assert.equal(archAfter.lifecycleStatus, 'archived');
    });

    console.log('\nAll 21 test scenarios in TASK-5.6.4 passed cleanly!\n');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
