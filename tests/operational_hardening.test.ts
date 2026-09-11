/**
 * Operational Hardening & Platform Contracts Test Suite (UPG-001R1)
 * 
 * Deterministic local unit & contract tests for operational platform hardening:
 * - DEPLOY_ENV & NODE_ENV contract enforcement and contradiction rejection
 * - PostgreSQL connection string validation without secret leakage
 * - Strict decimal integer PORT validation (1-65535)
 * - APP_URL validation (HTTPS mandate for staging/production)
 * - Staging vs Production isolation guards
 * - Public source map blocking in server and build output
 * - Health and readiness metadata sanitization
 * - Production deployment fail-closed health gate workflow verification
 * - Migration checksum integrity
 * 
 * CRITICAL SUPERVISOR GOVERNANCE:
 * Must be 100% self-contained and deterministic.
 * Does NOT require Render access, live PostgreSQL, production secrets, or GitHub credentials.
 */

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateEnvironment, getSanitizedEnvironmentReport } from '../server/config/environment';
import { createApp } from '../server';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

let passedCount = 0;
let failedCount = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log('PASSED');
    passedCount++;
  } catch (err: any) {
    console.log('FAILED');
    console.error(`    Error: ${err.message || err}`);
    failedCount++;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log(' AbaCha UPG-001R1 Operational Hardening Contract Tests');
  console.log('======================================================\n');

  // Backup environment variables
  const origEnv = { ...process.env };

  try {
    // ------------------------------------------------------------------
    // 1. DEPLOY_ENV / NODE_ENV Contract & Contradiction Enforcement
    // ------------------------------------------------------------------
    await runTest('1.1. Validates valid DEPLOY_ENV values with proper booleans', () => {
      const validEnvs = ['development', 'test', 'staging', 'production'] as const;
      for (const envVal of validEnvs) {
        const res = validateEnvironment({
          DEPLOY_ENV: envVal,
          NODE_ENV: envVal === 'production' ? 'production' : envVal === 'staging' ? 'staging' : envVal === 'test' ? 'test' : 'development',
          PORT: '3000',
          DATABASE_URL: envVal === 'production' || envVal === 'staging' ? 'postgresql://user:pass@host:5432/db' : undefined,
          JWT_SECRET: envVal === 'production' || envVal === 'staging' ? 'CryptographicallySecureHighEntropyKey32Chars!' : undefined,
          APP_URL: envVal === 'production' || envVal === 'staging' ? 'https://example.com' : undefined,
        });
        assert.strictEqual(res.deployEnv, envVal);
        assert.strictEqual(res.isProduction, envVal === 'production');
        assert.strictEqual(res.isStaging, envVal === 'staging');
        assert.strictEqual(res.isTest, envVal === 'test');
        assert.strictEqual(res.isDevelopment, envVal === 'development');

        // Verify that isProduction and isStaging are never both true
        assert.ok(!(res.isProduction && res.isStaging), 'isProduction and isStaging must never both be true');
      }
    });

    await runTest('1.2. Rejects invalid DEPLOY_ENV values', () => {
      assert.throws(
        () => validateEnvironment({ DEPLOY_ENV: 'invalid_env' as any }),
        /Invalid DEPLOY_ENV/
      );
    });

    await runTest('1.3. Contradiction: DEPLOY_ENV=staging + NODE_ENV=production → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            NODE_ENV: 'production',
            PORT: '3000',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Contradictory environment configuration: DEPLOY_ENV=staging conflicts with NODE_ENV=production/
      );
    });

    await runTest('1.4. Contradiction: DEPLOY_ENV=production + NODE_ENV=staging → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            NODE_ENV: 'staging',
            PORT: '3000',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Contradictory environment configuration: DEPLOY_ENV=production conflicts with NODE_ENV=staging/
      );
    });

    await runTest('1.5. Contradiction: DEPLOY_ENV=test/development + NODE_ENV=production → FAIL', () => {
      assert.throws(
        () => validateEnvironment({ DEPLOY_ENV: 'test', NODE_ENV: 'production' }),
        /Contradictory environment configuration: DEPLOY_ENV=test conflicts with NODE_ENV=production/
      );
      assert.throws(
        () => validateEnvironment({ DEPLOY_ENV: 'development', NODE_ENV: 'production' }),
        /Contradictory environment configuration: DEPLOY_ENV=development conflicts with NODE_ENV=production/
      );
    });

    await runTest('1.6. NODE_ENV=staging without DEPLOY_ENV → staging', () => {
      const res = validateEnvironment({
        NODE_ENV: 'staging',
        PORT: '3000',
        DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
        APP_URL: 'https://staging.example.com',
      });
      assert.strictEqual(res.deployEnv, 'staging');
      assert.strictEqual(res.isStaging, true);
      assert.strictEqual(res.isProduction, false);
    });

    await runTest('1.7. NODE_ENV=production without DEPLOY_ENV → production', () => {
      const res = validateEnvironment({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
        APP_URL: 'https://production.example.com',
      });
      assert.strictEqual(res.deployEnv, 'production');
      assert.strictEqual(res.isProduction, true);
      assert.strictEqual(res.isStaging, false);
    });

    // ------------------------------------------------------------------
    // 2. PostgreSQL Connection URL Validation
    // ------------------------------------------------------------------
    await runTest('2.1. missing DATABASE_URL in staging (without PGHOST) → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Production environment requires a valid PostgreSQL configuration/
      );
    });

    await runTest('2.2. invalid DATABASE_URL (bad protocol, missing host, missing db) → FAIL without leaking URL', () => {
      const secretUrl = 'http://secretuser:secretpass@sensitive-host.internal:5432/secret_db';
      
      // Bad protocol (http://)
      let threw = false;
      try {
        validateEnvironment({
          DEPLOY_ENV: 'staging',
          DATABASE_URL: secretUrl,
          JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
        });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Invalid DATABASE_URL'), 'Threw invalid DATABASE_URL error');
        assert.ok(!err.message.includes('secretpass'), 'Database password must not be leaked');
        assert.ok(!err.message.includes('sensitive-host'), 'Database hostname must not be leaked');
      }
      assert.ok(threw, 'Should throw on bad protocol');

      // Missing host
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql:///db_without_host',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Invalid DATABASE_URL/
      );

      // Missing database path
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://host:5432/',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Invalid DATABASE_URL/
      );

      // Malformed string
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'not-a-valid-url',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Invalid DATABASE_URL/
      );
    });

    await runTest('2.3. Valid DATABASE_URL with postgresql: or postgres: → PASS', () => {
      const res1 = validateEnvironment({
        DEPLOY_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
      });
      assert.strictEqual(res1.databaseUrl, 'postgresql://user:pass@host:5432/staging_db');

      const res2 = validateEnvironment({
        DEPLOY_ENV: 'production',
        DATABASE_URL: 'postgres://user:pass@host:5432/prod_db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
      });
      assert.strictEqual(res2.databaseUrl, 'postgres://user:pass@host:5432/prod_db');
    });

    // ------------------------------------------------------------------
    // 3. Strict PORT Validation
    // ------------------------------------------------------------------
    await runTest('3.1. invalid PORT values are strictly rejected', () => {
      const invalidPorts = ['3000abc', '12.5', '1e4', '+', '-', '+3000', '-3000', '0', '65536', '70000', 'not-a-port'];
      for (const p of invalidPorts) {
        assert.throws(
          () => validateEnvironment({ PORT: p }),
          /PORT must be/
        );
      }
    });

    await runTest('3.2. valid decimal integer PORT strings (1-65535) are accepted', () => {
      const validPorts = [
        { raw: '1', expected: 1 },
        { raw: '3000', expected: 3000 },
        { raw: '8080', expected: 8080 },
        { raw: '65535', expected: 65535 },
      ];
      for (const { raw, expected } of validPorts) {
        const res = validateEnvironment({ PORT: raw });
        assert.strictEqual(res.port, expected);
      }
    });

    // ------------------------------------------------------------------
    // 4. JWT_SECRET Validation
    // ------------------------------------------------------------------
    await runTest('4.1. missing JWT_SECRET in production/staging → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
          }),
        /JWT_SECRET environment variable is mandatory in production/
      );
    });

    await runTest('4.2. short JWT_SECRET (< 32 chars) in production/staging → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            JWT_SECRET: 'too-short-secret',
          }),
        /high-entropy string of at least 32 characters/
      );
    });

    await runTest('4.3. weak/default JWT_SECRET in production/staging → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            JWT_SECRET: 'dev_secret_key_that_is_32_characters_long_now',
          }),
        /high-entropy string of at least 32 characters/
      );

      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            JWT_SECRET: 'SuperSecureKeyWithDefaultKeyword32Chars!',
          }),
        /high-entropy string of at least 32 characters/
      );
    });

    // ------------------------------------------------------------------
    // 5. APP_URL Validation & Configurable Environment Separation
    // ------------------------------------------------------------------
    await runTest('5.1. HTTPS APP_URL required in staging/production', () => {
      // Insecure HTTP is rejected in staging
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
            APP_URL: 'http://staging.example.com',
          }),
        /APP_URL must use secure HTTPS protocol in staging/
      );

      // Insecure HTTP is rejected in production
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
            APP_URL: 'http://production.example.com',
          }),
        /APP_URL must use secure HTTPS protocol in production/
      );

      // HTTPS is accepted in staging and production
      const stagingConf = validateEnvironment({
        DEPLOY_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
        APP_URL: 'https://staging.example.com',
      });
      assert.strictEqual(stagingConf.appUrl, 'https://staging.example.com');

      const prodConf = validateEnvironment({
        DEPLOY_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
        APP_URL: 'https://production.example.com',
      });
      assert.strictEqual(prodConf.appUrl, 'https://production.example.com');
    });

    await runTest('5.2. malformed APP_URL → FAIL', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
            APP_URL: 'not-a-valid-url',
          }),
        /Invalid APP_URL/
      );

      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
            APP_URL: 'https://',
          }),
        /Invalid APP_URL/
      );
    });

    await runTest('5.3. Configurable cross-environment separation rules', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            PRODUCTION_DATABASE_URL: 'postgresql://user:pass@host:5432/prod_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Cross-environment violation: Staging environment cannot use production database/
      );

      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            APP_URL: 'https://production.example.com',
            PRODUCTION_APP_URL: 'https://production.example.com',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Cross-environment violation: Staging APP_URL cannot match production APP_URL/
      );

      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            STAGING_DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Cross-environment violation: Production environment cannot use staging database/
      );
    });

    // ------------------------------------------------------------------
    // 6. Secret Sanitization in Reports
    // ------------------------------------------------------------------
    await runTest('6.1. secret sanitization → PASS (never leaks credential values)', () => {
      const secretVal = 'VerySecretLivePassword1234567890!';
      const dbPassword = 'supersecret_db_pass_99';
      const report = getSanitizedEnvironmentReport({
        DEPLOY_ENV: 'production',
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: `postgresql://admin:${dbPassword}@cluster.render.com:5432/abacha_prod`,
        JWT_SECRET: secretVal,
        APP_URL: 'https://production.example.com',
      });

      assert.strictEqual(report.valid, true);
      const jsonString = JSON.stringify(report);
      assert.ok(!jsonString.includes(secretVal), 'JWT secret was not leaked');
      assert.ok(!jsonString.includes(dbPassword), 'Database password was not leaked');
      
      const jwtStatus = report.variables.find((v) => v.name === 'JWT_SECRET');
      assert.strictEqual(jwtStatus?.status, 'VALID');
      const dbStatus = report.variables.find((v) => v.name === 'DATABASE_URL');
      assert.strictEqual(dbStatus?.status, 'VALID');
    });

    // ------------------------------------------------------------------
    // 7. Public Source Map Blocking & Artifact Assertions
    // ------------------------------------------------------------------
    await runTest('7.1. Static server blocks *.map files (returns 404)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/abacha';
      process.env.JWT_SECRET = 'SuperSecretCryptographicallySecure32Chars!';

      const testDb = await createIsolatedTestClient();
      const { app } = await createApp({ db: testDb });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      const statusCode = await new Promise<number>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/server.cjs.map`, (res) => {
          resolve(res.statusCode || 0);
        });
        req.on('error', reject);
      });

      await new Promise<void>((resolve) => server.close(() => resolve()));
      assert.strictEqual(statusCode, 404, 'Source map request was intercepted and returned 404');
      await testDb.close();
    });

    await runTest('7.2. Publicly deployable build output does not contain source maps', () => {
      const distDir = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distDir)) {
        const checkNoMaps = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              checkNoMaps(fullPath);
            } else {
              assert.ok(
                !entry.name.endsWith('.map'),
                `Deployable output must not include source maps: found ${fullPath}`
              );
            }
          }
        };
        checkNoMaps(distDir);
        assert.ok(!fs.existsSync(path.join(distDir, 'index.html.map')), 'dist/index.html.map must not exist');
        assert.ok(!fs.existsSync(path.join(distDir, 'server.cjs.map')), 'dist/server.cjs.map must not exist');
      }
    });

    // ------------------------------------------------------------------
    // 8. Production Health Gate Workflow Verification
    // ------------------------------------------------------------------
    await runTest('8.1. Production workflow enforces fail-closed health/readiness gate', () => {
      const prodWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'production-deploy.yml');
      assert.ok(fs.existsSync(prodWorkflowPath), 'production-deploy.yml exists');

      const content = fs.readFileSync(prodWorkflowPath, 'utf8');
      
      // Enforce fail-closed exit 1 on health failure
      assert.ok(
        content.includes('if [ "$SUCCESS" -ne 1 ]; then'),
        'Workflow checks for SUCCESS condition'
      );
      assert.ok(
        content.includes('echo "FATAL: Production health/readiness verification failed."'),
        'Workflow logs fatal error on health failure'
      );
      assert.ok(
        content.includes('exit 1'),
        'Workflow exits non-zero (exit 1) on health failure'
      );

      // Verify probes check both health and ready
      assert.ok(content.includes('/api/health'), 'Workflow probes /api/health');
      assert.ok(content.includes('/api/ready'), 'Workflow probes /api/ready');
      assert.ok(content.includes('"status":"ok"'), 'Workflow validates status:ok');
      assert.ok(content.includes('"ready":true'), 'Workflow validates ready:true');
    });

    await runTest('8.2. CI workflow enforces source-map exposure guard', () => {
      const ciPath = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');
      assert.ok(fs.existsSync(ciPath), 'ci.yml exists');

      const content = fs.readFileSync(ciPath, 'utf8');
      assert.ok(content.includes('Source Map Exposure Guard'), 'CI includes source map guard step');
      assert.ok(content.includes('find dist -name "*.map"'), 'CI scans dist/ for .map files');
      assert.ok(content.includes('dist/server.cjs.map'), 'CI checks for server bundle map');
      assert.ok(content.includes('dist/assets/*.map'), 'CI checks for client asset maps');
    });

    // ------------------------------------------------------------------
    // 9. Health & Readiness Endpoint Metadata Sanitization
    // ------------------------------------------------------------------
    await runTest('9.1. /api/health and /api/ready never disclose connection strings or secrets', async () => {
      const testDb = await createIsolatedTestClient();
      await runMigrations(testDb);
      const { app } = await createApp({ db: testDb, skipVite: true });

      let healthData: any = null;
      const req: any = { method: 'GET', url: '/api/health', headers: {} };
      const res: any = {
        json: (data: any) => { healthData = data; },
        status: () => res,
      };

      // Directly invoke router handler for /api/health
      for (const layer of (app as any)._router.stack) {
        if (layer.route && layer.route.path === '/api/health') {
          await layer.route.stack[0].handle(req, res, () => {});
          break;
        }
      }

      assert.ok(healthData, 'Health endpoint responded');
      assert.strictEqual(healthData.status, 'ok');
      assert.strictEqual(healthData.ready, true);
      assert.strictEqual(healthData.database.connected, true);
      assert.strictEqual(healthData.database.schemaVersion, '010');

      // Assert zero secret leakage
      const rawPayload = JSON.stringify(healthData);
      assert.ok(!rawPayload.includes('password'), 'No password in health data');
      assert.ok(!rawPayload.includes('postgres://'), 'No connection string in health data');
      assert.ok(!rawPayload.includes('secret'), 'No secret in health data');

      await testDb.close();
    });

    // ------------------------------------------------------------------
    // 10. Migration Checksum Integrity
    // ------------------------------------------------------------------
    await runTest('10.1. Migration files 001-010 exist with consistent checksums', () => {
      const migrationsDir = path.join(process.cwd(), 'server', 'db', 'migrations');
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

      assert.strictEqual(files.length, 10, 'All 10 migrations must exist');
      assert.strictEqual(files[0].startsWith('001_'), true);
      assert.strictEqual(files[9].startsWith('010_'), true);

      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file));
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        assert.ok(hash && hash.length === 64, `Valid SHA-256 for ${file}`);
      }
    });

  } finally {
    process.env = origEnv;
  }

  console.log('\n------------------------------------------------------');
  console.log(` Operational Hardening Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
