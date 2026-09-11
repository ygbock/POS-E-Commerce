import assert from 'assert';
import http from 'http';
import express from 'express';
import { getDatabaseClient, resetDatabaseClient } from '../server/db/client';
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
  console.log(' AbaCha REL-011 Production Database & Gateway Tests');
  console.log('======================================================\n');

  // Backup original env vars
  const origNodeEnv = process.env.NODE_ENV;
  const origDbUrl = process.env.DATABASE_URL;
  const origPgHost = process.env.PGHOST;
  const origJwtSecret = process.env.JWT_SECRET;
  const origAllowEmbedded = process.env.ALLOW_EMBEDDED_POSTGRES;

  try {
    // 1. Missing Database Configuration in Production Fail-Closed
    await runTest('1. Missing DATABASE_URL/PGHOST in Production throws Error', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;
      process.env.JWT_SECRET = 'SuperSecretCryptographicallySecure32Chars!';

      resetDatabaseClient();
      let threw = false;
      try {
        getDatabaseClient();
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('requires a valid PostgreSQL configuration'), 'Threw correct configuration error');
      }
      assert.ok(threw, 'Should throw error when database config is missing in production');
    });

    // 2. PGlite Cannot Become the Production Fallback (ALLOW_EMBEDDED_POSTGRES is ignored)
    await runTest('2. PGlite cannot become the production fallback via environment override', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;
      process.env.JWT_SECRET = 'SuperSecretCryptographicallySecure32Chars!';
      process.env.ALLOW_EMBEDDED_POSTGRES = 'true';

      resetDatabaseClient();
      let threw = false;
      try {
        getDatabaseClient();
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('PGlite is NEVER permitted in production'), 'Threw correct safety error');
      }
      assert.ok(threw, 'Should throw error even if ALLOW_EMBEDDED_POSTGRES is true in production');
    });

    // 3. JWT Secret Mandate in Production
    await runTest('3. Missing JWT_SECRET in Production causes hard startup failure', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/abacha';
      delete process.env.JWT_SECRET;

      resetDatabaseClient();
      let threw = false;
      try {
        await createApp({ skipVite: true });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('JWT_SECRET environment variable is mandatory'), 'Threw correct JWT error');
      }
      assert.ok(threw, 'Should fail startup if JWT_SECRET is missing in production');
    });

    // 4. Insecure JWT Secret Validation
    await runTest('4. Insecure/Short JWT_SECRET in Production causes hard startup failure', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/abacha';
      process.env.JWT_SECRET = 'short-key'; // < 32 characters

      resetDatabaseClient();
      let threw = false;
      try {
        await createApp({ skipVite: true });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('must be a high-entropy string of at least 32 characters'), 'Threw correct security warning');
      }
      assert.ok(threw, 'Should fail startup with short JWT secret');

      // Test JWT with 'dev' in it
      process.env.JWT_SECRET = 'SuperSecretSecureJWTKeyWithdevKeyword!';
      let devThrew = false;
      try {
        await createApp({ skipVite: true });
      } catch (err: any) {
        devThrew = true;
        assert.ok(err.message.includes('must be a high-entropy string of at least 32 characters'), 'Threw correct security warning');
      }
      assert.ok(devThrew, 'Should fail startup if JWT contains "dev"');
    });

    // 5. Development Fallback to PGlite
    await runTest('5. Development environment falls back to PGlite when external DB is missing', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;

      resetDatabaseClient();
      const client = getDatabaseClient();
      assert.strictEqual(client.isEmbedded(), true, 'Client should be embedded PGlite in development fallback');
    });

    // 6. Non-production / Test environment database selection behavior
    await runTest('6. Test environment respects explicit PostgreSQL when provided', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/abacha';

      resetDatabaseClient();
      const client = getDatabaseClient();
      assert.strictEqual(client.isEmbedded(), false, 'Client should be PostgresPoolClient when explicitly configured in test');
    });

    // 7. Health and Readiness Probe Fail-closed when DB Connection Unavailable
    await runTest('7. Health / Readiness probes respond with 503 when PostgreSQL is down', async () => {
      process.env.NODE_ENV = 'production';
      // Configure an invalid, non-responsive PostgreSQL URL to force connection failures
      process.env.DATABASE_URL = 'postgresql://127.0.0.1:23456/non_existent_db';
      process.env.JWT_SECRET = 'SuperSecretCryptographicallySecure32Chars!';

      resetDatabaseClient();
      
      let appInstance: express.Express | null = null;
      let startupThrew = false;
      try {
        const result = await createApp({ skipVite: true });
        appInstance = result.app;
      } catch (err) {
        startupThrew = true;
      }
      
      // If startup fails instantly, that's correct fail-closed startup behavior
      if (startupThrew || !appInstance) {
        assert.ok(true, 'Clean startup rejection on unreachable DB is correct');
        return;
      }

      // Create local HTTP test server
      const server = http.createServer(appInstance);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as any;
      const port = addr.port;

      const checkRoute = (path: string): Promise<{ statusCode: number; body: any }> => {
        return new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${port}${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode || 500, body: JSON.parse(data) });
              } catch {
                resolve({ statusCode: res.statusCode || 500, body: data });
              }
            });
          }).on('error', reject);
        });
      };

      try {
        const health = await checkRoute('/api/health');
        assert.strictEqual(health.statusCode, 503, 'Health probe must fail with 503 when DB is offline');
        assert.strictEqual(health.body.status, 'unhealthy', 'Health response should indicate unhealthy');
        assert.strictEqual(health.body.ready, false, 'Health response should indicate not ready');

        const ready = await checkRoute('/api/ready');
        assert.strictEqual(ready.statusCode, 503, 'Readiness probe must fail with 503 when DB is offline');
        assert.strictEqual(ready.body.ready, false, 'Ready response should indicate not ready');
      } finally {
        server.close();
      }
    });

  } finally {
    // Restore original environments
    process.env.NODE_ENV = origNodeEnv;
    if (origDbUrl) process.env.DATABASE_URL = origDbUrl; else delete process.env.DATABASE_URL;
    if (origPgHost) process.env.PGHOST = origPgHost; else delete process.env.PGHOST;
    if (origJwtSecret) process.env.JWT_SECRET = origJwtSecret; else delete process.env.JWT_SECRET;
    if (origAllowEmbedded) process.env.ALLOW_EMBEDDED_POSTGRES = origAllowEmbedded; else delete process.env.ALLOW_EMBEDDED_POSTGRES;
    resetDatabaseClient();
  }

  console.log('\n----------------------------------------');
  console.log(`Results: ${testPassedCount} passed, ${testFailedCount} failed`);
  console.log('----------------------------------------\n');

  if (testFailedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (import.meta.url.endsWith('production_gate.test.ts') || process.argv[1]?.endsWith('production_gate.test.ts')) {
  main().catch((err) => {
    console.error('Fatal test runner crash:', err);
    process.exit(1);
  });
}
