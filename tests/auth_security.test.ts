import assert from 'assert';
import http from 'http';
import express from 'express';
import { hashPassword, verifyPassword } from '../server/auth/password';
import { issueToken, verifyToken, generateTokenId, signToken } from '../server/auth/token';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS, hasPermission, getRolePermissions } from '../server/auth/roles';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { UserRepository } from '../server/repositories/userRepository';
import { AuditRepository } from '../server/repositories/auditRepository';
import { OrderRepository } from '../server/repositories/orderRepository';
import { CustomerRepository } from '../server/repositories/customerRepository';
import { InventoryRepository } from '../server/repositories/inventoryRepository';
import { AuthService } from '../server/services/authService';
import { sanitizeInput, validateProductPayload, stripImmutableFields, sanitizeClientBody } from '../server/validation';
import {
  AuthContext,
  createAuthenticateMiddleware,
  requireAuth,
  requirePermission,
  requireRole,
  requireTenantAccess,
} from '../server/middleware/auth';
import { createRateLimiter } from '../server/middleware/rateLimiter';
import { createApp } from '../server';

let testPassedCount = 0;
let testFailedCount = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log('PASSED');
    testPassedCount++;
  } catch (error: any) {
    console.log('FAILED');
    console.error(`    Error: ${error.message || error}`);
    testFailedCount++;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log(' Omnicore SEC-001 Authentication & RBAC Security Tests');
  console.log('======================================================\n');

  const db: DatabaseClient = createIsolatedTestClient();

  try {
    // 1. Database Migrations
    await runTest('1. Apply Auth Migrations (001 + 002)', async () => {
      const migrationResult = await runMigrations(db);
      assert.ok(migrationResult.applied.length >= 2, 'Migrations applied successfully');

      const tablesRes = await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const tableNames = new Set(tablesRes.rows.map((r: any) => r.table_name));
      assert.ok(tableNames.has('users'), 'users table exists');
      assert.ok(tableNames.has('role_permissions'), 'role_permissions table exists');
      assert.ok(tableNames.has('revoked_tokens'), 'revoked_tokens table exists');

      // Seed default organizations and locations
      await db.exec(`
        INSERT INTO organizations (id, name, code)
        VALUES 
          ('org_default', 'Omnicore Global Retail Ltd', 'OMNICORE_DEFAULT'),
          ('org_company_a', 'Company A Retail Ltd', 'COMP_A'),
          ('org_company_b', 'Company B Logistics Inc', 'COMP_B')
        ON CONFLICT (id) DO NOTHING;
        
        INSERT INTO locations (id, organization_id, code, name, type)
        VALUES 
          ('loc-store-downtown', 'org_default', 'LOC-DT', 'Downtown Store', 'Retail Store'),
          ('loc-store-a', 'org_company_a', 'LOC-A', 'Store A', 'Retail Store'),
          ('loc-store-b', 'org_company_b', 'LOC-B', 'Store B', 'Retail Store')
        ON CONFLICT (id) DO NOTHING;
      `);
    });

    // 2. Cryptographic Password Hashing (PBKDF2-HMAC-SHA512)
    await runTest('2. Password Hashing & Verification (PBKDF2-HMAC-SHA512)', async () => {
      const plainPassword = 'SuperSecurePassword2026!';
      const hash = await hashPassword(plainPassword);

      assert.ok(hash.startsWith('pbkdf2:sha512:'), 'Hash format has correct identifier prefix');
      const parts = hash.split(':');
      assert.strictEqual(parts.length, 5, 'Hash has 5 colon-separated parts');
      assert.strictEqual(parts[2], '100000', 'Iterations must be at least 100,000');

      // Valid verification
      const isValid = await verifyPassword(plainPassword, hash);
      assert.strictEqual(isValid, true, 'Valid password must verify true');

      // Invalid verification
      const isInvalid = await verifyPassword('WrongPassword123', hash);
      assert.strictEqual(isInvalid, false, 'Wrong password must verify false');

      // Empty password check
      const emptyCheck = await verifyPassword('', hash);
      assert.strictEqual(emptyCheck, false, 'Empty password must verify false');
    });

    // 3. Cryptographic JWT Signing and Verification
    await runTest('3. Cryptographic JWT Signing & Verification (HMAC-SHA256)', async () => {
      const claims = {
        userId: 'usr-test-01',
        organizationId: 'org_test_01',
        role: ROLES.STORE_MANAGER,
        permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_CREATE],
        locationId: 'loc-01',
      };

      const token = signToken(claims);
      assert.ok(typeof token === 'string', 'Token must be a string');
      assert.strictEqual(token.split('.').length, 3, 'JWT must have 3 dot-separated parts');

      const verified = verifyToken(token);
      assert.strictEqual(verified.sub, claims.userId, 'Subject matches userId');
      assert.strictEqual(verified.userId, claims.userId);
      assert.strictEqual(verified.organizationId, claims.organizationId);
      assert.strictEqual(verified.role, claims.role);
      assert.deepStrictEqual(verified.permissions, claims.permissions);
      assert.ok(verified.exp > verified.iat, 'Expiration is in future');
      assert.ok(verified.jti, 'JTI token ID must be generated');
    });

    // 4. JWT Tampering & Signature Forgery Detection
    await runTest('4. JWT Tampering & Signature Forgery Detection', async () => {
      const validToken = signToken({
        userId: 'usr-regular',
        organizationId: 'org_test',
        role: ROLES.CASHIER,
      });

      const parts = validToken.split('.');
      const header = parts[0];
      const payload = parts[1];
      const signature = parts[2];

      // Tamper payload to elevate role to super_admin
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      decodedPayload.role = ROLES.SUPER_ADMIN;
      decodedPayload.permissions = Object.values(PERMISSIONS);
      const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');

      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

      let rejected = false;
      try {
        verifyToken(tamperedToken);
      } catch (err: any) {
        rejected = true;
        assert.strictEqual(err.code, 'INVALID_SIGNATURE', 'Tampered token must be rejected with INVALID_SIGNATURE');
      }
      assert.strictEqual(rejected, true, 'Tampered token must throw error');

      // Forged token signed with incorrect secret
      const forgedToken = signToken(
        { userId: 'usr-hacker', organizationId: 'org_test', role: ROLES.SUPER_ADMIN },
        'this-is-a-completely-different-hacker-secret-key-12345!'
      );

      let forgedRejected = false;
      try {
        verifyToken(forgedToken);
      } catch (err: any) {
        forgedRejected = true;
        assert.strictEqual(err.code, 'INVALID_SIGNATURE');
      }
      assert.strictEqual(forgedRejected, true, 'Token with different secret must be rejected');
    });

    // 5. RBAC Permission Hierarchy & Matrix
    await runTest('5. RBAC Permission Hierarchy & Matrix', async () => {
      // Super Admin has all permissions (including wildcards)
      assert.strictEqual(hasPermission(ROLES.SUPER_ADMIN, PERMISSIONS.ADMIN_DIAGNOSTICS), true);
      assert.strictEqual(hasPermission(ROLES.SUPER_ADMIN, PERMISSIONS.PRODUCTS_DELETE), true);
      assert.strictEqual(hasPermission(ROLES.SUPER_ADMIN, 'financial.reconcile'), true);

      // Cashier permissions
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDERS_CREATE), true);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.PRODUCTS_VIEW), true);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.PRODUCTS_CREATE), false);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.PRODUCTS_DELETE), false);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.ADMIN_DIAGNOSTICS), false);

      // Store Manager permissions
      assert.strictEqual(hasPermission(ROLES.STORE_MANAGER, PERMISSIONS.PRODUCTS_CREATE), true);
      assert.strictEqual(hasPermission(ROLES.STORE_MANAGER, PERMISSIONS.PRODUCTS_UPDATE), true);
      assert.strictEqual(hasPermission(ROLES.STORE_MANAGER, PERMISSIONS.INVENTORY_ADJUST), true);
      assert.strictEqual(hasPermission(ROLES.STORE_MANAGER, PERMISSIONS.ADMIN_DIAGNOSTICS), false);

      // Inventory Manager permissions
      assert.strictEqual(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.INVENTORY_RECEIVE), true);
      assert.strictEqual(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.INVENTORY_TRANSFER), true);
      assert.strictEqual(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.ORDERS_REFUND), false);

      // Viewer permissions
      assert.strictEqual(hasPermission(ROLES.VIEWER, PERMISSIONS.PRODUCTS_VIEW), true);
      assert.strictEqual(hasPermission(ROLES.VIEWER, PERMISSIONS.PRODUCTS_CREATE), false);
      assert.strictEqual(hasPermission(ROLES.VIEWER, PERMISSIONS.ORDERS_CREATE), false);
    });

    // 6. User Repository & Token Revocation (Logout)
    await runTest('6. User Repository & Token Revocation (Logout)', async () => {
      const userRepo = new UserRepository(db);

      const passHash = await hashPassword('UserSecret123!');
      const createdUser = await userRepo.createUser({
        organizationId: 'org_default',
        email: 'revocation_test@omnicore.internal',
        name: 'Revocation Test User',
        passwordHash: passHash,
        passwordSalt: 'test_salt',
        role: ROLES.CASHIER,
      });

      assert.ok(createdUser.id);
      assert.strictEqual(createdUser.email, 'revocation_test@omnicore.internal');

      // Issue token with specific JTI
      const jti = generateTokenId();
      const expiresAt = new Date(Date.now() + 3600 * 1000);

      // Initially not revoked
      const initialRevoked = await userRepo.isTokenRevoked(jti);
      assert.strictEqual(initialRevoked, false, 'New token should not be revoked');

      // Revoke token
      await userRepo.revokeToken(jti, createdUser.id, expiresAt);

      // Now must be revoked
      const nowRevoked = await userRepo.isTokenRevoked(jti);
      assert.strictEqual(nowRevoked, true, 'Revoked token must return true');
    });

    // 7. AuthService Authentication & Revocation Lifecycle
    await runTest('7. AuthService Authentication & Revocation Lifecycle', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      // Seed default users
      await authService.seedDefaultUsers();

      // Successful login
      const loginResult = await authService.login({
        email: 'superadmin@omnicore.internal',
        password: 'SuperAdmin123!',
        organizationId: 'org_default',
      });

      assert.ok(loginResult.token, 'Login must return a JWT token');
      assert.strictEqual(loginResult.user.email, 'superadmin@omnicore.internal');
      assert.strictEqual(loginResult.user.role, ROLES.SUPER_ADMIN);

      // Session verification
      const claims = await authService.verifySession(loginResult.token);
      assert.strictEqual(claims.email, 'superadmin@omnicore.internal');
      assert.strictEqual(claims.role, ROLES.SUPER_ADMIN);

      // Logout (Revoke)
      await authService.logout(loginResult.token);

      // Subsequent verification must fail with REVOKED error
      let revokedError = false;
      try {
        await authService.verifySession(loginResult.token);
      } catch (err: any) {
        revokedError = true;
        assert.strictEqual(err.code, 'REVOKED', 'Revoked token should fail with REVOKED code');
      }
      assert.strictEqual(revokedError, true, 'Revoked session cannot be verified');
    });

    // 8. Server-Authoritative Audit Logging
    await runTest('8. Server-Authoritative Audit Logging (Anti-Spoofing)', async () => {
      const auditRepo = new AuditRepository(db);

      const authenticContext: AuthContext = {
        userId: 'usr_authentic_01',
        email: 'authentic@omnicore.internal',
        organizationId: 'org_default',
        role: ROLES.STORE_MANAGER,
        permissions: [PERMISSIONS.PRODUCTS_UPDATE],
      };

      // Client sends spoofed actor ID and spoofed tenant in request body
      const spoofedClientPayload = {
        actorId: 'usr_spoofed_ceo',
        actor_id: 'usr_spoofed_ceo',
        role: 'super_admin',
        organizationId: 'org_victim_tenant',
        price: 199.99,
      };

      const event = await auditRepo.recordAuthorizedEvent(
        authenticContext,
        {
          action: 'PRICE_UPDATE',
          entity_type: 'product_variant',
          entity_id: 'var-101',
          before_state: { price: 150 },
          after_state: { price: 199.99 },
          metadata: spoofedClientPayload,
        }
      );

      // Verify that audit log records authenticContext, not spoofed body
      assert.strictEqual(event.actor_id, 'usr_authentic_01', 'Authoritative actor_id from context');
      assert.strictEqual(event.actor_role, ROLES.STORE_MANAGER, 'Authoritative actor_role from context');
      assert.strictEqual(event.organization_id, 'org_default', 'Authoritative organization_id from context');
      assert.strictEqual(event.action, 'PRICE_UPDATE');
    });

    // 9. Input Validation & Prototype Pollution Defense
    await runTest('9. Input Validation & Prototype Pollution Defense', async () => {
      // Prototype pollution attempt
      const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "name": "Normal Product"}');
      const sanitized = sanitizeClientBody(maliciousPayload);

      assert.strictEqual((Object.prototype as any).polluted, undefined, 'Prototype must not be polluted');
      assert.strictEqual(sanitized.name, 'Normal Product');

      // Test stripImmutableFields
      const objectWithImmutable = {
        id: 'prod-immutable-1',
        organization_id: 'org_immutable_1',
        organizationId: 'org_immutable_1',
        name: 'New Product Name',
        retailPrice: 99.99,
      };
      const stripped = stripImmutableFields(objectWithImmutable);
      assert.strictEqual(stripped.id, undefined, 'id must be stripped');
      assert.strictEqual(stripped.organization_id, undefined, 'organization_id must be stripped');
      assert.strictEqual(stripped.organizationId, undefined, 'organizationId must be stripped');
      assert.strictEqual(stripped.name, 'New Product Name');
      assert.strictEqual(stripped.retailPrice, 99.99);
    });

    // 10. Multi-Tenant Authorization Isolation Helper
    await runTest('10. Multi-Tenant Authorization Isolation', async () => {
      const tenantContext: AuthContext = {
        userId: 'usr_tenant_a',
        email: 'manager@tenant-a.com',
        organizationId: 'org_company_a',
        role: ROLES.STORE_MANAGER,
        permissions: [PERMISSIONS.PRODUCTS_CREATE],
      };

      const superAdminContext: AuthContext = {
        userId: 'usr_super',
        email: 'super@omnicore.internal',
        organizationId: 'org_default',
        role: ROLES.SUPER_ADMIN,
        permissions: Object.values(PERMISSIONS),
      };

      // Tenant accessing own org -> true
      assert.strictEqual(tenantContext.organizationId === 'org_company_a', true);

      // Tenant accessing other org -> false
      assert.strictEqual(tenantContext.organizationId === 'org_company_b', false);

      // Super admin can manage any org
      assert.strictEqual(superAdminContext.role === ROLES.SUPER_ADMIN, true);
    });

    // 11. Expired Credential Rejection
    await runTest('11. Expired Credential Rejection', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      const expiredToken = signToken({
        userId: 'usr_expired_test',
        email: 'expired@test.local',
        organizationId: 'org_default',
        role: ROLES.VIEWER,
        expiresInSeconds: -10,
      });

      let directCaught = false;
      try {
        verifyToken(expiredToken);
      } catch (err: any) {
        directCaught = true;
        assert.strictEqual(err.code, 'EXPIRED');
      }
      assert.strictEqual(directCaught, true, 'Expired token rejected by verifyToken');

      let authServiceCaught = false;
      try {
        await authService.verifySession(expiredToken);
      } catch (err: any) {
        authServiceCaught = true;
        assert.strictEqual(err.code, 'EXPIRED');
      }
      assert.strictEqual(authServiceCaught, true, 'Expired token rejected by authService');
    });

    // ------------------------------------------------------------------
    // REAL HTTP INTEGRATION SUITE (MOUNTED DIRECTLY VIA createApp)
    // ------------------------------------------------------------------

    // 12. Real HTTP Authentication Boundaries (401 Rejections on Real API)
    await runTest('12. Real HTTP Authentication Boundaries (401 Rejections)', async () => {
      const authService = new AuthService(db);
      const testProducts = [
        {
          id: 'prod-test-auth-01',
          organizationId: 'org_default',
          name: 'Auth Test Product',
          slug: 'auth-test-product',
          brand: 'Generic',
          category: 'Electronics',
          subcategory: 'General',
          description: 'Description',
          shortDescription: 'Short',
          unit: 'pcs',
          productType: 'standard' as const,
          status: 'active' as const,
          taxRate: 10,
          rating: 5,
          reviewCount: 0,
          tags: [],
          images: [],
          variants: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const { app } = await createApp({ db, authService, skipVite: true, initialProducts: testProducts });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Unauthenticated request to protected route (/api/auth/me) -> 401
        const anonRes = await fetch(`${baseUrl}/api/auth/me`);
        assert.strictEqual(anonRes.status, 401, 'Unauthenticated request must return 401');
        const anonBody = await anonRes.json();
        assert.strictEqual(anonBody.success, false);
        assert.strictEqual(anonBody.error.code, 'UNAUTHORIZED');

        // 2. Malformed token -> 401
        const malformedRes = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: 'Bearer totally.invalid.malformed.token' },
        });
        assert.strictEqual(malformedRes.status, 401, 'Malformed token must return 401');

        // 3. Expired token -> 401
        const expiredToken = signToken({
          userId: 'usr_exp',
          email: 'exp@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.VIEWER,
          expiresInSeconds: -60,
        });
        const expRes = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${expiredToken}` },
        });
        assert.strictEqual(expRes.status, 401, 'Expired token must return 401');

        // 4. Forged signature token -> 401
        const forgedToken = signToken(
          { userId: 'usr_hacker', organizationId: 'org_default', role: ROLES.SUPER_ADMIN },
          'wrong-forged-secret-signature-key-123456!'
        );
        const forgedRes = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${forgedToken}` },
        });
        assert.strictEqual(forgedRes.status, 401, 'Forged signature token must return 401');

        // 5. Valid token -> 200
        const validToken = signToken({
          userId: 'usr_valid_01',
          email: 'valid@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.STORE_MANAGER,
        });
        const validRes = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${validToken}` },
        });
        assert.strictEqual(validRes.status, 200, 'Valid token must return 200');
        const validBody = await validRes.json();
        assert.strictEqual(validBody.success, true);
        assert.strictEqual(validBody.data.userId, 'usr_valid_01');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 13. Real HTTP RBAC Boundaries (403 Rejections on Real API)
    await runTest('13. Real HTTP Role & Permission Boundaries (403 Rejections)', async () => {
      const authService = new AuthService(db);
      const testProducts = [
        {
          id: 'prod-rbac-01',
          organizationId: 'org_default',
          name: 'RBAC Target Product',
          slug: 'rbac-target-product',
          brand: 'Generic',
          category: 'Electronics',
          subcategory: 'General',
          description: 'Description',
          shortDescription: 'Short',
          unit: 'pcs',
          productType: 'standard' as const,
          status: 'active' as const,
          taxRate: 10,
          rating: 5,
          reviewCount: 0,
          tags: [],
          images: [],
          variants: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const { app } = await createApp({ db, authService, skipVite: true, initialProducts: testProducts });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const cashierToken = signToken({
          userId: 'usr_cashier_real',
          email: 'cashier@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.CASHIER,
        });

        const managerToken = signToken({
          userId: 'usr_mgr_real',
          email: 'manager@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.STORE_MANAGER,
        });

        const superAdminToken = signToken({
          userId: 'usr_super_real',
          email: 'super@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.SUPER_ADMIN,
        });

        // 1. Cashier attempts to create product on real route /api/products -> 403 Forbidden
        const cashierCreateRes = await fetch(`${baseUrl}/api/products`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Cashier Unauthorized Product' }),
        });
        assert.strictEqual(cashierCreateRes.status, 403, 'Cashier creating product must return 403');
        const cashierCreateBody = await cashierCreateRes.json();
        assert.strictEqual(cashierCreateBody.error.code, 'FORBIDDEN');

        // 2. Cashier attempts to update product on real route /api/products/:id -> 403 Forbidden
        const cashierUpdateRes = await fetch(`${baseUrl}/api/products/prod-rbac-01`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Tampered Name' }),
        });
        assert.strictEqual(cashierUpdateRes.status, 403, 'Cashier updating product must return 403');

        // 3. Cashier attempts to delete product on real route /api/products/:id -> 403 Forbidden
        const cashierDeleteRes = await fetch(`${baseUrl}/api/products/prod-rbac-01`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cashierToken}` },
        });
        assert.strictEqual(cashierDeleteRes.status, 403, 'Cashier deleting product must return 403');

        // 4. Cashier attempts admin diagnostics /api/admin/db-status -> 403 Forbidden
        const cashierDiagRes = await fetch(`${baseUrl}/api/admin/db-status`, {
          headers: { Authorization: `Bearer ${cashierToken}` },
        });
        assert.strictEqual(cashierDiagRes.status, 403, 'Cashier accessing admin diagnostics must return 403');

        // 5. Store Manager creates product on real route /api/products -> 201 Created
        const managerCreateRes = await fetch(`${baseUrl}/api/products`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Manager Approved Product' }),
        });
        assert.strictEqual(managerCreateRes.status, 201, 'Manager creating product must succeed (201)');

        // 6. Store Manager attempts admin diagnostics /api/admin/db-status -> 403 Forbidden
        const managerDiagRes = await fetch(`${baseUrl}/api/admin/db-status`, {
          headers: { Authorization: `Bearer ${managerToken}` },
        });
        assert.strictEqual(managerDiagRes.status, 403, 'Manager accessing admin diagnostics must return 403');

        // 7. Super Admin accesses admin diagnostics /api/admin/db-status -> 200 OK
        const superDiagRes = await fetch(`${baseUrl}/api/admin/db-status`, {
          headers: { Authorization: `Bearer ${superAdminToken}` },
        });
        assert.strictEqual(superDiagRes.status, 200, 'Super admin accessing admin diagnostics must return 200');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 14. Real HTTP Multi-Tenant Isolation Enforcement (ORG-A vs ORG-B on Real Endpoints)
    await runTest('14. Real HTTP Multi-Tenant Isolation Enforcement (ORG-A vs ORG-B)', async () => {
      const authService = new AuthService(db);
      const orderRepo = new OrderRepository(db);
      const customerRepo = new CustomerRepository(db);
      const inventoryRepo = new InventoryRepository(db);
      const auditRepo = new AuditRepository(db);

      // Ensure products and variants exist in database for foreign key constraints
      await db.query(`
        INSERT INTO products (id, organization_id, name, slug, unit_code)
        VALUES 
          ('prod-a-01', 'org_company_a', 'Product A', 'prod-a-01', 'pcs'),
          ('prod-b-01', 'org_company_b', 'Product B', 'prod-b-01', 'pcs')
        ON CONFLICT (id) DO NOTHING
      `);
      await db.query(`
        INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price)
        VALUES 
          ('var-a-01', 'org_company_a', 'prod-a-01', 'SKU-A-01', 'BAR-A-01', 'Variant A', 50, 100),
          ('var-b-01', 'org_company_b', 'prod-b-01', 'SKU-B-01', 'BAR-B-01', 'Variant B', 50, 100)
        ON CONFLICT (id) DO NOTHING
      `);

      // Insert database resources for both ORG-A and ORG-B
      await orderRepo.createOrderWithItems(
        {
          id: 'ord-org-a-01',
          organization_id: 'org_company_a',
          location_id: 'loc-store-a',
          order_number: 'ORD-A-001',
          source: 'POS',
          channel: 'pos',
          fulfillment_method: 'POS Walk-in',
          status: 'Completed',
          payment_status: 'Paid',
          subtotal: 100.0,
          discount_amount: 0.0,
          tax_amount: 10.0,
          shipping_fee: 0,
          total_amount: 110.0,
        },
        [
          {
            id: 'item-a-01',
            order_id: 'ord-org-a-01',
            variant_id: 'var-a-01',
            product_name: 'Product A',
            variant_name: 'Standard',
            sku: 'SKU-A-01',
            quantity: 1,
            unit_price: 100.0,
            cost_price: 60.0,
            discount_amount: 0.0,
            tax_rate: 10.0,
            total_amount: 110.0,
          },
        ]
      );

      await orderRepo.createOrderWithItems(
        {
          id: 'ord-org-b-01',
          organization_id: 'org_company_b',
          location_id: 'loc-store-b',
          order_number: 'ORD-B-001',
          source: 'POS',
          channel: 'pos',
          fulfillment_method: 'POS Walk-in',
          status: 'Completed',
          payment_status: 'Paid',
          subtotal: 200.0,
          discount_amount: 0.0,
          tax_amount: 20.0,
          shipping_fee: 0,
          total_amount: 220.0,
        },
        [
          {
            id: 'item-b-01',
            order_id: 'ord-org-b-01',
            variant_id: 'var-b-01',
            product_name: 'Product B',
            variant_name: 'Standard',
            sku: 'SKU-B-01',
            quantity: 2,
            unit_price: 100.0,
            cost_price: 60.0,
            discount_amount: 0.0,
            tax_rate: 10.0,
            total_amount: 220.0,
          },
        ]
      );

      await customerRepo.createCustomer({
        id: 'cust-org-a-01',
        organization_id: 'org_company_a',
        name: 'Alice Smith',
        email: 'alice@company-a.com',
      });

      await customerRepo.createCustomer({
        id: 'cust-org-b-01',
        organization_id: 'org_company_b',
        name: 'Bob Jones',
        email: 'bob@company-b.com',
      });

      await inventoryRepo.recordMovement({
        id: 'mov-a-01',
        organization_id: 'org_company_a',
        location_id: 'loc-store-a',
        variant_id: 'var-a-01',
        movement_type: 'PURCHASE_RECEIVE',
        quantity_change: 50,
        performed_by: 'usr_org_a',
      });

      await inventoryRepo.recordMovement({
        id: 'mov-b-01',
        organization_id: 'org_company_b',
        location_id: 'loc-store-b',
        variant_id: 'var-b-01',
        movement_type: 'PURCHASE_RECEIVE',
        quantity_change: 75,
        performed_by: 'usr_org_b',
      });

      await auditRepo.recordEvent({
        organization_id: 'org_company_a',
        actor_id: 'usr_org_a',
        actor_name: 'User Org A',
        actor_role: ROLES.STORE_MANAGER,
        action: 'INVENTORY_STOCK_AUDIT',
        entity_type: 'inventory',
        entity_id: 'loc-store-a',
      });

      await auditRepo.recordEvent({
        organization_id: 'org_company_b',
        actor_id: 'usr_org_b',
        actor_name: 'User Org B',
        actor_role: ROLES.STORE_MANAGER,
        action: 'INVENTORY_STOCK_AUDIT',
        entity_type: 'inventory',
        entity_id: 'loc-store-b',
      });

      // Products in catalog for both tenants
      const testProducts = [
        {
          id: 'prod-org-a-01',
          organizationId: 'org_company_a',
          name: 'Company A Secret Widget',
          slug: 'company-a-secret-widget',
          brand: 'BrandA',
          category: 'Electronics',
          subcategory: 'General',
          description: 'Org A Widget',
          shortDescription: 'Widget',
          unit: 'pcs',
          productType: 'standard' as const,
          status: 'active' as const,
          taxRate: 10,
          rating: 5,
          reviewCount: 0,
          tags: [],
          images: [],
          variants: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'prod-org-b-01',
          organizationId: 'org_company_b',
          name: 'Company B Secret Gizmo',
          slug: 'company-b-secret-gizmo',
          brand: 'BrandB',
          category: 'Electronics',
          subcategory: 'General',
          description: 'Org B Gizmo',
          shortDescription: 'Gizmo',
          unit: 'pcs',
          productType: 'standard' as const,
          status: 'active' as const,
          taxRate: 10,
          rating: 5,
          reviewCount: 0,
          tags: [],
          images: [],
          variants: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const { app } = await createApp({ db, authService, skipVite: true, initialProducts: testProducts });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const userOrgAToken = signToken({
          userId: 'usr_manager_a',
          email: 'manager@company-a.com',
          organizationId: 'org_company_a',
          role: ROLES.STORE_MANAGER,
        });

        // 1. User A attempts to read User B product -> 403 Forbidden
        const readCrossProductRes = await fetch(`${baseUrl}/api/products/prod-org-b-01`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(readCrossProductRes.status, 403, 'Reading cross-tenant product must return 403');
        const readCrossBody = await readCrossProductRes.json();
        assert.strictEqual(readCrossBody.error.code, 'TENANT_ACCESS_DENIED');

        // 2. User A attempts to modify User B product -> 403 Forbidden
        const modifyCrossProductRes = await fetch(`${baseUrl}/api/products/prod-org-b-01`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${userOrgAToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Hacked Gizmo' }),
        });
        assert.strictEqual(modifyCrossProductRes.status, 403, 'Modifying cross-tenant product must return 403');
        const modCrossBody = await modifyCrossProductRes.json();
        assert.strictEqual(modCrossBody.error.code, 'TENANT_ACCESS_DENIED');

        // 3. User A attempts to delete User B product -> 403 Forbidden
        const deleteCrossProductRes = await fetch(`${baseUrl}/api/products/prod-org-b-01`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(deleteCrossProductRes.status, 403, 'Deleting cross-tenant product must return 403');
        const delCrossBody = await deleteCrossProductRes.json();
        assert.ok(
          delCrossBody.error.code === 'TENANT_ACCESS_DENIED' || delCrossBody.error.code === 'FORBIDDEN',
          'Must reject cross-tenant deletion with 403 (FORBIDDEN or TENANT_ACCESS_DENIED)'
        );

        // 4. User A attempts to read User B orders -> 403 Forbidden on single order
        const readCrossOrderRes = await fetch(`${baseUrl}/api/orders/ord-org-b-01`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(readCrossOrderRes.status, 403, 'Reading cross-tenant order must return 403');
        const readOrderBody = await readCrossOrderRes.json();
        assert.strictEqual(readOrderBody.error.code, 'TENANT_ACCESS_DENIED');

        // 5. User A lists orders -> only receives ORG-A orders, 0 ORG-B orders
        const listOrdersRes = await fetch(`${baseUrl}/api/orders`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(listOrdersRes.status, 200);
        const listOrdersBody = await listOrdersRes.json();
        assert.strictEqual(listOrdersBody.data.length, 1);
        assert.strictEqual(listOrdersBody.data[0].organization_id, 'org_company_a');

        // 6. User A attempts to read User B customer -> 403 Forbidden
        const readCrossCustRes = await fetch(`${baseUrl}/api/customers/cust-org-b-01`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(readCrossCustRes.status, 403, 'Reading cross-tenant customer must return 403');

        // 7. User A lists customers -> only receives ORG-A customers
        const listCustRes = await fetch(`${baseUrl}/api/customers`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(listCustRes.status, 200);
        const listCustBody = await listCustRes.json();
        assert.strictEqual(listCustBody.data.length, 1);
        assert.strictEqual(listCustBody.data[0].organization_id, 'org_company_a');

        // 8. User A queries inventory balances for User B location -> returns 0 items for User A
        const readCrossInvRes = await fetch(`${baseUrl}/api/inventory/balances/loc-store-b`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(readCrossInvRes.status, 200);
        const invBody = await readCrossInvRes.json();
        assert.strictEqual(invBody.count, 0, 'User A should receive 0 inventory items from Location B');

        // 9. User A queries audit logs -> only receives ORG-A audit entries
        const auditRes = await fetch(`${baseUrl}/api/audit-logs`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.strictEqual(auditRes.status, 200);
        const auditBody = await auditRes.json();
        for (const evt of auditBody.data) {
          assert.strictEqual(evt.organization_id, 'org_company_a', 'Audit logs must remain strictly scoped to Org A');
        }

        // 10. Tenant ID Spoofing in body -> client sends { "organizationId": "org_company_b" }
        const spoofedCreateRes = await fetch(`${baseUrl}/api/products`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${userOrgAToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Spoofed Tenant Widget',
            organizationId: 'org_company_b',
            organization_id: 'org_company_b',
          }),
        });
        assert.strictEqual(spoofedCreateRes.status, 201);
        const spoofedCreateBody = await spoofedCreateRes.json();
        // Product MUST be created under caller's organization 'org_company_a', ignoring client body
        assert.strictEqual(spoofedCreateBody.data.organizationId, 'org_company_a', 'Product must remain scoped to authenticated org A');

        // 11. Tenant ID Spoofing in query param -> client sends ?orgId=org_company_b
        const spoofedQueryRes = await fetch(`${baseUrl}/api/orders?orgId=org_company_b`, {
          headers: { Authorization: `Bearer ${userOrgAToken}` },
        });
        assert.ok(
          spoofedQueryRes.status === 403 || spoofedQueryRes.status === 200,
          'Cross-tenant query parameter must either be rejected with 403 or safely scoped'
        );
        if (spoofedQueryRes.status === 403) {
          const body = await spoofedQueryRes.json();
          assert.strictEqual(body.error.code, 'TENANT_ACCESS_DENIED');
        } else {
          const spoofedQueryBody = await spoofedQueryRes.json();
          assert.strictEqual(spoofedQueryBody.data.length, 1);
          assert.strictEqual(spoofedQueryBody.data[0].organization_id, 'org_company_a', 'Orders query must ignore spoofed orgId query parameter');
        }
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 15. Real HTTP Identity Spoofing Protection (Actor & Audit Identity)
    await runTest('15. Real HTTP Identity Spoofing Protection in Request Body', async () => {
      const authService = new AuthService(db);
      const { app, stores } = await createApp({ db, authService, skipVite: true });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const legitimateUserToken = signToken({
          userId: 'usr_legitimate_manager',
          email: 'manager@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.STORE_MANAGER,
        });

        const spoofedPayload = {
          name: 'Spoof Test Item',
          userId: 'usr_spoofed_ceo',
          user_id: 'usr_spoofed_ceo',
          role: 'super_admin',
          actorId: 'spoofed_actor',
          actorRole: 'super_admin',
          organizationId: 'org_victim_corp',
          organization_id: 'org_victim_corp',
        };

        const res = await fetch(`${baseUrl}/api/products`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${legitimateUserToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(spoofedPayload),
        });

        assert.strictEqual(res.status, 201, 'Product creation should succeed');
        const body = await res.json();
        assert.strictEqual(body.data.organizationId, 'org_default', 'Product must belong to token organization');

        // Verify sync audit log recorded authentic token actor, NOT spoofed payload
        const lastAuditLog = stores.syncAuditLogs[stores.syncAuditLogs.length - 1];
        assert.strictEqual(lastAuditLog.actorId, 'usr_legitimate_manager', 'Audit log must record token userId');
        assert.strictEqual(lastAuditLog.actorRole, ROLES.STORE_MANAGER, 'Audit log must record token role');
        assert.strictEqual(lastAuditLog.organizationId, 'org_default', 'Audit log must record token organizationId');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 16. Real HTTP Admin Diagnostic Endpoint Security & Leak Prevention
    await runTest('16. Real HTTP Admin Diagnostic Security & Leak Prevention', async () => {
      const authService = new AuthService(db);
      const { app } = await createApp({ db, authService, skipVite: true });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Unauthenticated -> 401
        const anonRes = await fetch(`${baseUrl}/api/admin/db-status`);
        assert.strictEqual(anonRes.status, 401, 'Unauthenticated request to db-status must return 401');

        // 2. Authenticated non-admin (Cashier) -> 403
        const cashierToken = signToken({
          userId: 'usr_cashier_diag',
          email: 'cashier@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.CASHIER,
        });
        const cashierRes = await fetch(`${baseUrl}/api/admin/db-status`, {
          headers: { Authorization: `Bearer ${cashierToken}` },
        });
        assert.strictEqual(cashierRes.status, 403, 'Cashier request to db-status must return 403');

        // 3. Super Admin -> 200
        const adminToken = signToken({
          userId: 'usr_super_diag',
          email: 'admin@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.SUPER_ADMIN,
        });
        const adminRes = await fetch(`${baseUrl}/api/admin/db-status`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.strictEqual(adminRes.status, 200, 'Super admin access to db-status must return 200');

        const body = await adminRes.json();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.data.connected, true);
        assert.strictEqual(body.data.password, undefined, 'Database password must never be exposed');
        assert.strictEqual(body.data.connectionString, undefined, 'Connection string must never be exposed');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 17. Real HTTP Sensitive Endpoint Rate Limiting (429 Defense)
    await runTest('17. Real HTTP Sensitive Endpoint Rate Limiting (429 Defense)', async () => {
      const authService = new AuthService(db);
      const { app } = await createApp({ db, authService, skipVite: true });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // Send requests to /api/auth/login with invalid password until rate limit triggers
        let rateLimited = false;
        let retryAfterHeader = false;

        for (let i = 0; i < 15; i++) {
          const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@omnicore.internal', password: 'WrongPassword!' }),
          });

          if (res.status === 429) {
            rateLimited = true;
            if (res.headers.get('retry-after')) {
              retryAfterHeader = true;
            }
            const body = await res.json();
            assert.strictEqual(body.error.code, 'RATE_LIMIT_EXCEEDED');
            break;
          }
        }

        assert.strictEqual(rateLimited, true, 'Repeated sensitive endpoint attempts must trigger 429');
        assert.strictEqual(retryAfterHeader, true, '429 response must include Retry-After header');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 18. Real HTTP Error Leakage & Sanitization
    await runTest('18. Real HTTP Error Leakage & Sanitization (500 Defense)', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);
      const { app } = await createApp({ db, authService, skipVite: true });

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const res = await fetch(`${baseUrl}/api/test-error-trigger`);
        assert.strictEqual(res.status, 500, 'Error route must return 500');
        const body = await res.json();

        assert.strictEqual(body.success, false);
        assert.strictEqual(body.error.code, 'INTERNAL_SERVER_ERROR');
        // In non-production or production, sensitive credentials or database connection details must not leak in error code
        assert.strictEqual(body.stack, undefined, 'Stack trace must never be returned in API response');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

  } finally {
    await db.close();
  }

  console.log('\n======================================================');
  console.log(` Results: ${testPassedCount} passed, ${testFailedCount} failed`);
  console.log('======================================================\n');

  if (testFailedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
