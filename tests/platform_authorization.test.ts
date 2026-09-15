import assert from 'node:assert/strict';
import http from 'http';
import { canAccessPlatform, getPermissionsForRole, isPlatformRole, ROLES, PERMISSIONS } from '../server/auth/roles.ts';
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

async function main() {
  console.log('\n======================================================');
  console.log(' AbaCha Platform Control-Plane RBAC & Security Tests');
  console.log('======================================================\n');

  // ------------------------------------------------------------------
  // 1. STATIC ROLE POLICY CONTRACT
  // ------------------------------------------------------------------
  await runTest('1.1 Platform Role Identification', () => {
    assert.equal(isPlatformRole('system_owner'), true);
    assert.equal(isPlatformRole('platform_admin'), true);
    assert.equal(isPlatformRole('platform_support'), true);
    assert.equal(isPlatformRole('platform_finance'), true);
    assert.equal(isPlatformRole('super_admin'), false);
    assert.equal(isPlatformRole('admin'), false);
    assert.equal(isPlatformRole('manager'), false);
    assert.equal(isPlatformRole('cashier'), false);
  });

  await runTest('1.2 System Owner Permissions', () => {
    assert.equal(canAccessPlatform('system_owner', 'platform.view'), true);
    assert.equal(canAccessPlatform('system_owner', 'platform.tenants'), true);
    assert.equal(canAccessPlatform('system_owner', 'platform.billing'), true);
    assert.equal(canAccessPlatform('system_owner', 'platform.support'), true);
    assert.ok(getPermissionsForRole('system_owner').every((p) => p.startsWith('platform.')));
  });

  await runTest('1.3 Tenant Personas Blocked from Platform Control Plane', () => {
    assert.equal(canAccessPlatform('admin', 'platform.view'), false);
    assert.equal(canAccessPlatform('admin', 'platform.tenants'), false);
    assert.equal(canAccessPlatform('manager', 'platform.tenants'), false);
    assert.equal(canAccessPlatform('cashier', 'platform.view'), false);
    assert.equal(canAccessPlatform('super_admin', 'platform.view'), false);
    assert.equal(canAccessPlatform('super_admin', 'platform.tenants'), false);
  });

  await runTest('1.4 Platform Roles Granular Responsibility Separation', () => {
    // Platform Admin: view, tenants, support (no billing)
    assert.equal(canAccessPlatform('platform_admin', 'platform.view'), true);
    assert.equal(canAccessPlatform('platform_admin', 'platform.tenants'), true);
    assert.equal(canAccessPlatform('platform_admin', 'platform.support'), true);
    assert.equal(canAccessPlatform('platform_admin', 'platform.billing'), false);

    // Platform Support: view, support (no tenants, no billing)
    assert.equal(canAccessPlatform('platform_support', 'platform.view'), true);
    assert.equal(canAccessPlatform('platform_support', 'platform.support'), true);
    assert.equal(canAccessPlatform('platform_support', 'platform.tenants'), false);
    assert.equal(canAccessPlatform('platform_support', 'platform.billing'), false);

    // Platform Finance: view, billing (no tenants, no support)
    assert.equal(canAccessPlatform('platform_finance', 'platform.view'), true);
    assert.equal(canAccessPlatform('platform_finance', 'platform.billing'), true);
    assert.equal(canAccessPlatform('platform_finance', 'platform.tenants'), false);
    assert.equal(canAccessPlatform('platform_finance', 'platform.support'), false);
  });

  // ------------------------------------------------------------------
  // 2. REAL HTTP INTEGRATION SUITE (MOUNTED DIRECTLY VIA createApp)
  // ------------------------------------------------------------------
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  // Seed sample organizations for tenant isolation tests
  await db.query(
    `INSERT INTO organizations (id, name, code, slug, is_active)
     VALUES 
       ('org_alpha', 'Alpha Enterprises', 'ALPHA', 'alpha-corp', true),
       ('org_beta', 'Beta Retail', 'BETA', 'beta-retail', true),
       ('org_platform', 'Platform Master Control', 'PLATFORM', 'platform-control', true)
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

    const platformAdminToken = signToken({
      userId: 'usr_plt_admin',
      email: 'admin@platform.internal',
      organizationId: 'org_platform',
      role: 'platform_admin',
      permissions: ['platform.view', 'platform.tenants', 'platform.support'],
    });

    const platformSupportToken = signToken({
      userId: 'usr_plt_support',
      email: 'support@platform.internal',
      organizationId: 'org_platform',
      role: 'platform_support',
      permissions: ['platform.view', 'platform.support'],
    });

    const platformFinanceToken = signToken({
      userId: 'usr_plt_finance',
      email: 'finance@platform.internal',
      organizationId: 'org_platform',
      role: 'platform_finance',
      permissions: ['platform.view', 'platform.billing'],
    });

    const tenantSuperAdminToken = signToken({
      userId: 'usr_tenant_owner',
      email: 'owner@alpha.internal',
      organizationId: 'org_alpha',
      role: 'super_admin',
      permissions: ['*'],
    });

    const tenantAdminToken = signToken({
      userId: 'usr_tenant_admin',
      email: 'admin@alpha.internal',
      organizationId: 'org_alpha',
      role: 'admin',
      permissions: ['products.view', 'products.update', 'orders.view', 'inventory.view'],
    });

    const tenantManagerToken = signToken({
      userId: 'usr_tenant_mgr',
      email: 'mgr@alpha.internal',
      organizationId: 'org_alpha',
      role: 'manager',
      permissions: ['products.view', 'orders.view'],
    });

    const tenantCashierToken = signToken({
      userId: 'usr_tenant_cashier',
      email: 'cashier@alpha.internal',
      organizationId: 'org_alpha',
      role: 'cashier',
      permissions: ['pos.sell'],
    });

    const tenantBetaAdminToken = signToken({
      userId: 'usr_beta_admin',
      email: 'admin@beta.internal',
      organizationId: 'org_beta',
      role: 'admin',
      permissions: ['products.view', 'products.update', 'orders.view'],
    });

    // 2.1 Unauthenticated requests -> 401
    await runTest('2.1 Unauthenticated requests rejected with 401', async () => {
      for (const endpoint of ['/api/platform/overview', '/api/platform/tenants', '/api/platform/support', '/api/platform/billing']) {
        const res = await fetch(`${baseUrl}${endpoint}`);
        assert.equal(res.status, 401, `Expected 401 on unauthenticated ${endpoint}`);
        const body = await res.json();
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'UNAUTHORIZED');
      }
    });

    // 2.2 Tenant users rejected from platform APIs -> 403
    await runTest('2.2 Tenant users (super_admin, admin, manager, cashier) rejected from platform APIs with 403', async () => {
      const tenantTokens = [
        { name: 'super_admin', token: tenantSuperAdminToken },
        { name: 'admin', token: tenantAdminToken },
        { name: 'manager', token: tenantManagerToken },
        { name: 'cashier', token: tenantCashierToken },
      ];

      for (const { name, token } of tenantTokens) {
        for (const endpoint of ['/api/platform/overview', '/api/platform/tenants', '/api/platform/support', '/api/platform/billing']) {
          const res = await fetch(`${baseUrl}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          assert.equal(res.status, 403, `Expected 403 for tenant ${name} on ${endpoint}`);
          const body = await res.json();
          assert.equal(body.success, false);
          assert.equal(body.error.code, 'PLATFORM_ACCESS_DENIED');
        }
      }
    });

    // 2.3 System Owner allowed on all platform endpoints -> 200
    await runTest('2.3 System Owner granted access to all platform endpoints (200)', async () => {
      for (const endpoint of ['/api/platform/overview', '/api/platform/tenants', '/api/platform/support', '/api/platform/billing']) {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          headers: { Authorization: `Bearer ${systemOwnerToken}` },
        });
        assert.equal(res.status, 200, `Expected 200 for system_owner on ${endpoint}`);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.ok(body.data != null);
      }
    });

    // 2.4 Platform Admin permission boundary: view/tenants/support allowed (200), billing denied (403)
    await runTest('2.4 Platform Admin permission boundary (overview: 200, tenants: 200, support: 200, billing: 403)', async () => {
      const overviewRes = await fetch(`${baseUrl}/api/platform/overview`, {
        headers: { Authorization: `Bearer ${platformAdminToken}` },
      });
      assert.equal(overviewRes.status, 200);

      const tenantsRes = await fetch(`${baseUrl}/api/platform/tenants`, {
        headers: { Authorization: `Bearer ${platformAdminToken}` },
      });
      assert.equal(tenantsRes.status, 200);

      const supportRes = await fetch(`${baseUrl}/api/platform/support`, {
        headers: { Authorization: `Bearer ${platformAdminToken}` },
      });
      assert.equal(supportRes.status, 200);

      const billingRes = await fetch(`${baseUrl}/api/platform/billing`, {
        headers: { Authorization: `Bearer ${platformAdminToken}` },
      });
      assert.equal(billingRes.status, 403, 'Platform Admin must NOT access billing');
      const billingBody = await billingRes.json();
      assert.equal(billingBody.error.code, 'PLATFORM_PERMISSION_DENIED');
    });

    // 2.5 Platform Support permission boundary: view/support allowed (200), tenants/billing denied (403)
    await runTest('2.5 Platform Support permission boundary (overview: 200, support: 200, tenants: 403, billing: 403)', async () => {
      const overviewRes = await fetch(`${baseUrl}/api/platform/overview`, {
        headers: { Authorization: `Bearer ${platformSupportToken}` },
      });
      assert.equal(overviewRes.status, 200);

      const supportRes = await fetch(`${baseUrl}/api/platform/support`, {
        headers: { Authorization: `Bearer ${platformSupportToken}` },
      });
      assert.equal(supportRes.status, 200);

      const tenantsRes = await fetch(`${baseUrl}/api/platform/tenants`, {
        headers: { Authorization: `Bearer ${platformSupportToken}` },
      });
      assert.equal(tenantsRes.status, 403, 'Platform Support must NOT access tenants');

      const billingRes = await fetch(`${baseUrl}/api/platform/billing`, {
        headers: { Authorization: `Bearer ${platformSupportToken}` },
      });
      assert.equal(billingRes.status, 403, 'Platform Support must NOT access billing');
    });

    // 2.6 Platform Finance permission boundary: view/billing allowed (200), tenants/support denied (403)
    await runTest('2.6 Platform Finance permission boundary (overview: 200, billing: 200, tenants: 403, support: 403)', async () => {
      const overviewRes = await fetch(`${baseUrl}/api/platform/overview`, {
        headers: { Authorization: `Bearer ${platformFinanceToken}` },
      });
      assert.equal(overviewRes.status, 200);

      const billingRes = await fetch(`${baseUrl}/api/platform/billing`, {
        headers: { Authorization: `Bearer ${platformFinanceToken}` },
      });
      assert.equal(billingRes.status, 200);

      const tenantsRes = await fetch(`${baseUrl}/api/platform/tenants`, {
        headers: { Authorization: `Bearer ${platformFinanceToken}` },
      });
      assert.equal(tenantsRes.status, 403, 'Platform Finance must NOT access tenants');

      const supportRes = await fetch(`${baseUrl}/api/platform/support`, {
        headers: { Authorization: `Bearer ${platformFinanceToken}` },
      });
      assert.equal(supportRes.status, 403, 'Platform Finance must NOT access support');
    });

    // 2.7 Cross-Tenant Isolation Enforcement
    await runTest('2.7 Cross-Tenant Isolation: Tenant A cannot access Tenant B organization resources', async () => {
      // 1. Tenant Alpha admin attempts to access Tenant Beta resource
      const crossAlphaToBeta = await fetch(`${baseUrl}/api/catalog/sync?organizationId=org_beta`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenantAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'FORCE_SYNC' }),
      });
      assert.equal(crossAlphaToBeta.status, 403, 'Tenant Alpha targeting Tenant Beta must be rejected with 403');
      const bodyAlphaToBeta = await crossAlphaToBeta.json();
      assert.equal(bodyAlphaToBeta.error.code, 'TENANT_ACCESS_DENIED');

      // 2. Tenant Beta admin attempts to access Tenant Alpha resource
      const crossBetaToAlpha = await fetch(`${baseUrl}/api/catalog/sync?organizationId=org_alpha`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenantBetaAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'FORCE_SYNC' }),
      });
      assert.equal(crossBetaToAlpha.status, 403, 'Tenant Beta targeting Tenant Alpha must be rejected with 403');
      const bodyBetaToAlpha = await crossBetaToAlpha.json();
      assert.equal(bodyBetaToAlpha.error.code, 'TENANT_ACCESS_DENIED');

      // 3. Tenant Alpha accessing own organization succeeds (200)
      const ownTenantRes = await fetch(`${baseUrl}/api/catalog/sync?organizationId=org_alpha`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenantAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'FORCE_SYNC' }),
      });
      assert.equal(ownTenantRes.status, 200, 'Tenant Alpha accessing own organization must succeed with 200');
      const ownBody = await ownTenantRes.json();
      assert.equal(ownBody.success, true);
    });

    // ------------------------------------------------------------------
    // 2.8 TENANT LIFECYCLE MANAGEMENT
    // ------------------------------------------------------------------
    await runTest('2.8 Tenant lifecycle: create, plan update, suspend and activate', async () => {
      const createRes = await fetch(`${baseUrl}/api/platform/tenants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${systemOwnerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Lifecycle Test Tenant',
          slug: 'lifecycle-test',
          code: 'LIFECYCLE_TEST',
          planTier: 'professional',
          adminName: 'Lifecycle Administrator',
          adminEmail: 'lifecycle-admin@example.com',
          adminPassword: 'StrongPassword123',
        }),
      });
      assert.equal(createRes.status, 201);
      const createdBody = await createRes.json();
      assert.equal(createdBody.success, true);
      assert.equal(createdBody.data.tenant.plan, 'professional');
      assert.equal(createdBody.data.initialAdmin.role, 'admin');
      assert.equal(createdBody.data.initialAdmin.email, 'lifecycle-admin@example.com');

      const tenantId = createdBody.data.tenant.id;

      const duplicateRes = await fetch(`${baseUrl}/api/platform/tenants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Duplicate',
          slug: 'lifecycle-test',
          code: 'LIFECYCLE_DUP',
          adminName: 'Duplicate Admin',
          adminEmail: 'duplicate@example.com',
          adminPassword: 'StrongPassword123',
        }),
      });
      assert.equal(duplicateRes.status, 409);

      // Plan mutations via legacy tenant PATCH must be rejected (F-05)
      const updateRes = await fetch(`${baseUrl}/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${platformAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planTier: 'enterprise' }),
      });
      assert.equal(updateRes.status, 403);
      const updateBody = await updateRes.json();
      assert.equal(updateBody.error.code, 'PLAN_CHANGE_REQUIRES_BILLING_PERMISSION');

      // Canonical plan change must go through billing control plane
      const changePlanRes = await fetch(`${baseUrl}/api/platform/subscriptions/${tenantId}/change-plan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${systemOwnerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planCodeOrId: 'enterprise' }),
      });
      assert.equal(changePlanRes.status, 200);
      const changePlanBody = await changePlanRes.json();
      assert.equal(changePlanBody.data.plan.code, 'enterprise');

      const suspendRes = await fetch(`${baseUrl}/api/platform/tenants/${tenantId}/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Lifecycle authorization test' }),
      });
      assert.equal(suspendRes.status, 200);
      const suspendBody = await suspendRes.json();
      assert.equal(suspendBody.data.status, 'suspended');

      const tenantToken = signToken({
        userId: createdBody.data.initialAdmin.id,
        email: createdBody.data.initialAdmin.email,
        organizationId: tenantId,
        role: 'admin',
        permissions: ['products.view'],
      });

      const blockedRes = await fetch(`${baseUrl}/api/products`, {
        headers: { 'Authorization': `Bearer ${tenantToken}` },
      });
      assert.equal(blockedRes.status, 403);
      const blockedBody = await blockedRes.json();
      assert.equal(blockedBody.error.code, 'TENANT_ACCESS_DENIED');

      const activateRes = await fetch(`${baseUrl}/api/platform/tenants/${tenantId}/reactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Lifecycle authorization test' }),
      });
      assert.equal(activateRes.status, 200);
      const activateBody = await activateRes.json();
      assert.equal(activateBody.data.status, 'active');
    });

    console.log('\n======================================================');
    console.log(' ALL PLATFORM AUTHORIZATION TESTS PASSED');
    console.log('======================================================\n');
  } finally {
    server.close();
    await db.close();
  }
}

main().catch((err) => {
  console.error('\nTest Suite Execution Failed:', err);
  process.exit(1);
});
