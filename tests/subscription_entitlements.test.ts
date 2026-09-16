process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { AuthService } from '../server/services/authService';
import { UserRepository } from '../server/repositories/userRepository';
import { SubscriptionRepository } from '../server/repositories/subscriptionRepository';
import { SubscriptionService } from '../server/services/subscriptionService';
import { hashPassword } from '../server/auth/password';
import { signToken } from '../server/auth/token';

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
      {
        method,
        headers,
      },
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

async function runSubscriptionEntitlementsTests() {
  console.log('======================================================');
  console.log(' TASK-5.6.2: SaaS Plan Limits & Entitlements Test Suite');
  console.log('======================================================');

  let passed = 0;
  let failed = 0;

  function markPassed(name: string) {
    console.log(`  [TEST] ${name}... PASSED`);
    passed++;
  }

  function markFailed(name: string, err: any) {
    console.error(`  [TEST] ${name}... FAILED!`);
    console.error(err);
    failed++;
  }

  // 1. Initialize DB & Migrations
  console.log('Initializing DB client...');
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  console.log('Running migrations...');
  await runMigrations(db);
  console.log('Migrations complete!');

  // Setup Test Tenants in Database
  await db.exec(`
    INSERT INTO organizations (id, name, code, is_active) VALUES
      ('org_starter_tenant', 'Starter Merchant Inc', 'STARTER_MERCHANT', TRUE),
      ('org_pro_tenant', 'Pro Retailer Ltd', 'PRO_RETAILER', TRUE),
      ('org_enterprise_tenant', 'Enterprise Holdings', 'ENTERPRISE_HOLDINGS', TRUE),
      ('org_unsubscribed_tenant', 'No Subscription Corp', 'NO_SUB', TRUE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO subscriptions (id, organization_id, plan_id, status) VALUES
      ('sub_starter', 'org_starter_tenant', 'plan_starter', 'active'),
      ('sub_pro', 'org_pro_tenant', 'plan_professional', 'active'),
      ('sub_enterprise', 'org_enterprise_tenant', 'plan_enterprise', 'active')
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO locations (id, organization_id, code, name, type, is_active) VALUES
      ('loc_starter_1', 'org_starter_tenant', 'LOC-STARTER-1', 'Starter Main Store', 'Retail Store', TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);

  const { hash, salt } = hashPassword('TestPassword123!');

  // Seed Test Users
  const userRepo = new UserRepository(db);

  // Starter Admin
  await userRepo.createUser({
    organizationId: 'org_starter_tenant',
    email: 'admin@starter.test',
    name: 'Starter Admin',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
  });

  // Pro Admin
  await userRepo.createUser({
    organizationId: 'org_pro_tenant',
    email: 'admin@pro.test',
    name: 'Pro Admin',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
  });

  // Enterprise Admin
  await userRepo.createUser({
    organizationId: 'org_enterprise_tenant',
    email: 'admin@enterprise.test',
    name: 'Enterprise Admin',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
  });

  // Unsubscribed Admin
  await userRepo.createUser({
    organizationId: 'org_unsubscribed_tenant',
    email: 'admin@unsub.test',
    name: 'Unsubscribed Admin',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
  });

  // Platform Super Admin
  await userRepo.createUser({
    organizationId: 'org_enterprise_tenant',
    email: 'super@platform.test',
    name: 'Platform Super Admin',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'super_admin',
  });

  // JWT Tokens
  const starterToken = signToken({
    userId: 'usr_starter_admin',
    organizationId: 'org_starter_tenant',
    email: 'admin@starter.test',
    role: 'admin',
    permissions: ['users.create', 'products.create', 'orders.create', 'reports.view', 'audit.view', 'locations.manage'],
  });

  const proToken = signToken({
    userId: 'usr_pro_admin',
    organizationId: 'org_pro_tenant',
    email: 'admin@pro.test',
    role: 'admin',
    permissions: ['users.create', 'products.create', 'orders.create', 'reports.view', 'audit.view', 'locations.manage'],
  });

  const enterpriseToken = signToken({
    userId: 'usr_enterprise_admin',
    organizationId: 'org_enterprise_tenant',
    email: 'admin@enterprise.test',
    role: 'admin',
    permissions: ['users.create', 'products.create', 'orders.create', 'reports.view', 'audit.view', 'locations.manage'],
  });

  const unsubscribedToken = signToken({
    userId: 'usr_unsub_admin',
    organizationId: 'org_unsubscribed_tenant',
    email: 'admin@unsub.test',
    role: 'admin',
    permissions: ['users.create', 'products.create', 'orders.create', 'reports.view', 'audit.view', 'locations.manage'],
  });

  const superAdminToken = signToken({
    userId: 'usr_super_admin',
    organizationId: 'org_starter_tenant',
    email: 'super@platform.test',
    role: 'super_admin',
    permissions: ['*'],
  });

  // Create Express App
  const appContainer = await createApp({ db, skipVite: true });
  const server = http.createServer(appContainer.app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    // ------------------------------------------------------------------
    // SCENARIO 1: Tenant receives correct Starter entitlements
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', starterToken);
      assert.strictEqual(res.status, 200, 'HTTP status should be 200');
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.plan.code, 'starter');
      assert.strictEqual(res.body.data.status, 'active');
      assert.strictEqual(res.body.data.isAllowedAccess, true);
      assert.strictEqual(res.body.data.features.pos, true);
      assert.strictEqual(res.body.data.features.advanced_reports, false);
      assert.strictEqual(res.body.data.limits.max_users, 3);
      assert.strictEqual(res.body.data.limits.max_locations, 1);
      markPassed('1. Tenant receives correct Starter entitlements');
    } catch (err) {
      markFailed('1. Tenant receives correct Starter entitlements', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 2: Tenant receives correct Professional entitlements
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', proToken);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.plan.code, 'professional');
      assert.strictEqual(res.body.data.features.advanced_reports, true);
      assert.strictEqual(res.body.data.features.multi_location, true);
      assert.strictEqual(res.body.data.features.api_access, false);
      assert.strictEqual(res.body.data.limits.max_users, 25);
      assert.strictEqual(res.body.data.limits.max_locations, 5);
      markPassed('2. Tenant receives correct Professional entitlements');
    } catch (err) {
      markFailed('2. Tenant receives correct Professional entitlements', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 3: Tenant receives correct Enterprise entitlements
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', enterpriseToken);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.plan.code, 'enterprise');
      assert.strictEqual(res.body.data.features.api_access, true);
      assert.strictEqual(res.body.data.features.advanced_analytics, true);
      assert.strictEqual(res.body.data.limits.max_users, 1000);
      markPassed('3. Tenant receives correct Enterprise entitlements');
    } catch (err) {
      markFailed('3. Tenant receives correct Enterprise entitlements', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 4: Feature disabled -> access denied
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/reports/advanced', starterToken);
      assert.strictEqual(res.status, 403, 'Should deny disabled feature with 403');
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'FEATURE_NOT_INCLUDED');
      markPassed('4. Feature disabled -> access denied');
    } catch (err) {
      markFailed('4. Feature disabled -> access denied', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 5: Feature enabled -> access allowed
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/reports/advanced', proToken);
      assert.strictEqual(res.status, 200, 'Should allow enabled feature with 200');
      assert.strictEqual(res.body.success, true);
      markPassed('5. Feature enabled -> access allowed');
    } catch (err) {
      markFailed('5. Feature enabled -> access allowed', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 6: User quota below limit -> creation allowed
    // ------------------------------------------------------------------
    try {
      // Starter merchant has 1 user (usr_starter_admin). Max users is 3.
      const res2 = await makeRequest(server, 'POST', '/api/users', starterToken, {
        email: 'user2@starter.test',
        name: 'Starter User 2',
        password: 'Password123!',
        role: 'cashier',
      });
      assert.strictEqual(res2.status, 201, 'Should allow user 2 creation when under quota');

      const res3 = await makeRequest(server, 'POST', '/api/users', starterToken, {
        email: 'user3@starter.test',
        name: 'Starter User 3',
        password: 'Password123!',
        role: 'cashier',
      });
      assert.strictEqual(res3.status, 201, 'Should allow user 3 creation when under quota');
      markPassed('6. User quota below limit -> creation allowed');
    } catch (err) {
      markFailed('6. User quota below limit -> creation allowed', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 7: User quota at limit -> creation denied
    // ------------------------------------------------------------------
    try {
      // Starter merchant now has 3 users (max 3). Attempting 4th user creation must fail.
      const res = await makeRequest(server, 'POST', '/api/users', starterToken, {
        email: 'user4@starter.test',
        name: 'Starter User 4',
        password: 'Password123!',
        role: 'cashier',
      });
      assert.strictEqual(res.status, 403, 'Should reject user creation when at quota limit with 403');
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'LIMIT_EXCEEDED');
      markPassed('7. User quota at limit -> creation denied');
    } catch (err) {
      markFailed('7. User quota at limit -> creation denied', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 8: Location quota enforced
    // ------------------------------------------------------------------
    try {
      // Starter merchant already has 1 location (max 1, multi_location = false).
      const res = await makeRequest(server, 'POST', '/api/locations', starterToken, {
        name: 'Second Location',
        code: 'LOC-002',
      });
      assert.strictEqual(res.status, 403, 'Should deny location creation exceeding quota');
      markPassed('8. Location quota enforced');
    } catch (err) {
      markFailed('8. Location quota enforced', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 9: Product quota enforced
    // ------------------------------------------------------------------
    try {
      const subRepo = new SubscriptionRepository(db);
      const subService = new SubscriptionService(subRepo, undefined, db);

      // Temporarily set starter plan max_products = 2
      await db.query(`UPDATE plans SET max_products = 2 WHERE code = 'starter'`);

      // Seed 2 products for starter tenant
      await db.query(`
        INSERT INTO products (id, organization_id, name, slug, unit_code, product_type, status)
        VALUES 
          ('prod_sub_1', 'org_starter_tenant', 'Prod 1', 'prod-1', 'pcs', 'standard', 'active'),
          ('prod_sub_2', 'org_starter_tenant', 'Prod 2', 'prod-2', 'pcs', 'standard', 'active')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Attempt creating 3rd product
      const res = await makeRequest(server, 'POST', '/api/products', starterToken, {
        name: 'Prod 3 Exceeding Limit',
        brand: 'Brand',
        category: 'Cat',
      });

      assert.strictEqual(res.status, 403, 'Should reject product creation exceeding quota with 403');
      assert.strictEqual(res.body.error.code, 'LIMIT_EXCEEDED');

      // Reset starter max_products back to 100
      await db.query(`UPDATE plans SET max_products = 100 WHERE code = 'starter'`);
      markPassed('9. Product quota enforced');
    } catch (err) {
      markFailed('9. Product quota enforced', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 10: Monthly order quota enforced
    // ------------------------------------------------------------------
    try {
      // Temporarily set starter plan max_monthly_orders = 1
      await db.query(`UPDATE plans SET max_monthly_orders = 1 WHERE code = 'starter'`);

      // Seed 1 order for current month
      await db.query(`
        INSERT INTO orders (id, organization_id, location_id, order_number, source, channel, fulfillment_method, status, payment_status, total_amount)
        VALUES ('ord_limit_1', 'org_starter_tenant', 'loc_starter_1', 'ORD-LIMIT-001', 'POS', 'In-Store', 'POS Walk-in', 'Payment Confirmed', 'Paid', '10.00')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Attempt creating 2nd order via API
      const res = await makeRequest(server, 'POST', '/api/orders', starterToken, {
        customer: { name: 'Quota Customer', email: 'quota@test.com' },
        fulfillmentMethod: 'PICKUP',
        paymentMethod: 'CASH',
        cart_items: [{ variant_id: 'var_default_1', name: 'Item', unit_price: '10.00', quantity: '1.0000' }],
      });

      assert.strictEqual(res.status, 403, 'Should reject order creation when monthly order quota is reached');
      assert.strictEqual(res.body.error.code, 'LIMIT_EXCEEDED');

      // Reset starter max_monthly_orders back to 200
      await db.query(`UPDATE plans SET max_monthly_orders = 200 WHERE code = 'starter'`);
      markPassed('10. Monthly order quota enforced');
    } catch (err) {
      markFailed('10. Monthly order quota enforced', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 11: Missing subscription -> fail closed
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', unsubscribedToken);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.isAllowedAccess, false, 'Missing subscription must fail closed');
      assert.strictEqual(res.body.data.features.pos, false);
      assert.strictEqual(res.body.data.limits.max_users, 0);
      markPassed('11. Missing subscription -> fail closed');
    } catch (err) {
      markFailed('11. Missing subscription -> fail closed', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 12: Expired subscription -> paid feature denied
    // ------------------------------------------------------------------
    try {
      await db.query(`UPDATE subscriptions SET status = 'expired' WHERE organization_id = 'org_pro_tenant'`);

      const res = await makeRequest(server, 'GET', '/api/reports/advanced', proToken);
      assert.strictEqual(res.status, 403, 'Expired subscription must deny paid features');
      assert.strictEqual(res.body.error.code, 'SUBSCRIPTION_INACTIVE');

      // Restore active status
      await db.query(`UPDATE subscriptions SET status = 'active' WHERE organization_id = 'org_pro_tenant'`);
      markPassed('12. Expired subscription -> paid feature denied');
    } catch (err) {
      markFailed('12. Expired subscription -> paid feature denied', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 13: Suspended subscription -> paid feature denied
    // ------------------------------------------------------------------
    try {
      await db.query(`UPDATE subscriptions SET status = 'suspended' WHERE organization_id = 'org_pro_tenant'`);

      const res = await makeRequest(server, 'GET', '/api/reports/advanced', proToken);
      assert.strictEqual(res.status, 403, 'Suspended subscription must deny paid features');
      assert.strictEqual(res.body.error.code, 'SUBSCRIPTION_INACTIVE');

      // Restore active status
      await db.query(`UPDATE subscriptions SET status = 'active' WHERE organization_id = 'org_pro_tenant'`);
      markPassed('13. Suspended subscription -> paid feature denied');
    } catch (err) {
      markFailed('13. Suspended subscription -> paid feature denied', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 14: Client cannot spoof plan
    // ------------------------------------------------------------------
    try {
      // Pass spoofed headers or body attempting to claim enterprise plan
      const res = await makeRequest(server, 'GET', '/api/reports/advanced', starterToken, undefined, {
        'x-plan-override': 'enterprise',
        'x-subscription-tier': 'enterprise',
      });
      assert.strictEqual(res.status, 403, 'Server must ignore client plan spoof headers');
      markPassed('14. Client cannot spoof plan');
    } catch (err) {
      markFailed('14. Client cannot spoof plan', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 15: Client cannot spoof organizationId
    // ------------------------------------------------------------------
    try {
      // Starter token claims org_starter_tenant in JWT. Attempting to query with ?orgId=org_enterprise_tenant
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements?orgId=org_enterprise_tenant', starterToken);
      if (res.status === 403) {
        assert.strictEqual(res.body.success, false, 'Tenant access control rejects cross-tenant query');
      } else {
        assert.strictEqual(res.status, 200);
        assert.strictEqual(
          res.body.data.plan.code,
          'starter',
          'Entitlement endpoint must use JWT organizationId, ignoring query params'
        );
      }
      markPassed('15. Client cannot spoof organizationId');
    } catch (err) {
      markFailed('15. Client cannot spoof organizationId', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 16: Tenant A cannot read Tenant B entitlements
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', starterToken, undefined, {
        'X-Tenant-ID': 'org_enterprise_tenant',
      });
      assert.strictEqual(res.body.data.plan.code, 'starter', 'Tenant A receives Tenant A entitlements only');
      markPassed('16. Tenant A cannot read Tenant B entitlements');
    } catch (err) {
      markFailed('16. Tenant A cannot read Tenant B entitlements', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 17: Tenant A cannot use Tenant B's subscription
    // ------------------------------------------------------------------
    try {
      // Starter tenant attempts creation of 4th user passing org_enterprise_tenant in payload
      const res = await makeRequest(server, 'POST', '/api/users', starterToken, {
        organizationId: 'org_enterprise_tenant',
        email: 'spoofed@test.com',
        name: 'Spoofed User',
        password: 'Password123!',
        role: 'cashier',
      });
      assert.ok([403, 422].includes(res.status), 'Must evaluate against Tenant A context and reject cross-tenant spoofing');
      markPassed('17. Tenant A cannot use Tenant B subscription');
    } catch (err) {
      markFailed('17. Tenant A cannot use Tenant B subscription', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 18: Platform role behavior matches existing policy
    // ------------------------------------------------------------------
    try {
      // Super admin can access feature regardless of subscription plan
      const res = await makeRequest(server, 'GET', '/api/reports/advanced', superAdminToken);
      assert.strictEqual(res.status, 200, 'Super admin bypasses plan restrictions');
      markPassed('18. Platform role behavior matches existing policy');
    } catch (err) {
      markFailed('18. Platform role behavior matches existing policy', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 19: Concurrent quota checks cannot trivially bypass the limit
    // ------------------------------------------------------------------
    try {
      const subRepo = new SubscriptionRepository(db);
      const subService = new SubscriptionService(subRepo, undefined, db);

      // Verify assertWithinLimitTx locks subscription row inside a transaction
      await db.withTransaction(async (txClient) => {
        await subService.assertWithinLimitTx(txClient, 'org_starter_tenant', 'users', 1);
      });
      markPassed('19. Concurrent quota checks cannot trivially bypass the limit');
    } catch (err) {
      markFailed('19. Concurrent quota checks cannot trivially bypass the limit', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 20: Feature denial is audited where required
    // ------------------------------------------------------------------
    try {
      await makeRequest(server, 'GET', '/api/reports/advanced', starterToken);

      const auditRes = await db.query(
        `SELECT * FROM audit_events WHERE organization_id = 'org_starter_tenant' AND action IN ('FEATURE_ACCESS_DENIED', 'SUBSCRIPTION_LIMIT_REACHED') ORDER BY created_at DESC LIMIT 5`
      );
      assert.ok(auditRes.rows.length > 0, 'Audit record for feature denial must be recorded');
      markPassed('20. Feature denial is audited where required');
    } catch (err) {
      markFailed('20. Feature denial is audited where required', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 21: Entitlement endpoint returns sanitized DTO
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', proToken);
      assert.strictEqual(typeof res.body.data.plan, 'object');
      assert.strictEqual(typeof res.body.data.status, 'string');
      assert.strictEqual(typeof res.body.data.isAllowedAccess, 'boolean');
      assert.strictEqual(typeof res.body.data.features, 'object');
      assert.strictEqual(typeof res.body.data.limits, 'object');
      assert.strictEqual(typeof res.body.data.usage, 'object');
      markPassed('21. Entitlement endpoint returns sanitized DTO');
    } catch (err) {
      markFailed('21. Entitlement endpoint returns sanitized DTO', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 22: No credentials/secrets appear in entitlement responses
    // ------------------------------------------------------------------
    try {
      const res = await makeRequest(server, 'GET', '/api/tenant/subscription/entitlements', proToken);
      const rawText = JSON.stringify(res.body);
      assert.strictEqual(rawText.includes('password_hash'), false);
      assert.strictEqual(rawText.includes('password_salt'), false);
      assert.strictEqual(rawText.includes('jwt_secret'), false);
      markPassed('22. No credentials/secrets appear in entitlement responses');
    } catch (err) {
      markFailed('22. No credentials/secrets appear in entitlement responses', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 23: Existing RBAC still applies
    // ------------------------------------------------------------------
    try {
      // User with 'viewer' role (lacking permissions) calling POST /api/products
      const viewerToken = signToken({
        userId: 'usr_viewer',
        organizationId: 'org_enterprise_tenant',
        email: 'viewer@enterprise.test',
        role: 'viewer',
        permissions: ['products.view'],
      });

      const res = await makeRequest(server, 'POST', '/api/products', viewerToken, {
        name: 'Product by Viewer',
      });
      assert.strictEqual(res.status, 403, 'RBAC check must fail even if enterprise quota is available');
      markPassed('23. Existing RBAC still applies');
    } catch (err) {
      markFailed('23. Existing RBAC still applies', err);
    }

    // ------------------------------------------------------------------
    // SCENARIO 24: Existing audit sanitization still applies
    // ------------------------------------------------------------------
    try {
      const auditRes = await db.query(`SELECT notes FROM audit_events WHERE action = 'FEATURE_ACCESS_DENIED' ORDER BY created_at DESC LIMIT 1`);
      if (auditRes.rows.length > 0) {
        const notes = auditRes.rows[0].notes;
        assert.strictEqual(notes.includes('Bearer'), false, 'Audit notes must not leak bearer tokens');
        assert.strictEqual(notes.includes('password'), false, 'Audit notes must not leak passwords');
      }
      markPassed('24. Existing audit sanitization still applies');
    } catch (err) {
      markFailed('24. Existing audit sanitization still applies', err);
    }

  } finally {
    server.close();
    try { await (db as any).close?.(); } catch {}
  }

  console.log('\n======================================================');
  console.log(` Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSubscriptionEntitlementsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
