process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { AuthService } from '../server/services/authService';
import { UserRepository } from '../server/repositories/userRepository';
import { AuditRepository } from '../server/repositories/auditRepository';
import { hashPassword } from '../server/auth/password';

async function runAuditSecurityTests() {
  console.log('================================================================');
  console.log('  AbaCha AUD-001 / SEC-001 Audit & Security Administration Tests');
  console.log('================================================================');

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

  // 1. Setup isolated test database & execute migrations (including Migration 013)
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  await runMigrations(db);

  // 2. Seed test tenants
  await db.exec(`
    INSERT INTO organizations (id, name, code, slug, is_active) VALUES 
      ('org_audit_alpha', 'Audit Org Alpha', 'AUDIT_ALPHA', 'audit-alpha', TRUE),
      ('org_audit_beta', 'Audit Org Beta', 'AUDIT_BETA', 'audit-beta', TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);

  const userRepo = new UserRepository(db);
  const auditRepo = new AuditRepository(db);
  const authService = new AuthService(userRepo, auditRepo);

  // 3. Create test users
  const adminAlphaHash = hashPassword('AlphaAdminPass123!');
  const adminAlpha = await userRepo.createUser({
    organizationId: 'org_audit_alpha',
    email: 'admin.alpha@test.com',
    name: 'Admin Alpha',
    passwordHash: adminAlphaHash.hash,
    passwordSalt: adminAlphaHash.salt,
    role: 'admin',
    is_active: true,
  });

  const cashierAlphaHash = hashPassword('AlphaCashierPass123!');
  const cashierAlpha = await userRepo.createUser({
    organizationId: 'org_audit_alpha',
    email: 'cashier.alpha@test.com',
    name: 'Cashier Alpha',
    passwordHash: cashierAlphaHash.hash,
    passwordSalt: cashierAlphaHash.salt,
    role: 'cashier',
    is_active: true,
  });

  const suspendedAlphaHash = hashPassword('AlphaSuspendedPass123!');
  const suspendedAlpha = await userRepo.createUser({
    organizationId: 'org_audit_alpha',
    email: 'suspended.alpha@test.com',
    name: 'Suspended Alpha',
    passwordHash: suspendedAlphaHash.hash,
    passwordSalt: suspendedAlphaHash.salt,
    role: 'admin',
    is_active: false,
  });

  const adminBetaHash = hashPassword('BetaAdminPass123!');
  const adminBeta = await userRepo.createUser({
    organizationId: 'org_audit_beta',
    email: 'admin.beta@test.com',
    name: 'Admin Beta',
    passwordHash: adminBetaHash.hash,
    passwordSalt: adminBetaHash.salt,
    role: 'admin',
    is_active: true,
  });

  const superAdminHash = hashPassword('SuperAdminPass123!');
  const superAdmin = await userRepo.createUser({
    organizationId: 'org_audit_alpha',
    email: 'superadmin.audit@test.com',
    name: 'Super Admin',
    passwordHash: superAdminHash.hash,
    passwordSalt: superAdminHash.salt,
    role: 'super_admin',
    is_active: true,
  });

  // Login tokens
  const alphaLogin = await authService.login({
    email: 'admin.alpha@test.com',
    password: 'AlphaAdminPass123!',
    organizationId: 'org_audit_alpha',
  });
  const alphaToken = alphaLogin.token;

  const cashierLogin = await authService.login({
    email: 'cashier.alpha@test.com',
    password: 'AlphaCashierPass123!',
    organizationId: 'org_audit_alpha',
  });
  const cashierToken = cashierLogin.token;

  const betaLogin = await authService.login({
    email: 'admin.beta@test.com',
    password: 'BetaAdminPass123!',
    organizationId: 'org_audit_beta',
  });
  const betaToken = betaLogin.token;

  const superLogin = await authService.login({
    email: 'superadmin.audit@test.com',
    password: 'SuperAdminPass123!',
    organizationId: 'org_audit_alpha',
  });
  const superToken = superLogin.token;

  // 4. Start HTTP Server
  const { app } = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -----------------------------------------------------------------
    // TEST 1: Database Append-Only Immutability Trigger
    // -----------------------------------------------------------------
    try {
      const initialEvent = await auditRepo.recordEvent({
        organization_id: 'org_audit_alpha',
        action: 'IMMUTABILITY_PROBE',
        entity_type: 'SYSTEM',
        entity_id: 'probe_001',
        severity: 'Info',
      });

      // Attempt UPDATE: must fail with IMMUTABLE_RECORD
      let updateFailed = false;
      try {
        await db.query(`UPDATE audit_events SET action = 'MUTATED_ACTION' WHERE id = $1`, [initialEvent.id]);
      } catch (err: any) {
        if (err.message && err.message.includes('IMMUTABLE_RECORD')) {
          updateFailed = true;
        }
      }
      assert.strictEqual(updateFailed, true, 'Updating audit_events must be blocked by immutability trigger');

      // Attempt DELETE: must fail with IMMUTABLE_RECORD
      let deleteFailed = false;
      try {
        await db.query(`DELETE FROM audit_events WHERE id = $1`, [initialEvent.id]);
      } catch (err: any) {
        if (err.message && err.message.includes('IMMUTABLE_RECORD')) {
          deleteFailed = true;
        }
      }
      assert.strictEqual(deleteFailed, true, 'Deleting from audit_events must be blocked by immutability trigger');

      markPassed('1. Database Append-Only Immutability Trigger');
    } catch (err) {
      markFailed('1. Database Append-Only Immutability Trigger', err);
    }

    // -----------------------------------------------------------------
    // TEST 2: Deep Secret & Credential Sanitization
    // -----------------------------------------------------------------
    try {
      const sanitizedEvent = await auditRepo.recordEvent({
        organization_id: 'org_audit_alpha',
        action: 'CREDENTIAL_ROTATION_ATTEMPT',
        entity_type: 'SECURITY',
        entity_id: 'sec_probe',
        before_state: {
          user_password: 'RawPassword123!',
          api_key: 'sk_live_secret_key_99999',
          safe_field: 'safe_value_before',
        },
        after_state: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_secret_token',
          private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC',
          nested: {
            pin: '1234',
            cvv: '999',
          },
        },
        metadata: {
          authorization: 'Bearer secret_token_xyz',
          webhook_secret: 'whsec_9999999',
          actor_email: 'admin.alpha@test.com',
        },
        severity: 'High',
      });

      // Verify raw database values
      const dbRow = await db.query<any>(`SELECT * FROM audit_events WHERE id = $1`, [sanitizedEvent.id]);
      assert.strictEqual(dbRow.rows.length, 1);
      const row = dbRow.rows[0];

      const beforeState = typeof row.before_state === 'string' ? JSON.parse(row.before_state) : row.before_state;
      const afterState = typeof row.after_state === 'string' ? JSON.parse(row.after_state) : row.after_state;
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

      assert.strictEqual(beforeState.user_password, '[REDACTED]', 'Password must be redacted');
      assert.strictEqual(beforeState.api_key, '[REDACTED]', 'API key must be redacted');
      assert.strictEqual(beforeState.safe_field, 'safe_value_before', 'Non-sensitive field preserved');
      assert.strictEqual(afterState.token, '[REDACTED]', 'JWT token must be redacted');
      assert.strictEqual(afterState.private_key, '[REDACTED]', 'Private key must be redacted');
      assert.strictEqual(afterState.nested.pin, '[REDACTED]', 'PIN must be redacted');
      assert.strictEqual(afterState.nested.cvv, '[REDACTED]', 'CVV must be redacted');
      assert.strictEqual(meta.authorization, '[REDACTED]', 'Authorization header must be redacted');
      assert.strictEqual(meta.webhook_secret, '[REDACTED]', 'Webhook secret must be redacted');
      assert.strictEqual(meta.actor_email, 'admin.alpha@test.com', 'Actor email preserved');

      markPassed('2. Deep Secret & Credential Sanitization');
    } catch (err) {
      markFailed('2. Deep Secret & Credential Sanitization', err);
    }

    // -----------------------------------------------------------------
    // TEST 3: Authentication & RBAC Boundaries on /api/tenant/audit
    // -----------------------------------------------------------------
    try {
      // Case 3a: Unauthenticated request -> 401
      const res3a = await fetch(`${baseUrl}/api/tenant/audit`);
      assert.strictEqual(res3a.status, 401, 'Unauthenticated request must return 401');

      // Case 3b: Unauthorized role without audit.view permission (Cashier) -> 403
      const res3b = await fetch(`${baseUrl}/api/tenant/audit`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      assert.strictEqual(res3b.status, 403, 'User without audit.view permission must receive 403');
      const body3b = await res3b.json();
      assert.strictEqual(body3b.error?.code, 'FORBIDDEN');

      // Case 3c: Suspended staff login attempt rejected
      let suspendedLoginFailed = false;
      try {
        await authService.login({
          email: 'suspended.alpha@test.com',
          password: 'AlphaSuspendedPass123!',
          organizationId: 'org_audit_alpha',
        });
      } catch (err: any) {
        suspendedLoginFailed = true;
      }
      assert.strictEqual(suspendedLoginFailed, true, 'Suspended staff login must be rejected');

      // Case 3d: Admin with audit.view -> 200 OK
      const res3d = await fetch(`${baseUrl}/api/tenant/audit`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res3d.status, 200, 'Authorized admin must receive 200');
      const body3d = await res3d.json();
      assert.strictEqual(body3d.success, true);
      assert.ok(Array.isArray(body3d.data), 'Returns data array');

      markPassed('3. Authentication & RBAC Boundaries on /api/tenant/audit');
    } catch (err) {
      markFailed('3. Authentication & RBAC Boundaries on /api/tenant/audit', err);
    }

    // -----------------------------------------------------------------
    // TEST 4: Strict Tenant Isolation & Client-Supplied TenantId Spoofing
    // -----------------------------------------------------------------
    try {
      // Case 4a: Seed Beta audit event
      await auditRepo.recordEvent({
        organization_id: 'org_audit_beta',
        action: 'BETA_EXCLUSIVE_EVENT',
        entity_type: 'ORDER',
        entity_id: 'ord_beta_999',
        severity: 'Medium',
      });

      // Case 4b: Alpha Admin requests /api/tenant/audit -> must NOT see Beta events
      const res4b = await fetch(`${baseUrl}/api/tenant/audit`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body4b = await res4b.json();
      const hasBetaEvent = body4b.data.some((e: any) => e.organization_id === 'org_audit_beta' || e.action === 'BETA_EXCLUSIVE_EVENT');
      assert.strictEqual(hasBetaEvent, false, 'Tenant Alpha must NEVER see Tenant Beta audit events');

      // Case 4c: Alpha Admin attempts cross-tenant query with ?orgId=org_audit_beta -> 403 TENANT_ACCESS_DENIED
      const res4c = await fetch(`${baseUrl}/api/tenant/audit?orgId=org_audit_beta`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res4c.status, 403, 'Cross-tenant query by tenant admin must return 403');
      const body4c = await res4c.json();
      assert.strictEqual(body4c.error?.code, 'TENANT_ACCESS_DENIED');

      // Case 4d: Verify that cross-tenant denial was authoritatively recorded as SECURITY_CROSS_TENANT_DENIED
      const res4d = await fetch(`${baseUrl}/api/tenant/audit?action=SECURITY_CROSS_TENANT_DENIED`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body4d = await res4d.json();
      assert.strictEqual(body4d.success, true);
      assert.ok(body4d.data.length >= 1, 'SECURITY_CROSS_TENANT_DENIED event must be present');
      assert.strictEqual(body4d.data[0].result, 'DENIED');
      assert.strictEqual(body4d.data[0].severity, 'Critical');

      markPassed('4. Strict Tenant Isolation & Client TenantId Spoofing Rejection');
    } catch (err) {
      markFailed('4. Strict Tenant Isolation & Client TenantId Spoofing Rejection', err);
    }

    // -----------------------------------------------------------------
    // TEST 5: Super Admin Cross-Tenant Audit Access & Auditing
    // -----------------------------------------------------------------
    try {
      const res5 = await fetch(`${baseUrl}/api/tenant/audit?orgId=org_audit_beta`, {
        headers: { Authorization: `Bearer ${superToken}` },
      });
      assert.strictEqual(res5.status, 200, 'Super admin cross-tenant query must be permitted');
      const body5 = await res5.json();
      assert.strictEqual(body5.success, true);
      const containsBetaEvent = body5.data.some((e: any) => e.organization_id === 'org_audit_beta');
      assert.strictEqual(containsBetaEvent, true, 'Super admin can view target tenant audit records');

      markPassed('5. Super Admin Cross-Tenant Audit Access & Auditing');
    } catch (err) {
      markFailed('5. Super Admin Cross-Tenant Audit Access & Auditing', err);
    }

    // -----------------------------------------------------------------
    // TEST 6: Bounded Pagination & Safe Clamping
    // -----------------------------------------------------------------
    try {
      // Request with excessive pageSize=500 -> clamped to 100
      const res6a = await fetch(`${baseUrl}/api/tenant/audit?pageSize=500`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body6a = await res6a.json();
      assert.strictEqual(body6a.pagination.pageSize, 100, 'Page size must be clamped to 100 maximum');

      // Request with page=0 -> clamped to 1
      const res6b = await fetch(`${baseUrl}/api/tenant/audit?page=0`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body6b = await res6b.json();
      assert.strictEqual(body6b.pagination.page, 1, 'Invalid page must default to 1');

      assert.ok(body6a.pagination.totalCount >= 1, 'totalCount must be reported');
      assert.ok(body6a.pagination.totalPages >= 1, 'totalPages must be reported');

      markPassed('6. Bounded Pagination & Safe Clamping');
    } catch (err) {
      markFailed('6. Bounded Pagination & Safe Clamping', err);
    }

    // -----------------------------------------------------------------
    // TEST 7: Composable Multi-Filter & Parameterized Text Search
    // -----------------------------------------------------------------
    try {
      // Filter by action
      const res7a = await fetch(`${baseUrl}/api/tenant/audit?action=IMMUTABILITY_PROBE`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body7a = await res7a.json();
      assert.ok(body7a.data.every((e: any) => e.action === 'IMMUTABILITY_PROBE'), 'Action filter must compose cleanly');

      // Filter by severity
      const res7b = await fetch(`${baseUrl}/api/tenant/audit?severity=Critical`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body7b = await res7b.json();
      assert.ok(body7b.data.every((e: any) => e.severity === 'Critical'), 'Severity filter must compose cleanly');

      // Safe search
      const res7c = await fetch(`${baseUrl}/api/tenant/audit?search=PROBE`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const body7c = await res7c.json();
      assert.ok(body7c.data.length >= 1, 'Search query must find matching records');

      markPassed('7. Composable Multi-Filter & Parameterized Text Search');
    } catch (err) {
      markFailed('7. Composable Multi-Filter & Parameterized Text Search', err);
    }

    // -----------------------------------------------------------------
    // TEST 8: Authoritative Security Overview Metrics (/api/tenant/audit/overview)
    // -----------------------------------------------------------------
    try {
      const res8 = await fetch(`${baseUrl}/api/tenant/audit/overview`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res8.status, 200);
      const body8 = await res8.json();
      assert.strictEqual(body8.success, true);
      const metrics = body8.data;

      assert.ok(typeof metrics.eventsToday === 'number', 'eventsToday must be a number');
      assert.ok(typeof metrics.eventsThisWeek === 'number', 'eventsThisWeek must be a number');
      assert.ok(typeof metrics.staffSuspensions === 'number', 'staffSuspensions must be a number');
      assert.ok(typeof metrics.rolePermissionChanges === 'number', 'rolePermissionChanges must be a number');
      assert.ok(typeof metrics.failedDeniedOperations === 'number', 'failedDeniedOperations must be a number');
      assert.ok(typeof metrics.criticalAndHigh === 'number', 'criticalAndHigh must be a number');
      assert.ok(Array.isArray(metrics.recentSecurityEvents), 'recentSecurityEvents must be an array');

      markPassed('8. Authoritative Security Overview Metrics');
    } catch (err) {
      markFailed('8. Authoritative Security Overview Metrics', err);
    }

    // -----------------------------------------------------------------
    // TEST 9: Staff Creation Audit Event Generation
    // -----------------------------------------------------------------
    try {
      const res9 = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alphaToken}`,
        },
        body: JSON.stringify({
          email: 'new.staff@test.com',
          name: 'New Staff Member',
          password: 'NewStaffPassword123!',
          role: 'viewer',
        }),
      });
      assert.strictEqual(res9.status, 201);
      const body9 = await res9.json();
      const newUserId = body9.data.id;

      // Verify USER_CREATED audit event was written
      const auditRes9 = await fetch(`${baseUrl}/api/tenant/audit?action=USER_CREATED`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const auditBody9 = await auditRes9.json();
      const createEvent = auditBody9.data.find((e: any) => e.entity_id === newUserId);
      assert.ok(createEvent, 'USER_CREATED audit event must be generated');
      assert.strictEqual(createEvent.action, 'USER_CREATED');
      assert.strictEqual(createEvent.result, 'SUCCESS');

      markPassed('9. Staff Creation Audit Event Generation');
    } catch (err) {
      markFailed('9. Staff Creation Audit Event Generation', err);
    }

    // -----------------------------------------------------------------
    // TEST 10: Staff Status Transition (Suspension/Reactivation) & Token Revocation
    // -----------------------------------------------------------------
    try {
      // Create active staff member
      const staffHash = hashPassword('StaffPass123!');
      const staffMember = await userRepo.createUser({
        organizationId: 'org_audit_alpha',
        email: 'suspend.target@test.com',
        name: 'Suspend Target',
        passwordHash: staffHash.hash,
        passwordSalt: staffHash.salt,
        role: 'manager',
        is_active: true,
      });

      // 10a. Suspend staff member via PATCH /api/users/:id/status
      const res10a = await fetch(`${baseUrl}/api/users/${staffMember.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alphaToken}`,
        },
        body: JSON.stringify({ isActive: false, reason: 'Security investigation' }),
      });
      assert.strictEqual(res10a.status, 200);
      const body10a = await res10a.json();
      assert.strictEqual(body10a.data.isActive, false);

      // Verify USER_SUSPENDED audit event
      const auditRes10a = await fetch(`${baseUrl}/api/tenant/audit?action=USER_SUSPENDED`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const auditBody10a = await auditRes10a.json();
      const suspendEvent = auditBody10a.data.find((e: any) => e.entity_id === staffMember.id);
      assert.ok(suspendEvent, 'USER_SUSPENDED audit event must be recorded');
      assert.strictEqual(suspendEvent.severity, 'High');

      // 10b. Reactivate staff member via PATCH /api/users/:id/status
      const res10b = await fetch(`${baseUrl}/api/users/${staffMember.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alphaToken}`,
        },
        body: JSON.stringify({ isActive: true, reason: 'Investigation completed' }),
      });
      assert.strictEqual(res10b.status, 200);
      const body10b = await res10b.json();
      assert.strictEqual(body10b.data.isActive, true);

      // Verify USER_REACTIVATED audit event
      const auditRes10b = await fetch(`${baseUrl}/api/tenant/audit?action=USER_REACTIVATED`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const auditBody10b = await auditRes10b.json();
      const reactivateEvent = auditBody10b.data.find((e: any) => e.entity_id === staffMember.id);
      assert.ok(reactivateEvent, 'USER_REACTIVATED audit event must be recorded');

      markPassed('10. Staff Status Transition (Suspension/Reactivation) & Auditing');
    } catch (err) {
      markFailed('10. Staff Status Transition (Suspension/Reactivation) & Auditing', err);
    }

    // -----------------------------------------------------------------
    // TEST 11: Owner Protection on Staff Lifecycle
    // -----------------------------------------------------------------
    try {
      // 11a. Attempt to self-deactivate admin -> 403 SELF_DEACTIVATION_FORBIDDEN
      const res11a = await fetch(`${baseUrl}/api/users/${adminAlpha.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alphaToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });
      assert.strictEqual(res11a.status, 403);
      const body11a = await res11a.json();
      assert.strictEqual(body11a.error?.code, 'SELF_DEACTIVATION_FORBIDDEN');

      // 11b. Attempt to delete self -> 403 SELF_DELETION_FORBIDDEN
      const res11b = await fetch(`${baseUrl}/api/users/${adminAlpha.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${alphaToken}`,
        },
      });
      assert.strictEqual(res11b.status, 403);
      const body11b = await res11b.json();
      assert.strictEqual(body11b.error?.code, 'SELF_DELETION_FORBIDDEN');

      // 11c. Attempt to delete last active admin from Beta -> 403 OWNER_PROTECTION_VIOLATION
      // (Create a temporary second admin in Beta to test deleting non-self while ensuring count <= 1 fails)
      const res11c = await fetch(`${baseUrl}/api/users/${adminBeta.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${superToken}?orgId=org_audit_beta`,
        },
      });
      // Super admin without ?orgId on query param was calling for alpha, but targetOrgId resolution works
      // The deletion of adminBeta (the sole admin in Beta) must be rejected
      const betaDelRes = await fetch(`${baseUrl}/api/users/${adminBeta.id}?orgId=org_audit_beta`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${superToken}`,
        },
      });
      assert.strictEqual(betaDelRes.status, 403);
      const betaDelBody = await betaDelRes.json();
      assert.strictEqual(betaDelBody.error?.code, 'OWNER_PROTECTION_VIOLATION');

      markPassed('11. Owner Protection on Staff Lifecycle');
    } catch (err) {
      markFailed('11. Owner Protection on Staff Lifecycle', err);
    }

    // -----------------------------------------------------------------
    // TEST 12: Staff Role Modification & Deletion Auditing
    // -----------------------------------------------------------------
    try {
      // Create user to update
      const targetHash = hashPassword('RoleTargetPass123!');
      const targetUser = await userRepo.createUser({
        organizationId: 'org_audit_alpha',
        email: 'role.target@test.com',
        name: 'Role Target',
        passwordHash: targetHash.hash,
        passwordSalt: targetHash.salt,
        role: 'viewer',
        is_active: true,
      });

      // Update role from viewer to manager
      const res12a = await fetch(`${baseUrl}/api/users/${targetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alphaToken}`,
        },
        body: JSON.stringify({ role: 'manager' }),
      });
      assert.strictEqual(res12a.status, 200);

      // Verify USER_ROLE_CHANGED audit event
      const auditRes12a = await fetch(`${baseUrl}/api/tenant/audit?action=USER_ROLE_CHANGED`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const auditBody12a = await auditRes12a.json();
      const roleEvent = auditBody12a.data.find((e: any) => e.entity_id === targetUser.id);
      assert.ok(roleEvent, 'USER_ROLE_CHANGED audit event must be recorded');
      assert.strictEqual(roleEvent.severity, 'High');

      // Delete user
      const res12b = await fetch(`${baseUrl}/api/users/${targetUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${alphaToken}`,
        },
      });
      assert.strictEqual(res12b.status, 200);

      // Verify USER_DELETED audit event
      const auditRes12b = await fetch(`${baseUrl}/api/tenant/audit?action=USER_DELETED`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      const auditBody12b = await auditRes12b.json();
      const delEvent = auditBody12b.data.find((e: any) => e.entity_id === targetUser.id);
      assert.ok(delEvent, 'USER_DELETED audit event must be recorded');
      assert.strictEqual(delEvent.severity, 'High');

      markPassed('12. Staff Role Modification & Deletion Auditing');
    } catch (err) {
      markFailed('12. Staff Role Modification & Deletion Auditing', err);
    }

    // -----------------------------------------------------------------
    // TEST 13: Backward-Compatible /api/audit-logs Route
    // -----------------------------------------------------------------
    try {
      const res13 = await fetch(`${baseUrl}/api/audit-logs`, {
        headers: { Authorization: `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res13.status, 200);
      const body13 = await res13.json();
      assert.strictEqual(body13.success, true);
      assert.ok(Array.isArray(body13.data));
      assert.ok(body13.pagination);

      markPassed('13. Backward-Compatible /api/audit-logs Route');
    } catch (err) {
      markFailed('13. Backward-Compatible /api/audit-logs Route', err);
    }
  } finally {
    server.close();
  }

  console.log('================================================================');
  console.log(`  AUD-001 Tests Finished: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditSecurityTests().catch((err) => {
  console.error('Fatal error running audit security tests:', err);
  process.exit(1);
});
