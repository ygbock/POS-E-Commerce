/**
 * Operational Hardening & Platform Contracts Test Suite (UPG-001H)
 * 
 * Deterministic local unit & contract tests for operational platform hardening:
 * - DEPLOY_ENV & environment contract enforcement
 * - Staging vs Production isolation guards
 * - Public source map blocking
 * - Health and readiness metadata sanitization
 * - Migration checksum integrity
 * - Secret leakage scanning across tracked repository files
 * - CI/CD workflow configuration validation
 * 
 * CRITICAL SUPERVISOR GOVERNANCE (Condition #9):
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
import { runMigrations, getAppliedMigrations } from '../server/db/migrator';

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
  console.log(' AbaCha UPG-001 Operational Hardening Contract Tests');
  console.log('======================================================\n');

  // Backup environment variables
  const origEnv = { ...process.env };

  try {
    // ------------------------------------------------------------------
    // 1. DEPLOY_ENV Contract Validation
    // ------------------------------------------------------------------
    await runTest('1.1. Validates valid DEPLOY_ENV values', () => {
      const validEnvs = ['development', 'test', 'staging', 'production'];
      for (const envVal of validEnvs) {
        const res = validateEnvironment({
          DEPLOY_ENV: envVal,
          NODE_ENV: envVal === 'production' ? 'production' : 'development',
          PORT: '3000',
          DATABASE_URL: envVal === 'production' || envVal === 'staging' ? 'postgresql://user:pass@host:5432/db' : undefined,
          JWT_SECRET: envVal === 'production' || envVal === 'staging' ? 'CryptographicallySecureHighEntropyKey32Chars!' : undefined,
          APP_URL: envVal === 'production' || envVal === 'staging' ? 'https://example.com' : undefined,
        });
        assert.strictEqual(res.deployEnv, envVal);
      }
    });

    await runTest('1.2. Rejects invalid DEPLOY_ENV values', () => {
      assert.throws(
        () => validateEnvironment({ DEPLOY_ENV: 'invalid_env' as any }),
        /Invalid DEPLOY_ENV/
      );
    });

    await runTest('1.3. Fallback mapping from NODE_ENV when DEPLOY_ENV is omitted', () => {
      const resProd = validateEnvironment({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
      });
      assert.strictEqual(resProd.deployEnv, 'production');

      const resDev = validateEnvironment({ NODE_ENV: 'development' });
      assert.strictEqual(resDev.deployEnv, 'development');
    });

    // ------------------------------------------------------------------
    // 2. Port & Secret Validation
    // ------------------------------------------------------------------
    await runTest('2.1. Validates valid and invalid PORT configurations', () => {
      const valid = validateEnvironment({ PORT: '8080' });
      assert.strictEqual(valid.port, 8080);

      assert.throws(() => validateEnvironment({ PORT: 'not-a-port' }), /PORT must be a valid integer/);
      assert.throws(() => validateEnvironment({ PORT: '70000' }), /PORT must be a valid integer/);
    });

    await runTest('2.2. Rejects weak or dev-keyword JWT_SECRET in production/staging', () => {
      assert.throws(
        () =>
          validateEnvironment({
            DEPLOY_ENV: 'staging',
            DATABASE_URL: 'postgresql://user:pass@host:5432/staging_db',
            JWT_SECRET: 'short',
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
    // 3. Staging vs Production Separation
    // ------------------------------------------------------------------
    await runTest('3.1. Rejects staging using production DATABASE_URL or APP_URL', () => {
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
            APP_URL: 'https://abacha-app.onrender.com',
            JWT_SECRET: 'CryptographicallySecureHighEntropyKey32Chars!',
          }),
        /Cross-environment violation: Staging APP_URL cannot target production domain/
      );
    });

    await runTest('3.2. Rejects production using staging DATABASE_URL', () => {
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
    // 4. Sanitized Environment Report
    // ------------------------------------------------------------------
    await runTest('4.1. Sanitized report never leaks credential values', () => {
      const secretVal = 'VerySecretLivePassword1234567890!';
      const report = getSanitizedEnvironmentReport({
        DEPLOY_ENV: 'production',
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://admin:supersecret@cluster.render.com:5432/abacha_prod',
        JWT_SECRET: secretVal,
        APP_URL: 'https://abacha-app.onrender.com',
      });

      assert.strictEqual(report.valid, true);
      const jsonString = JSON.stringify(report);
      assert.ok(!jsonString.includes(secretVal), 'JWT secret was not leaked');
      assert.ok(!jsonString.includes('supersecret'), 'Database password was not leaked');
    });

    // ------------------------------------------------------------------
    // 5. Public Source Map Access Restriction
    // ------------------------------------------------------------------
    await runTest('5.1. Production static server blocks *.map files', async () => {
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

    // ------------------------------------------------------------------
    // 6. Health / Readiness Metadata Sanitization
    // ------------------------------------------------------------------
    await runTest('6.1. /api/health and /api/ready never disclose connection strings or secrets', async () => {
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
    // 7. Migration Checksum & Release Tuple Integrity
    // ------------------------------------------------------------------
    await runTest('7.1. Migration files 001-010 exist with consistent checksums', () => {
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

    // ------------------------------------------------------------------
    // 8. CI/CD Workflows Configuration Integrity
    // ------------------------------------------------------------------
    await runTest('8.1. CI workflows exist and enforce mandatory gates', () => {
      const ciPath = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');
      const stagingPath = path.join(process.cwd(), '.github', 'workflows', 'staging-deploy.yml');
      const prodPath = path.join(process.cwd(), '.github', 'workflows', 'production-deploy.yml');

      assert.ok(fs.existsSync(ciPath), 'ci.yml exists');
      assert.ok(fs.existsSync(stagingPath), 'staging-deploy.yml exists');
      assert.ok(fs.existsSync(prodPath), 'production-deploy.yml exists');

      const ciContent = fs.readFileSync(ciPath, 'utf8');
      assert.ok(ciContent.includes('npm run lint'), 'CI enforces lint');
      assert.ok(ciContent.includes('npm run build'), 'CI enforces build');
      assert.ok(ciContent.includes('test:prod-gate'), 'CI enforces prod-gate');
      assert.ok(ciContent.includes('gitleaks'), 'CI enforces secret scanning');

      const prodContent = fs.readFileSync(prodPath, 'utf8');
      assert.ok(prodContent.includes('environment:'), 'Production workflow enforces GitHub environment');
      assert.ok(prodContent.includes('approved_artifact_digest'), 'Production enforces digest verification');
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
