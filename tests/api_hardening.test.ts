process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import { getDatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { AuthService } from '../server/services/authService';
import { UserRepository } from '../server/repositories/userRepository';
import { CustomerRepository } from '../server/repositories/customerRepository';
import { CatalogRepository } from '../server/repositories/catalogRepository';
import { AuditRepository } from '../server/repositories/auditRepository';
import { hashPassword } from '../server/auth/password';
import { signToken } from '../server/auth/token';
import { classifyApiError, sanitizeApiErrorMessage, buildApiErrorResponse, ApiError } from '../server/utils/errorSanitizer';

async function runApiHardeningTests() {
  console.log('======================================================');
  console.log(' AbaCha API-001 REST API Hardening & Validation Tests');
  console.log('======================================================');

  let passed = 0;
  let failed = 0;

  function markPassed(testName: string) {
    console.log(`  [TEST] ${testName}... PASSED`);
    passed++;
  }

  function markFailed(testName: string, err: any) {
    console.error(`  [TEST] ${testName}... FAILED!`);
    console.error(err);
    failed++;
  }

  // 1. Setup Database & Migrations
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  await runMigrations(db);

  // Seed baseline test organizations and users
  await db.exec(`
    INSERT INTO organizations (id, name, code, is_active) VALUES 
      ('org_api_alpha', 'API Org Alpha', 'API_ALPHA', TRUE),
      ('org_api_beta', 'API Org Beta', 'API_BETA', TRUE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customers (id, organization_id, name, email, store_credit_balance, credit_limit) VALUES
      ('cust_alpha_1', 'org_api_alpha', 'Alpha Customer', 'alpha@cust.test', '150.00', '500.00'),
      ('cust_beta_1', 'org_api_beta', 'Beta Customer', 'beta@cust.test', '25.50', '1000.00')
    ON CONFLICT (id) DO NOTHING;
  `);

  const userRepo = new UserRepository(db);
  const customerRepo = new CustomerRepository(db);
  const catalogRepo = new CatalogRepository(db);
  const auditRepo = new AuditRepository(db);
  const authService = new AuthService(userRepo, auditRepo);

  // Create test users
  const adminAlphaHash = hashPassword('AdminPass123!');
  const adminAlpha = await userRepo.createUser({
    organizationId: 'org_api_alpha',
    email: 'admin.alpha@test.com',
    name: 'Admin Alpha',
    passwordHash: adminAlphaHash.hash,
    passwordSalt: adminAlphaHash.salt,
    role: 'admin',
  });

  const adminBetaHash = hashPassword('AdminBetaPass123!');
  const adminBeta = await userRepo.createUser({
    organizationId: 'org_api_beta',
    email: 'admin.beta@test.com',
    name: 'Admin Beta',
    passwordHash: adminBetaHash.hash,
    passwordSalt: adminBetaHash.salt,
    role: 'admin',
  });

  // Log in to get real JWT tokens
  const alphaLogin = await authService.login({
    email: 'admin.alpha@test.com',
    password: 'AdminPass123!',
    organizationId: 'org_api_alpha',
  });
  const alphaToken = alphaLogin.token;

  const betaLogin = await authService.login({
    email: 'admin.beta@test.com',
    password: 'AdminBetaPass123!',
    organizationId: 'org_api_beta',
  });
  const betaToken = betaLogin.token;

  const superAdminHash = hashPassword('SuperAdminPass123!');
  await userRepo.createUser({
    organizationId: 'org_api_alpha',
    email: 'superadmin@test.com',
    name: 'Super Admin',
    passwordHash: superAdminHash.hash,
    passwordSalt: superAdminHash.salt,
    role: 'super_admin',
  });
  const superLogin = await authService.login({
    email: 'superadmin@test.com',
    password: 'SuperAdminPass123!',
    organizationId: 'org_api_alpha',
  });
  const superToken = superLogin.token;

  // Forged/malformed token without organizationId to test fail-closed enforcement
  const noTenantToken = signToken({
    userId: 'usr_no_tenant',
    email: 'no_tenant@test.com',
    organizationId: '',
    role: 'admin',
  });

  // Create Express App
  const { app } = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -----------------------------------------------------------------
    // TEST 1: Request & Correlation ID Tracking
    // -----------------------------------------------------------------
    try {
      // Case 1a: Supplied X-Request-Id is echoed back
      const res1a = await fetch(`${baseUrl}/api/health`, {
        headers: { 'x-request-id': 'custom-req-id-12345' },
      });
      assert.strictEqual(res1a.headers.get('x-request-id'), 'custom-req-id-12345');

      // Case 1b: Generated X-Request-Id when none provided
      const res1b = await fetch(`${baseUrl}/api/health`);
      const generatedId = res1b.headers.get('x-request-id');
      assert.ok(generatedId && generatedId.startsWith('req-'), 'Auto-generated request ID must start with req-');

      markPassed('1. Request & Correlation ID Tracking');
    } catch (err) {
      markFailed('1. Request & Correlation ID Tracking', err);
    }

    // -----------------------------------------------------------------
    // TEST 2: Strict DTO Validation on POST /api/users
    // -----------------------------------------------------------------
    try {
      // 2a: Reject missing required fields
      const res2a = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Shorty' }),
      });
      assert.strictEqual(res2a.status, 422, 'Missing fields must fail with 422 Unprocessable Entity');
      const body2a = await res2a.json();
      assert.strictEqual(body2a.success, false);
      assert.strictEqual(body2a.error.code, 'VALIDATION_ERROR');

      // 2b: Reject invalid email format
      const res2b = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'not-an-email',
          name: 'Invalid Email User',
          password: 'ValidPassword123!',
          role: 'cashier',
        }),
      });
      assert.strictEqual(res2b.status, 422);

      // 2c: Reject password shorter than 8 characters
      const res2c = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'valid@test.com',
          name: 'Short Password User',
          password: '123',
          role: 'cashier',
        }),
      });
      assert.strictEqual(res2c.status, 422);

      // 2d: Reject invalid/unrecognized role
      const res2d = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'valid@test.com',
          name: 'Bad Role User',
          password: 'ValidPassword123!',
          role: 'super_hacker_role',
        }),
      });
      assert.strictEqual(res2d.status, 422);

      // 2e: Valid payload succeeds and enforces caller's tenant
      const res2e = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'cashier.alpha@test.com',
          name: 'Alpha Cashier',
          password: 'ValidPassword123!',
          role: 'cashier',
        }),
      });
      assert.strictEqual(res2e.status, 201);
      const body2e = await res2e.json();
      assert.strictEqual(body2e.success, true);
      assert.strictEqual(body2e.data.organizationId, 'org_api_alpha', 'Tenant must be bound to authenticated caller');

      markPassed('2. Strict DTO Validation on POST /api/users');
    } catch (err) {
      markFailed('2. Strict DTO Validation on POST /api/users', err);
    }

    // -----------------------------------------------------------------
    // TEST 3: Catalog DTO Validation (Categories, Brands, Attributes)
    // -----------------------------------------------------------------
    try {
      // 3a: Category without name fails 422
      const res3a = await fetch(`${baseUrl}/api/categories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'No name category' }),
      });
      assert.strictEqual(res3a.status, 422);

      // 3b: Brand without name fails 422
      const res3b = await fetch(`${baseUrl}/api/brands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: true }),
      });
      assert.strictEqual(res3b.status, 422);

      // 3c: Attribute without name fails 422
      const res3c = await fetch(`${baseUrl}/api/attributes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'text' }),
      });
      assert.strictEqual(res3c.status, 422);

      markPassed('3. Catalog DTO Validation (Categories, Brands, Attributes)');
    } catch (err) {
      markFailed('3. Catalog DTO Validation (Categories, Brands, Attributes)', err);
    }

    // -----------------------------------------------------------------
    // TEST 4: Tenant Isolation on Customer Endpoints
    // -----------------------------------------------------------------
    try {
      // 4a: Alpha accesses Alpha customer -> 200 OK
      const res4a = await fetch(`${baseUrl}/api/customers/cust_alpha_1`, {
        headers: { 'Authorization': `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res4a.status, 200);
      const body4a = await res4a.json();
      assert.strictEqual(body4a.success, true);
      assert.strictEqual(body4a.data.id, 'cust_alpha_1');
      assert.strictEqual(body4a.data.store_credit_balance, '150.00');

      // 4b: Beta accesses Alpha customer -> 403 Forbidden
      const res4b = await fetch(`${baseUrl}/api/customers/cust_alpha_1`, {
        headers: { 'Authorization': `Bearer ${betaToken}` },
      });
      assert.strictEqual(res4b.status, 403, 'Cross-tenant customer access must return 403');
      const body4b = await res4b.json();
      assert.strictEqual(body4b.success, false);
      assert.strictEqual(body4b.error.code, 'TENANT_ACCESS_DENIED');

      // 4c: Non-existent customer -> 404 NOT_FOUND
      const res4c = await fetch(`${baseUrl}/api/customers/cust_non_existent`, {
        headers: { 'Authorization': `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res4c.status, 404);
      const body4c = await res4c.json();
      assert.strictEqual(body4c.error.code, 'NOT_FOUND');

      markPassed('4. Tenant Isolation on Customer Endpoints');
    } catch (err) {
      markFailed('4. Tenant Isolation on Customer Endpoints', err);
    }

    // -----------------------------------------------------------------
    // TEST 5: Repository Hardening & Tenant Requirement (Fail-Closed)
    // -----------------------------------------------------------------
    try {
      // 5a: CustomerRepository requires organizationId
      let custThrew = false;
      try {
        await (customerRepo as any).findCustomerById('cust_alpha_1', '');
      } catch (err: any) {
        custThrew = true;
        assert.ok(err.message.startsWith('TENANT_REQUIRED'), 'Error should start with TENANT_REQUIRED');
      }
      assert.ok(custThrew, 'CustomerRepository must throw TENANT_REQUIRED when organizationId is missing');

      // 5b: UserRepository requires organizationId
      let userThrew = false;
      try {
        await (userRepo as any).listByOrg('');
      } catch (err: any) {
        userThrew = true;
        assert.ok(err.message.startsWith('TENANT_REQUIRED'), 'Error should start with TENANT_REQUIRED');
      }
      assert.ok(userThrew, 'UserRepository must throw TENANT_REQUIRED when organizationId is missing');

      // 5c: CatalogRepository requires organizationId
      let catThrew = false;
      try {
        await (catalogRepo as any).listProducts('', {});
      } catch (err: any) {
        catThrew = true;
        assert.ok(err.message.startsWith('TENANT_REQUIRED'), 'Error should start with TENANT_REQUIRED');
      }
      assert.ok(catThrew, 'CatalogRepository must throw TENANT_REQUIRED when organizationId is missing');

      markPassed('5. Repository Hardening & Tenant Requirement (Fail-Closed)');
    } catch (err) {
      markFailed('5. Repository Hardening & Tenant Requirement (Fail-Closed)', err);
    }

    // -----------------------------------------------------------------
    // TEST 6: Exact-Decimal Representation in Catalog Repository
    // -----------------------------------------------------------------
    try {
      const createdProd = await catalogRepo.createProductWithVariants(
        {
          id: 'prod_exact_dec_1',
          organization_id: 'org_api_alpha',
          name: 'Precision Watch',
          slug: 'precision-watch',
          unit_code: 'PCS',
          tax_rate: 8.25,
          status: 'active',
        },
        [
          {
            id: 'var_exact_dec_1',
            product_id: 'prod_exact_dec_1',
            organization_id: 'org_api_alpha',
            sku: 'SKU-PREC-001',
            barcode: '88090001',
            name: 'Precision Watch - Standard',
            retail_price: '249.99',
            cost_price: '120.50',
            wholesale_price: '180.00',
            member_price: '229.99',
            min_selling_price: '199.00',
          },
        ]
      );

      assert.strictEqual(typeof createdProd.product.tax_rate, 'string');
      assert.strictEqual(createdProd.product.tax_rate, '8.25');

      assert.strictEqual(typeof createdProd.variants[0].retail_price, 'string');
      assert.strictEqual(createdProd.variants[0].retail_price, '249.99');
      assert.strictEqual(createdProd.variants[0].cost_price, '120.50');

      // Read back from database
      const fetchedProd = await catalogRepo.findProductById('prod_exact_dec_1', 'org_api_alpha');
      assert.ok(fetchedProd);
      assert.strictEqual(fetchedProd.tax_rate, '8.25');

      const fetchedVariants = await catalogRepo.findVariantsByProductId('prod_exact_dec_1', 'org_api_alpha');
      assert.strictEqual(fetchedVariants.length, 1);
      assert.strictEqual(fetchedVariants[0].retail_price, '249.99');
      assert.strictEqual(fetchedVariants[0].cost_price, '120.50');

      markPassed('6. Exact-Decimal Representation in Catalog Repository');
    } catch (err) {
      markFailed('6. Exact-Decimal Representation in Catalog Repository', err);
    }

    // -----------------------------------------------------------------
    // TEST 7: Error Sanitizer Defense (No DB Leaks, Standard Envelopes)
    // -----------------------------------------------------------------
    try {
      // 7a: Error with DB connection credentials
      const sensitiveConnErr = new Error('connect ECONNREFUSED postgres://admin:SuperSecretPw@10.0.0.1:5432/abacha');
      const sanitizedConn = sanitizeApiErrorMessage(sensitiveConnErr.message);
      assert.ok(!sanitizedConn.includes('SuperSecretPw'), 'Connection password must be redacted');
      assert.ok(sanitizedConn.includes('[REDACTED_CONN_URI]'));

      // 7b: Error with SQL syntax leak
      const sqlErr = new Error('syntax error at or near "SELECT * FROM users WHERE organization_id = ..."');
      const sanitizedSql = sanitizeApiErrorMessage(sqlErr.message);
      assert.strictEqual(sanitizedSql, '[REDACTED_DB_SYNTAX]');

      // 7c: Error classification
      const notFoundErr = new Error('Customer not found');
      (notFoundErr as any).code = 'NOT_FOUND';
      const classified404 = classifyApiError(notFoundErr);
      assert.strictEqual(classified404.status, 404);
      assert.strictEqual(classified404.code, 'NOT_FOUND');

      const conflictErr = new Error('duplicate key value violates unique constraint');
      (conflictErr as any).code = '23505';
      const classified409 = classifyApiError(conflictErr);
      assert.strictEqual(classified409.status, 409);
      assert.strictEqual(classified409.code, 'CONFLICT');

      // 7d: Stack trace is never exposed in response
      const serverErr = new Error('Unexpected panic in calculation');
      serverErr.stack = 'Error: at /app/server/secret/logic.ts:42:15';
      const envRes = buildApiErrorResponse(serverErr);
      assert.strictEqual((envRes.body as any).stack, undefined);
      assert.strictEqual(envRes.body.error.code, 'INTERNAL_SERVER_ERROR');

      markPassed('7. Error Sanitizer Defense (No DB Leaks, Standard Envelopes)');
    } catch (err) {
      markFailed('7. Error Sanitizer Defense (No DB Leaks, Standard Envelopes)', err);
    }

    // -----------------------------------------------------------------
    // TEST 8: Super Admin Cross-Tenant Access Model B & Fail-Closed Enforcement
    // -----------------------------------------------------------------
    try {
      // 8a: Non-super-admin attempting cross-tenant query on /api/customers
      const res8a = await fetch(`${baseUrl}/api/customers?orgId=org_api_beta`, {
        headers: { 'Authorization': `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res8a.status, 403, 'Non-super admin cross-tenant query must be rejected with 403');
      const body8a = await res8a.json();
      assert.strictEqual(body8a.success, false);
      assert.strictEqual(body8a.error.code, 'TENANT_ACCESS_DENIED');

      // 8b: Non-super-admin attempting cross-tenant query on /api/users
      const res8b = await fetch(`${baseUrl}/api/users?orgId=org_api_beta`, {
        headers: { 'Authorization': `Bearer ${alphaToken}` },
      });
      assert.strictEqual(res8b.status, 403);
      const body8b = await res8b.json();
      assert.strictEqual(body8b.error.code, 'TENANT_ACCESS_DENIED');

      // 8c: Non-super-admin attempting cross-tenant creation on /api/users
      const res8c = await fetch(`${baseUrl}/api/users?orgId=org_api_beta`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'hacker.cashier@test.com',
          name: 'Hacker Cashier',
          password: 'ValidPassword123!',
          role: 'cashier',
        }),
      });
      assert.strictEqual(res8c.status, 403);
      const body8c = await res8c.json();
      assert.strictEqual(body8c.error.code, 'TENANT_ACCESS_DENIED');

      // 8d: Super Admin accessing without ?orgId defaults to home tenant (org_api_alpha)
      const res8d = await fetch(`${baseUrl}/api/customers`, {
        headers: { 'Authorization': `Bearer ${superToken}` },
      });
      assert.strictEqual(res8d.status, 200);
      const body8d = await res8d.json();
      assert.strictEqual(body8d.success, true);
      assert.ok(body8d.data.every((c: any) => c.organization_id === 'org_api_alpha'));

      // 8e: Super Admin cross-tenant read via ?orgId=org_api_beta returns beta customers and logs audit
      const res8e = await fetch(`${baseUrl}/api/customers?orgId=org_api_beta`, {
        headers: {
          'Authorization': `Bearer ${superToken}`,
          'x-request-id': 'super-audit-read-req-1',
        },
      });
      assert.strictEqual(res8e.status, 200);
      const body8e = await res8e.json();
      assert.strictEqual(body8e.success, true);
      assert.ok(body8e.data.length > 0);
      assert.ok(body8e.data.every((c: any) => c.organization_id === 'org_api_beta'));

      // Verify audit trail for cross-tenant read
      const readAudits = await db.query<any>(
        'SELECT * FROM audit_events WHERE organization_id = $1 AND action = $2 ORDER BY timestamp DESC LIMIT 10',
        ['org_api_beta', 'SUPER_ADMIN_CROSS_TENANT_READ']
      );
      assert.ok(readAudits.rows.length > 0, 'Cross-tenant read audit must be recorded in target organization');
      assert.strictEqual(readAudits.rows[0].actor_role, 'super_admin');
      const meta = typeof readAudits.rows[0].metadata === 'string'
        ? JSON.parse(readAudits.rows[0].metadata)
        : readAudits.rows[0].metadata;
      assert.strictEqual(meta?.homeOrganization, 'org_api_alpha');
      assert.strictEqual(meta?.targetOrganization, 'org_api_beta');

      // 8f: Super Admin cross-tenant user creation via ?orgId=org_api_beta
      const res8f = await fetch(`${baseUrl}/api/users?orgId=org_api_beta`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${superToken}`,
          'Content-Type': 'application/json',
          'x-request-id': 'super-audit-create-req-1',
        },
        body: JSON.stringify({
          email: 'beta.supercreated@test.com',
          name: 'Beta Super Created',
          password: 'ValidPassword123!',
          role: 'cashier',
        }),
      });
      assert.strictEqual(res8f.status, 201);
      const body8f = await res8f.json();
      assert.strictEqual(body8f.success, true);
      assert.strictEqual(body8f.data.organizationId, 'org_api_beta');

      // Verify audit trail for cross-tenant create
      const createAudits = await db.query<any>(
        'SELECT * FROM audit_events WHERE organization_id = $1 AND action = $2 ORDER BY timestamp DESC LIMIT 10',
        ['org_api_beta', 'SUPER_ADMIN_CROSS_TENANT_CREATE']
      );
      assert.ok(createAudits.rows.length > 0, 'Cross-tenant create audit must be recorded');
      assert.strictEqual(createAudits.rows[0].actor_role, 'super_admin');

      // 8g: Token without organizationId is rejected by cryptographic verification as UNAUTHORIZED
      const res8g = await fetch(`${baseUrl}/api/customers`, {
        headers: { 'Authorization': `Bearer ${noTenantToken}` },
      });
      assert.strictEqual(res8g.status, 401);
      const body8g = await res8g.json();
      assert.strictEqual(body8g.error.code, 'UNAUTHORIZED');

      markPassed('8. Super Admin Cross-Tenant Access Model B & Fail-Closed Enforcement');
    } catch (err) {
      markFailed('8. Super Admin Cross-Tenant Access Model B & Fail-Closed Enforcement', err);
    }

    // -----------------------------------------------------------------
    // TEST 9: Strict Product & Attribute DTO Validation & Prototype Pollution Defense
    // -----------------------------------------------------------------
    try {
      // 9a: Reject Prototype Pollution attempts
      const res9a = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: '{"name":"Exploit Product","__proto__":{"admin":true}}',
      });
      assert.strictEqual(res9a.status, 422, 'Prototype pollution attempt must be rejected with 422');
      const body9a = await res9a.json();
      assert.strictEqual(body9a.success, false);
      assert.strictEqual(body9a.error.code, 'VALIDATION_ERROR');

      // 9b: Reject unknown/unrecognized attributes outside allowlist
      const res9b = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Unknown Field Product',
          unauthorized_secret_flag: true,
        }),
      });
      assert.strictEqual(res9b.status, 422, 'Unknown fields must be rejected with 422');
      const body9b = await res9b.json();
      assert.strictEqual(body9b.error.code, 'VALIDATION_ERROR');
      assert.ok(body9b.error.details.some((d: any) => d.field === 'unauthorized_secret_flag'));

      // 9c: Valid Product payload succeeds with server-authoritative ID & tenant
      const res9c = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Validated Precision Wireless Mouse',
          brand: 'LogiPrecision',
          category: 'Peripherals',
          retailPrice: '49.99',
          costPrice: '20.00',
        }),
      });
      assert.strictEqual(res9c.status, 201);
      const body9c = await res9c.json();
      assert.strictEqual(body9c.success, true);
      assert.ok(body9c.data.id.startsWith('prod-'), 'Authoritative prod- ID prefix');
      assert.strictEqual(body9c.data.organizationId, 'org_api_alpha', 'Tenant stamped from authenticated caller');

      // 9d: Reject unknown fields on PUT /api/attributes/:id
      const res9d = await fetch(`${baseUrl}/api/attributes/attr_test_update`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Attribute',
          illegal_extra_param: 999,
        }),
      });
      assert.strictEqual(res9d.status, 422);
      const body9d = await res9d.json();
      assert.strictEqual(body9d.error.code, 'VALIDATION_ERROR');

      markPassed('9. Strict Product & Attribute DTO Validation & Prototype Pollution Defense');
    } catch (err) {
      markFailed('9. Strict Product & Attribute DTO Validation & Prototype Pollution Defense', err);
    }

    // -----------------------------------------------------------------
    // TEST 10: Production Error Envelope Redaction & Hierarchy Standards
    // -----------------------------------------------------------------
    try {
      // 10a: In production mode, database internal errors are completely sanitized to generic message
      const dbInternalErr = new Error('relation "secret_internal_table" does not exist at character 42');
      const prodRes = buildApiErrorResponse(dbInternalErr, undefined, true);
      assert.strictEqual(prodRes.status, 500);
      assert.strictEqual(prodRes.body.error.code, 'INTERNAL_SERVER_ERROR');
      assert.strictEqual(prodRes.body.error.message, 'An unexpected internal error occurred. Please contact support.');
      assert.strictEqual((prodRes.body as any).stack, undefined);

      // 10b: ApiError adheres to contract
      const customApiErr = new ApiError('FORBIDDEN_OPERATION', 'Action not permitted on locked batch', 403, [
        { field: 'batchId', message: 'Batch is locked' },
      ]);
      const customRes = buildApiErrorResponse(customApiErr);
      assert.strictEqual(customRes.status, 403);
      assert.strictEqual(customRes.body.error.code, 'FORBIDDEN_OPERATION');
      assert.strictEqual(customRes.body.error.message, 'Action not permitted on locked batch');
      assert.strictEqual(customRes.body.error.details?.length, 1);
      assert.strictEqual(customRes.body.error.details?.[0].field, 'batchId');

      markPassed('10. Production Error Envelope Redaction & Hierarchy Standards');
    } catch (err) {
      markFailed('10. Production Error Envelope Redaction & Hierarchy Standards', err);
    }

    // -----------------------------------------------------------------
    // TEST 11: API-001R3 Security, Verification, and Exact-Decimal Tests
    // -----------------------------------------------------------------
    try {
      console.log('  Running TEST 11: API-001R3 Scenarios...');

      // Ensure inactive organization exists
      await db.query(`
        INSERT INTO organizations (id, name, code, is_active) VALUES 
          ('org_inactive', 'Inactive Org', 'INACTIVE', FALSE)
        ON CONFLICT (id) DO UPDATE SET is_active = FALSE;
      `);

      // --- SCENARIO 1: Super Admin home-tenant query (no query params) ---
      const resS1 = await fetch(`${baseUrl}/api/customers`, {
        headers: { 'Authorization': `Bearer ${superToken}` },
      });
      assert.strictEqual(resS1.status, 200);
      const bodyS1 = await resS1.json();
      assert.ok(bodyS1.data.every((c: any) => c.organization_id === 'org_api_alpha'));

      // --- SCENARIO 2: Super Admin explicit cross-tenant override query ---
      const resS2 = await fetch(`${baseUrl}/api/customers?orgId=org_api_beta`, {
        headers: { 'Authorization': `Bearer ${superToken}` },
      });
      assert.strictEqual(resS2.status, 200);
      const bodyS2 = await resS2.json();
      assert.ok(bodyS2.data.every((c: any) => c.organization_id === 'org_api_beta'));

      // --- SCENARIO 3: Super Admin explicit target tenant mutation ---
      const resS3 = await fetch(`${baseUrl}/api/products?orgId=org_api_beta`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${superToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Super Cross Product',
          brand: 'Super',
          category: 'Hardware',
        }),
      });
      assert.strictEqual(resS3.status, 201);
      const bodyS3 = await resS3.json();
      assert.strictEqual(bodyS3.data.organizationId, 'org_api_beta');

      // Verify audit event
      const auditsS3 = await db.query<any>(
        'SELECT * FROM audit_events WHERE organization_id = $1 AND action = $2 ORDER BY timestamp DESC LIMIT 1',
        ['org_api_beta', 'SUPER_ADMIN_CROSS_TENANT_CREATE']
      );
      assert.ok(auditsS3.rows.length > 0, 'Must record SUPER_ADMIN_CROSS_TENANT_CREATE audit trail');

      // --- SCENARIO 4: Super Admin mutation without query parameters ---
      const resS4 = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${superToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Super Home Product',
          brand: 'Super',
          category: 'Hardware',
        }),
      });
      assert.strictEqual(resS4.status, 201);
      const bodyS4 = await resS4.json();
      assert.strictEqual(bodyS4.data.organizationId, 'org_api_alpha');

      // --- SCENARIO 5: Bypass validation empty/missing organizationId at login ---
      const resS5a = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin.alpha@test.com',
          password: 'AdminPass123!',
        }),
      });
      assert.strictEqual(resS5a.status, 422);
      const bodyS5a = await resS5a.json();
      assert.strictEqual(bodyS5a.error.code, 'VALIDATION_ERROR');

      const resS5b = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin.alpha@test.com',
          password: 'AdminPass123!',
          organizationId: '',
        }),
      });
      assert.strictEqual(resS5b.status, 422);
      const bodyS5b = await resS5b.json();
      assert.strictEqual(bodyS5b.error.code, 'VALIDATION_ERROR');

      // --- SCENARIO 6: Non-super-admin attempting to access another tenant's resources ---
      const resS6 = await fetch(`${baseUrl}/api/customers/cust_beta_1`, {
        headers: { 'Authorization': `Bearer ${alphaToken}` },
      });
      assert.strictEqual(resS6.status, 403);
      const bodyS6 = await resS6.json();
      assert.strictEqual(bodyS6.error.code, 'TENANT_ACCESS_DENIED');

      // --- SCENARIO 7: Non-super-admin attempting to pass another orgId as query ---
      const resS7 = await fetch(`${baseUrl}/api/customers?orgId=org_api_beta`, {
        headers: { 'Authorization': `Bearer ${alphaToken}` },
      });
      assert.strictEqual(resS7.status, 403);
      const bodyS7 = await resS7.json();
      assert.strictEqual(bodyS7.error.code, 'TENANT_ACCESS_DENIED');

      // --- SCENARIO 8: Target organization not found/inactive ---
      const resS8a = await fetch(`${baseUrl}/api/customers?orgId=org_not_exist`, {
        headers: { 'Authorization': `Bearer ${superToken}` },
      });
      assert.strictEqual(resS8a.status, 404);
      const bodyS8a = await resS8a.json();
      assert.strictEqual(bodyS8a.error.code, 'TENANT_NOT_FOUND');

      const resS8b = await fetch(`${baseUrl}/api/customers?orgId=org_inactive`, {
        headers: { 'Authorization': `Bearer ${superToken}` },
      });
      assert.strictEqual(resS8b.status, 403);
      const bodyS8b = await resS8b.json();
      assert.strictEqual(bodyS8b.error.code, 'TENANT_ACCESS_DENIED');

      // --- SCENARIO 9: Database error during target organization verification (fail-closed) ---
      const originalQuery = db.query;
      db.query = async (text: string, params?: any[]) => {
        if (params && params[0] === 'org_db_fail') {
          throw new Error('Database connection timeout or crash simulated');
        }
        return originalQuery.call(db, text, params);
      };

      try {
        const resS9 = await fetch(`${baseUrl}/api/customers?orgId=org_db_fail`, {
          headers: { 'Authorization': `Bearer ${superToken}` },
        });
        assert.strictEqual(resS9.status, 403);
        const bodyS9 = await resS9.json();
        assert.strictEqual(bodyS9.error.code, 'TENANT_ACCESS_DENIED');
        assert.strictEqual(bodyS9.error.message, 'Failed to verify target organization status.');
      } finally {
        db.query = originalQuery;
      }

      // --- SCENARIO 10: Strict DTO anti-spoofing rejection ---
      const resS10 = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Spoofed Product',
          brand: 'Brand',
          category: 'Category',
          organizationId: 'org_api_beta', // Forbidden key
        }),
      });
      assert.strictEqual(resS10.status, 422);
      const bodyS10 = await resS10.json();
      assert.strictEqual(bodyS10.error.code, 'VALIDATION_ERROR');

      // --- EXACT-DECIMAL HTTP BOUNDARY ACCEPTANCE TESTS ---
      // Must accept exact string decimal
      const resDecGood = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Watch A',
          brand: 'Watch',
          category: 'Watch',
          retailPrice: '249.99',
        }),
      });
      assert.strictEqual(resDecGood.status, 201);

      // Must reject numeric float
      const resDecFloat = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Watch B',
          brand: 'Watch',
          category: 'Watch',
          retailPrice: 249.99,
        }),
      });
      assert.strictEqual(resDecFloat.status, 422);

      // Must reject leading whitespace
      const resDecLeadingSpace = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Watch C',
          brand: 'Watch',
          category: 'Watch',
          retailPrice: ' 249.99',
        }),
      });
      assert.strictEqual(resDecLeadingSpace.status, 422);

      // Must reject trailing whitespace
      const resDecTrailingSpace = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Watch D',
          brand: 'Watch',
          category: 'Watch',
          retailPrice: '249.99 ',
        }),
      });
      assert.strictEqual(resDecTrailingSpace.status, 422);

      // Must reject invalid precision
      const resDecPrecision = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${alphaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Watch E',
          brand: 'Watch',
          category: 'Watch',
          retailPrice: '249.999',
        }),
      });
      assert.strictEqual(resDecPrecision.status, 422);

      markPassed('11. API-001R3 Security, Verification, and Exact-Decimal Tests');
    } catch (err) {
      markFailed('11. API-001R3 Security, Verification, and Exact-Decimal Tests', err);
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }

  console.log('\n----------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runApiHardeningTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
