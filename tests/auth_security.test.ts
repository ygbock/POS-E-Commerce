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

      // Seed default organization and location for FK references
      await db.exec(`
        INSERT INTO organizations (id, name, code)
        VALUES ('org_default', 'Omnicore Global Retail Ltd', 'OMNICORE_DEFAULT')
        ON CONFLICT (id) DO NOTHING;
        
        INSERT INTO locations (id, organization_id, code, name, type)
        VALUES ('loc-store-downtown', 'org_default', 'LOC-DT', 'Downtown Store', 'Retail Store')
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
        permissions: [PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_UPDATE],
        locationId: 'loc-branch-1',
      };

      const token = issueToken(claims, '1h');
      assert.ok(typeof token === 'string' && token.split('.').length === 3, 'JWT has 3 dot-separated segments');

      const verified = verifyToken(token);
      assert.ok(verified !== null, 'Token must verify successfully');
      assert.strictEqual(verified.sub, claims.userId);
      assert.strictEqual(verified.orgId, claims.organizationId);
      assert.strictEqual(verified.role, claims.role);
      assert.deepStrictEqual(verified.permissions, claims.permissions);
      assert.strictEqual(verified.locId, claims.locationId);
      assert.ok(typeof verified.jti === 'string', 'Token must contain jti nonce');
    });

    // 4. Token Tampering Detection
    await runTest('4. JWT Tampering & Signature Forgery Detection', async () => {
      const claims = {
        userId: 'usr-cashier-01',
        organizationId: 'org_test_01',
        role: ROLES.CASHIER,
        permissions: [PERMISSIONS.ORDERS_CREATE],
      };

      const token = issueToken(claims, '1h');
      const parts = token.split('.');

      // Attack: Modify payload to escalate role to Super Admin
      const originalPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      originalPayload.role = ROLES.SUPER_ADMIN;
      originalPayload.permissions = ['*'];
      const tamperedPayload = Buffer.from(JSON.stringify(originalPayload)).toString('base64url');
      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      // Must fail verification with INVALID_SIGNATURE error
      let tamperedCaught = false;
      try {
        verifyToken(forgedToken);
      } catch (err: any) {
        tamperedCaught = true;
        assert.strictEqual(err.code, 'INVALID_SIGNATURE');
      }
      assert.strictEqual(tamperedCaught, true, 'Tampered JWT payload must fail signature verification');

      // Invalid signature segment
      let badSigCaught = false;
      try {
        const badSigToken = `${parts[0]}.${parts[1]}.invalidSignatureHere`;
        verifyToken(badSigToken);
      } catch (err: any) {
        badSigCaught = true;
      }
      assert.strictEqual(badSigCaught, true, 'Invalid signature must fail verification');
    });

    // 5. RBAC & Permission Enforcement Matrix
    await runTest('5. RBAC Permission Hierarchy & Matrix', async () => {
      // Super Admin has all permissions
      assert.strictEqual(hasPermission(ROLES.SUPER_ADMIN, PERMISSIONS.PRODUCTS_CREATE), true);
      assert.strictEqual(hasPermission(ROLES.SUPER_ADMIN, PERMISSIONS.USERS_CREATE), true);
      assert.strictEqual(hasPermission(ROLES.SUPER_ADMIN, 'arbitrary:unknown:permission'), true);

      // Cashier permissions
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDERS_CREATE), true);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDERS_VIEW), true);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.PRODUCTS_DELETE), false, 'Cashier must NOT delete products');
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.USERS_CREATE), false, 'Cashier must NOT manage users');

      // Inventory Manager permissions
      assert.strictEqual(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.INVENTORY_VIEW), true);
      assert.strictEqual(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.INVENTORY_ADJUST), true);
      assert.strictEqual(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.ORDERS_CANCEL), false, 'Inventory Manager must NOT cancel orders');
    });

    // 6. User Repository & Token Revocation
    await runTest('6. User Repository & Token Revocation (Logout)', async () => {
      const userRepo = new UserRepository(db);

      // Seed user
      const passwordHash = await hashPassword('ManagerPass123!');
      const user = await userRepo.createUser({
        organizationId: 'org_default',
        email: 'manager.test@omnicore.internal',
        name: 'Test Manager',
        passwordHash,
        role: ROLES.STORE_MANAGER,
        locationId: 'loc-store-downtown',
      });

      assert.ok(user.id, 'User created with ID');
      assert.strictEqual(user.email, 'manager.test@omnicore.internal');

      // Token revocation test
      const jti = generateTokenId();
      const expiresAt = new Date(Date.now() + 3600 * 1000);

      const isRevokedBefore = await userRepo.isTokenRevoked(jti);
      assert.strictEqual(isRevokedBefore, false, 'Token is not revoked before logout');

      await userRepo.revokeToken(jti, user.id, expiresAt, 'USER_LOGOUT');

      const isRevokedAfter = await userRepo.isTokenRevoked(jti);
      assert.strictEqual(isRevokedAfter, true, 'Token is revoked after logout');
    });

    // 7. Full AuthService Flow (Seeding, Login, Verification, Revocation)
    await runTest('7. AuthService Authentication & Revocation Lifecycle', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      // Seed default platform accounts
      await authService.seedDefaultUsers();

      // Successful login as Super Admin
      const loginRes = await authService.login({
        email: 'superadmin@omnicore.internal',
        password: 'SuperAdmin123!',
        organizationId: 'org_default',
      });

      assert.strictEqual(loginRes.user.email, 'superadmin@omnicore.internal');
      assert.strictEqual(loginRes.user.role, ROLES.SUPER_ADMIN);
      assert.ok(loginRes.token, 'Token returned on login');

      // Verify session with token
      const session = await authService.verifySession(loginRes.token);
      assert.ok(session !== null, 'Session is valid');
      assert.strictEqual(session!.sub, loginRes.user.id);
      assert.strictEqual(session!.role, ROLES.SUPER_ADMIN);

      // Logout and revocation
      await authService.logout(loginRes.token);

      // Re-verifying revoked token must fail with REVOKED error
      let revokedCaught = false;
      try {
        await authService.verifySession(loginRes.token);
      } catch (err: any) {
        revokedCaught = true;
        assert.strictEqual(err.code, 'REVOKED');
      }
      assert.strictEqual(revokedCaught, true, 'Revoked token must be rejected with REVOKED error');

      // Bad credentials check
      let failed = false;
      try {
        await authService.login({
          email: 'superadmin@omnicore.internal',
          password: 'WrongPassword!',
        });
      } catch (err: any) {
        failed = true;
        assert.ok(err.message.includes('Invalid email or password'));
      }
      assert.strictEqual(failed, true, 'Bad password must throw authentication error');
    });

    // 8. Server-Authoritative Audit Logging
    await runTest('8. Server-Authoritative Audit Logging (Anti-Spoofing)', async () => {
      const auditRepo = new AuditRepository(db);

      const authContext: AuthContext = {
        userId: 'usr-authoritative-99',
        organizationId: 'org_default',
        role: ROLES.STORE_MANAGER,
        permissions: [PERMISSIONS.PRODUCTS_UPDATE],
        locationId: 'loc-store-downtown',
      };

      const auditEntry = await auditRepo.recordAuthorizedEvent(authContext, {
        action: 'UPDATE_PRODUCT',
        entityType: 'product',
        entityId: 'prod-laptop-01',
        details: { priceChange: { old: 100, new: 120 } },
        ipAddress: '127.0.0.1',
      });

      assert.strictEqual(auditEntry.actor_id, authContext.userId, 'Actor ID derived from server AuthContext');
      assert.strictEqual(auditEntry.actor_role, authContext.role, 'Actor Role derived from server AuthContext');
      assert.strictEqual(auditEntry.organization_id, authContext.organizationId, 'Org ID derived from server AuthContext');
      assert.strictEqual(auditEntry.action, 'UPDATE_PRODUCT');
    });

    // 9. Input Validation & Prototype Pollution Defense
    await runTest('9. Input Validation & Prototype Pollution Defense', async () => {
      // Prototype pollution attempt
      const maliciousPayload = {
        __proto__: { isAdmin: true },
        constructor: { prototype: { polluter: true } },
        name: 'Test Product <script>alert("xss")</script>',
        price: 150,
      };

      const sanitized = sanitizeInput(maliciousPayload);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, '__proto__'), false, '__proto__ was not attached as own property');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'constructor'), false, 'constructor was stripped as own property');
      assert.strictEqual((Object.prototype as any).polluter, undefined, 'Object prototype was not polluted');
      assert.strictEqual((sanitized as any).name, 'Test Product &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'XSS tags escaped');

      // Stripping client-provided immutable fields
      const clientWithSpoofedFields = {
        id: 'hacked-id-123',
        created_at: '1999-01-01',
        updated_at: '1999-01-01',
        name: 'Legit Product',
      };
      const stripped = stripImmutableFields(clientWithSpoofedFields);
      assert.strictEqual((stripped as any).id, undefined, 'Client spoofed ID stripped');
      assert.strictEqual((stripped as any).created_at, undefined, 'Client spoofed created_at stripped');
      assert.strictEqual((stripped as any).name, 'Legit Product', 'Legitimate field preserved');
    });

    // 10. Multi-Tenant Authorization Boundary
    await runTest('10. Multi-Tenant Authorization Isolation', async () => {
      const userTenantA: AuthContext = {
        userId: 'usr-tenant-a',
        organizationId: 'org_company_a',
        role: ROLES.STORE_MANAGER,
        permissions: [PERMISSIONS.PRODUCTS_VIEW],
      };

      const userTenantB: AuthContext = {
        userId: 'usr-tenant-b',
        organizationId: 'org_company_b',
        role: ROLES.STORE_MANAGER,
        permissions: [PERMISSIONS.PRODUCTS_VIEW],
      };

      const superAdminUser: AuthContext = {
        userId: 'usr-super',
        organizationId: 'org_system',
        role: ROLES.SUPER_ADMIN,
        permissions: ['*'],
      };

      // Tenant check simulation
      const canAccessTenant = (user: AuthContext, requestedOrgId: string): boolean => {
        if (user.role === ROLES.SUPER_ADMIN) return true;
        return user.organizationId === requestedOrgId;
      };

      assert.strictEqual(canAccessTenant(userTenantA, 'org_company_a'), true, 'User A can access Company A');
      assert.strictEqual(canAccessTenant(userTenantA, 'org_company_b'), false, 'User A CANNOT access Company B');
      assert.strictEqual(canAccessTenant(userTenantB, 'org_company_a'), false, 'User B CANNOT access Company A');
      assert.strictEqual(canAccessTenant(superAdminUser, 'org_company_a'), true, 'Super Admin can access Company A');
      assert.strictEqual(canAccessTenant(superAdminUser, 'org_company_b'), true, 'Super Admin can access Company B');
    });

    // 11. Expired Credential Rejection
    await runTest('11. Expired Credential Rejection', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      // Create an expired token (expired 10 seconds ago)
      const expiredToken = signToken({
        userId: 'usr_expired_test',
        email: 'expired@test.local',
        organizationId: 'org_default',
        role: ROLES.VIEWER,
        expiresInSeconds: -10,
      });

      // Direct verifyToken must throw with code 'EXPIRED'
      let directCaught = false;
      try {
        verifyToken(expiredToken);
      } catch (err: any) {
        directCaught = true;
        assert.strictEqual(err.code, 'EXPIRED', 'verifyToken throws EXPIRED error code');
      }
      assert.strictEqual(directCaught, true, 'Expired token rejected by verifyToken');

      // AuthService session check must also reject expired token
      let authServiceCaught = false;
      try {
        await authService.verifySession(expiredToken);
      } catch (err: any) {
        authServiceCaught = true;
        assert.strictEqual(err.code, 'EXPIRED', 'authService.verifySession throws EXPIRED error code');
      }
      assert.strictEqual(authServiceCaught, true, 'Expired token rejected by authService.verifySession');
    });

    // 12. HTTP Endpoint Authentication Boundary (401 Rejections)
    await runTest('12. HTTP Endpoint Authentication Boundaries (401 Rejections)', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      const app = express();
      app.use(express.json());
      app.use(createAuthenticateMiddleware(authService));

      app.get('/test/protected', requireAuth(), (req, res) => {
        res.json({ success: true, user: req.auth });
      });

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Anonymous request (no token) -> 401
        const anonRes = await fetch(`${baseUrl}/test/protected`);
        assert.strictEqual(anonRes.status, 401, 'Anonymous request must return 401');
        const anonBody = await anonRes.json();
        assert.strictEqual(anonBody.success, false);
        assert.strictEqual(anonBody.error.code, 'UNAUTHORIZED');

        // 2. Request with malformed/forged token -> 401
        const forgedRes = await fetch(`${baseUrl}/test/protected`, {
          headers: { Authorization: 'Bearer totally.invalid.forgedtoken' },
        });
        assert.strictEqual(forgedRes.status, 401, 'Forged token must return 401');

        // 3. Request with expired token -> 401
        const expiredToken = signToken({
          userId: 'usr_exp',
          email: 'exp@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.VIEWER,
          expiresInSeconds: -60,
        });
        const expRes = await fetch(`${baseUrl}/test/protected`, {
          headers: { Authorization: `Bearer ${expiredToken}` },
        });
        assert.strictEqual(expRes.status, 401, 'Expired token must return 401');

        // 4. Request with valid token -> 200
        const validToken = signToken({
          userId: 'usr_valid_01',
          email: 'valid@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.STORE_MANAGER,
        });
        const validRes = await fetch(`${baseUrl}/test/protected`, {
          headers: { Authorization: `Bearer ${validToken}` },
        });
        assert.strictEqual(validRes.status, 200, 'Valid token must return 200');
        const validBody = await validRes.json();
        assert.strictEqual(validBody.success, true);
        assert.strictEqual(validBody.user.userId, 'usr_valid_01');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 13. HTTP Role & Permission Boundaries (403 Rejections)
    await runTest('13. HTTP Role & Permission Boundaries (403 Rejections)', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      const app = express();
      app.use(express.json());
      app.use(createAuthenticateMiddleware(authService));

      // Route requiring products.create permission
      app.post('/test/products', requireAuth(), requirePermission(PERMISSIONS.PRODUCTS_CREATE), (req, res) => {
        res.json({ success: true, created: true });
      });

      // Route requiring super_admin role
      app.post('/test/admin-only', requireAuth(), requireRole(ROLES.SUPER_ADMIN), (req, res) => {
        res.json({ success: true, admin: true });
      });

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const cashierToken = signToken({
          userId: 'usr_cashier_01',
          email: 'cashier@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.CASHIER,
        });

        const managerToken = signToken({
          userId: 'usr_mgr_01',
          email: 'manager@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.STORE_MANAGER,
        });

        const superAdminToken = signToken({
          userId: 'usr_super_01',
          email: 'super@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.SUPER_ADMIN,
        });

        // Cashier attempts to create product -> 403 Forbidden
        const cashierRes = await fetch(`${baseUrl}/test/products`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Unauthorized Product' }),
        });
        assert.strictEqual(cashierRes.status, 403, 'Cashier creating product must return 403');
        const cashierBody = await cashierRes.json();
        assert.strictEqual(cashierBody.error.code, 'FORBIDDEN');

        // Manager attempts to create product -> 200 OK
        const managerRes = await fetch(`${baseUrl}/test/products`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Manager Product' }),
        });
        assert.strictEqual(managerRes.status, 200, 'Manager creating product must succeed (200)');

        // Manager attempts to access super_admin only route -> 403 Forbidden
        const mgrAdminRes = await fetch(`${baseUrl}/test/admin-only`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${managerToken}` },
        });
        assert.strictEqual(mgrAdminRes.status, 403, 'Manager accessing super_admin route must return 403');

        // Super Admin accesses super_admin only route -> 200 OK
        const superRes = await fetch(`${baseUrl}/test/admin-only`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${superAdminToken}` },
        });
        assert.strictEqual(superRes.status, 200, 'Super Admin must access admin route (200)');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 14. HTTP Multi-Tenant Isolation Enforcement
    await runTest('14. HTTP Multi-Tenant Isolation Enforcement', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      const app = express();
      app.use(express.json());
      app.use(createAuthenticateMiddleware(authService));

      app.post('/test/tenants/:orgId/data', requireAuth(), requireTenantAccess(), (req, res) => {
        res.json({ success: true, tenant: req.params.orgId });
      });

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const tenantAToken = signToken({
          userId: 'usr_org_a',
          email: 'admin@org-a.com',
          organizationId: 'org_company_a',
          role: ROLES.STORE_MANAGER,
        });

        const superAdminToken = signToken({
          userId: 'usr_super_admin',
          email: 'super@omnicore.internal',
          organizationId: 'org_default',
          role: ROLES.SUPER_ADMIN,
        });

        // 1. Tenant A modifying Tenant A -> Allowed (200)
        const sameOrgRes = await fetch(`${baseUrl}/test/tenants/org_company_a/data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tenantAToken}` },
        });
        assert.strictEqual(sameOrgRes.status, 200, 'Tenant accessing own organization must return 200');

        // 2. Tenant A modifying Tenant B -> Forbidden (403 TENANT_ACCESS_DENIED)
        const crossOrgRes = await fetch(`${baseUrl}/test/tenants/org_company_b/data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tenantAToken}` },
        });
        assert.strictEqual(crossOrgRes.status, 403, 'Cross-tenant mutation must return 403');
        const crossOrgBody = await crossOrgRes.json();
        assert.strictEqual(crossOrgBody.error.code, 'TENANT_ACCESS_DENIED');

        // 3. Super Admin modifying Tenant B -> Allowed (200)
        const superCrossRes = await fetch(`${baseUrl}/test/tenants/org_company_b/data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${superAdminToken}` },
        });
        assert.strictEqual(superCrossRes.status, 200, 'Super Admin cross-tenant access must return 200');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 15. Identity Spoofing Immunity in Request Body
    await runTest('15. Identity Spoofing Immunity in Request Body', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      let capturedAuditEntry: any = null;

      const app = express();
      app.use(express.json());
      app.use(createAuthenticateMiddleware(authService));

      app.post('/test/audit-action', requireAuth(), (req, res) => {
        // Sanitize client body to strip illegal fields
        const sanitized = sanitizeClientBody(req.body);

        // Server-authoritative audit logging
        capturedAuditEntry = {
          actorId: req.auth!.userId,
          actorRole: req.auth!.role,
          organizationId: req.auth!.organizationId,
          details: sanitized,
        };

        res.json({ success: true, audit: capturedAuditEntry });
      });

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const legitimateUserToken = signToken({
          userId: 'usr_legitimate_42',
          email: 'user42@omnicore.internal',
          organizationId: 'org_legit_corp',
          role: ROLES.CASHIER,
        });

        // Attacker attempts to spoof identity, role, and tenant inside request body
        const maliciousPayload = {
          userId: 'usr_spoofed_ceo',
          user_id: 'usr_spoofed_ceo',
          role: 'super_admin',
          roles: ['super_admin'],
          isAdmin: true,
          organizationId: 'org_victim_corp',
          organization_id: 'org_victim_corp',
          actorId: 'spoofed_actor',
          action: 'CONFIDENTIAL_STOCK_TRANSFER',
          amount: 50000,
        };

        const res = await fetch(`${baseUrl}/test/audit-action`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${legitimateUserToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(maliciousPayload),
        });

        assert.strictEqual(res.status, 200);

        // Verify that audit log recorded the authoritative JWT identity, NOT the spoofed payload
        assert.strictEqual(capturedAuditEntry.actorId, 'usr_legitimate_42', 'Audit actorId must be from token');
        assert.strictEqual(capturedAuditEntry.actorRole, ROLES.CASHIER, 'Audit actorRole must be from token');
        assert.strictEqual(capturedAuditEntry.organizationId, 'org_legit_corp', 'Audit org must be from token');

        // Verify that spoofed keys were stripped from the details
        assert.strictEqual(capturedAuditEntry.details.userId, undefined, 'Spoofed userId stripped');
        assert.strictEqual(capturedAuditEntry.details.role, undefined, 'Spoofed role stripped');
        assert.strictEqual(capturedAuditEntry.details.organizationId, undefined, 'Spoofed organizationId stripped');
        assert.strictEqual(capturedAuditEntry.details.amount, 50000, 'Legitimate business payload preserved');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 16. Admin Diagnostic Endpoint Security & Leak Prevention
    await runTest('16. Admin Diagnostic Endpoint Security & Leak Prevention', async () => {
      const userRepo = new UserRepository(db);
      const auditRepo = new AuditRepository(db);
      const authService = new AuthService(userRepo, auditRepo);

      const app = express();
      app.use(express.json());
      app.use(createAuthenticateMiddleware(authService));

      const fakeDbStatus = {
        connected: true,
        engine: 'pglite',
        version: '002_auth_security',
        migrationsApplied: 2,
        secretDatabasePassword: 'SuperSecretDbPasswordDoNotLeak!',
      };

      app.get(
        '/api/admin/db-status',
        requireAuth(),
        requirePermission(PERMISSIONS.ADMIN_DIAGNOSTICS),
        (req, res) => {
          // Strictly sanitize response: do not expose passwords, credentials, or connection strings
          res.json({
            success: true,
            data: {
              connected: fakeDbStatus.connected,
              engine: fakeDbStatus.engine,
              schemaVersion: fakeDbStatus.version,
              migrationsApplied: fakeDbStatus.migrationsApplied,
              caller: {
                userId: req.auth?.userId,
                role: req.auth?.role,
              },
            },
          });
        }
      );

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Anonymous -> 401
        const anonRes = await fetch(`${baseUrl}/api/admin/db-status`);
        assert.strictEqual(anonRes.status, 401, 'Anonymous access to admin db-status must return 401');

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
        assert.strictEqual(cashierRes.status, 403, 'Cashier access to admin db-status must return 403');

        // 3. Authorized Admin (Super Admin) -> 200
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
        assert.strictEqual(body.data.secretDatabasePassword, undefined, 'Secret database credentials must never leak');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // 17. Sensitive Endpoint Rate Limiting (429 Defense)
    await runTest('17. Sensitive Endpoint Rate Limiting (429 Defense)', async () => {
      const app = express();
      app.use(express.json());

      // Create a test rate limiter: max 3 requests per 1000ms
      const testLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 3,
        message: 'Rate limit exceeded in test',
      });

      app.post('/test/rate-limited', testLimiter, (req, res) => {
        res.json({ success: true });
      });

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // Send 3 requests (should all succeed)
        for (let i = 1; i <= 3; i++) {
          const res = await fetch(`${baseUrl}/test/rate-limited`, { method: 'POST' });
          assert.strictEqual(res.status, 200, `Request ${i} within quota must succeed`);
        }

        // 4th request must be rate-limited -> 429
        const blockedRes = await fetch(`${baseUrl}/test/rate-limited`, { method: 'POST' });
        assert.strictEqual(blockedRes.status, 429, 'Request exceeding rate limit must return 429');
        assert.ok(blockedRes.headers.get('retry-after'), '429 response must include Retry-After header');
        const blockedBody = await blockedRes.json();
        assert.strictEqual(blockedBody.error.code, 'RATE_LIMIT_EXCEEDED');
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
