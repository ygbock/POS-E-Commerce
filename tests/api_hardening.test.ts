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
import { classifyApiError, sanitizeApiErrorMessage, buildApiErrorResponse } from '../server/utils/errorSanitizer';

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
          // Malicious attempt to create user in another organization
          organizationId: 'org_api_beta',
        }),
      });
      assert.strictEqual(res2e.status, 201);
      const body2e = await res2e.json();
      assert.strictEqual(body2e.success, true);
      assert.strictEqual(body2e.data.organizationId, 'org_api_alpha', 'Tenant must be bound to authenticated caller, ignoring body override');

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
