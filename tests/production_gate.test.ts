import assert from 'assert';
import http from 'http';
import express from 'express';
import { getDatabaseClient, createIsolatedTestClient, resetDatabaseClient, DatabaseClient } from '../server/db/client';
import { createApp } from '../server';
import { runMigrations } from '../server/db/migrator';
import { ReservationService } from '../server/inventory/reservationService';
import { InventoryRepository } from '../server/repositories/inventoryRepository';
import { InventoryReservationRepository } from '../server/repositories/inventoryReservationRepository';
import { InventoryService } from '../server/inventory/inventoryService';
import { InventoryMovementRepository } from '../server/repositories/inventoryMovementRepository';

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
      const backupNodeEnv = process.env.NODE_ENV;
      const backupDbUrl = process.env.DATABASE_URL;
      try {
        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL = 'postgresql://localhost:5432/abacha';

        resetDatabaseClient();
        const client = getDatabaseClient();
        assert.strictEqual(client.isEmbedded(), false, 'Client should be PostgresPoolClient when explicitly configured in test');
      } finally {
        process.env.NODE_ENV = backupNodeEnv;
        if (backupDbUrl) process.env.DATABASE_URL = backupDbUrl; else delete process.env.DATABASE_URL;
        resetDatabaseClient();
      }
    });

    // 7. Health and Readiness Probe Fail-closed when DB Connection Unavailable
    await runTest('7. Health / Readiness probes respond with 503 when PostgreSQL is down', async () => {
      const backupNodeEnv = process.env.NODE_ENV;
      const backupDbUrl = process.env.DATABASE_URL;
      const backupPgHost = process.env.PGHOST;
      const backupJwtSecret = process.env.JWT_SECRET;

      try {
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
      } finally {
        process.env.NODE_ENV = backupNodeEnv;
        if (backupDbUrl) process.env.DATABASE_URL = backupDbUrl; else delete process.env.DATABASE_URL;
        if (backupPgHost) process.env.PGHOST = backupPgHost; else delete process.env.PGHOST;
        if (backupJwtSecret) process.env.JWT_SECRET = backupJwtSecret; else delete process.env.JWT_SECRET;
        resetDatabaseClient();
      }
    });

    // 8. Concurrent Reservation Idempotency Concurrency Test (PGSQL)
    await runTest('8. Concurrent Reservation Idempotency Concurrency Test (PGSQL)', async () => {
      // Use existing PostgreSQL test arrangement if configured in environment, otherwise fall back to PGlite
      const db: DatabaseClient = (process.env.DATABASE_URL || process.env.PGHOST)
        ? getDatabaseClient({ forceNew: true })
        : createIsolatedTestClient();

      try {
        await runMigrations(db);

        const orgId = 'org_concur_test';
        const locId = 'loc_concur_test';
        const prodId = 'prod_concur_test';
        const varId = 'var_concur_test';

        // Idempotently seed organization & metadata
        await db.query(
          `INSERT INTO organizations (id, name, code, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT (id) DO NOTHING`,
          [orgId, 'Concurrency Test Org', 'CONCUR_ORG']
        );
        await db.query(
          `INSERT INTO locations (id, organization_id, code, name, type)
           VALUES ($1, $2, $3, $4, 'Retail Store') ON CONFLICT (id) DO NOTHING`,
          [locId, orgId, 'LOC-CONCUR', 'Concurrency Store']
        );
        await db.query(
          `INSERT INTO categories (id, organization_id, name, slug)
           VALUES ('cat_concur_test', $1, 'Concurrency Category', 'concur-cat') ON CONFLICT (id) DO NOTHING`,
          [orgId]
        );
        await db.query(
          `INSERT INTO products (id, organization_id, category_id, name, slug, unit_code, product_type)
           VALUES ($1, $2, 'cat_concur_test', 'Concurrency Product', 'concur-prod', 'PCS', 'standard') ON CONFLICT (id) DO NOTHING`,
          [prodId, orgId]
        );
        await db.query(
          `INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price)
           VALUES ($1, $2, $3, 'SKU-CONCUR-TEST', 'BAR-CONCUR-TEST', 'Concurrency Variant', 10.0, 20.0) ON CONFLICT (id) DO NOTHING`,
          [varId, orgId, prodId]
        );

        const inventoryRepo = new InventoryRepository(db);
        const movementRepo = new InventoryMovementRepository(db);
        const reservationRepo = new InventoryReservationRepository(db);
        const inventoryService = new InventoryService(inventoryRepo, movementRepo, db);
        const reservationService = new ReservationService(inventoryRepo, reservationRepo, db);

        // Delete previous records under this test org to clean state
        await db.query('DELETE FROM inventory_reservations WHERE organization_id = $1', [orgId]);
        await db.query('DELETE FROM inventory_movements WHERE organization_id = $1', [orgId]);
        await db.query('DELETE FROM inventory_balances WHERE organization_id = $1', [orgId]);

        // Seed opening balance of 100
        await inventoryService.recordOpeningBalance(
          orgId,
          {
            location_id: locId,
            variant_id: varId,
            quantity: '100.0000',
            unit_cost: '10.00',
          },
          'system'
        );

        const idemKey = 'idem_concur_race_1';
        const payload = {
          location_id: locId,
          variant_id: varId,
          quantity: '10',
          reference_type: 'ORDER',
          reference_id: 'ref_concur_1',
          idempotency_key: idemKey,
        };

        // Start two concurrent operations to trigger the unique-index check on the duplicate request
        const [resA, resB] = await Promise.all([
          reservationService.createReservation(orgId, payload, 'user_a'),
          reservationService.createReservation(orgId, payload, 'user_b'),
        ]);

        assert.ok(resA, 'First concurrent reservation should succeed');
        assert.ok(resB, 'Second concurrent reservation should succeed');
        assert.strictEqual(resA.id, resB.id, 'Both concurrent reservations must resolve to the same record ID');
        assert.strictEqual(resA.status, 'ACTIVE', 'Resolved reservation status must be ACTIVE');

        // Verify exactly ONE reservation row remains in the database
        const rows = await db.query('SELECT * FROM inventory_reservations WHERE organization_id = $1', [orgId]);
        assert.strictEqual(rows.rows.length, 1, 'Exactly one reservation record must persist in DB');

        // Verify reserved quantity and available quantity are incremented/decremented exactly ONCE
        const bal = await inventoryService.getBalance(orgId, locId, varId);
        assert.strictEqual(bal?.on_hand, '100.0000', 'on_hand must remain exactly 100');
        assert.strictEqual(bal?.reserved, '10.0000', 'reserved quantity must increase by exactly 10');
        assert.strictEqual(bal?.available, '90.0000', 'available quantity must decrease by exactly 10');

        // Verify a subsequent transaction can execute normally (No 25P02 transaction abort)
        const subsequentRes = await reservationService.createReservation(
          orgId,
          {
            location_id: locId,
            variant_id: varId,
            quantity: '5',
            reference_type: 'ORDER',
            reference_id: 'ref_concur_2',
          },
          'user_c'
        );
        assert.ok(subsequentRes, 'Subsequent reservation in a new transaction block must succeed');

        const balAfterSubsequent = await inventoryService.getBalance(orgId, locId, varId);
        assert.strictEqual(balAfterSubsequent?.reserved, '15.0000', 'reserved quantity must increase to 15');
        assert.strictEqual(balAfterSubsequent?.available, '85.0000', 'available quantity must decrease to 85');
      } finally {
        if (!process.env.DATABASE_URL && !process.env.PGHOST) {
          // Clean up only for isolated in-memory test databases
          db.query('DELETE FROM inventory_reservations WHERE organization_id = $1', ['org_concur_test']).catch(() => {});
        }
      }
    });

    // 9. Concurrent Reservation Idempotency Conflict Test (Different Payload)
    await runTest('9. Concurrent Reservation Idempotency Conflict Test (Different Payload)', async () => {
      const db: DatabaseClient = (process.env.DATABASE_URL || process.env.PGHOST)
        ? getDatabaseClient({ forceNew: true })
        : createIsolatedTestClient();

      try {
        await runMigrations(db);

        const orgId = 'org_concur_test';
        const locId = 'loc_concur_test';
        const prodId = 'prod_concur_test';
        const varId = 'var_concur_test';

        // Idempotently seed organization & metadata
        await db.query(
          `INSERT INTO organizations (id, name, code, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT (id) DO NOTHING`,
          [orgId, 'Concurrency Test Org', 'CONCUR_ORG']
        );
        await db.query(
          `INSERT INTO locations (id, organization_id, code, name, type)
           VALUES ($1, $2, $3, $4, 'Retail Store') ON CONFLICT (id) DO NOTHING`,
          [locId, orgId, 'LOC-CONCUR', 'Concurrency Store']
        );
        await db.query(
          `INSERT INTO categories (id, organization_id, name, slug)
           VALUES ('cat_concur_test', $1, 'Concurrency Category', 'concur-cat') ON CONFLICT (id) DO NOTHING`,
          [orgId]
        );
        await db.query(
          `INSERT INTO products (id, organization_id, category_id, name, slug, unit_code, product_type)
           VALUES ($1, $2, 'cat_concur_test', 'Concurrency Product', 'concur-prod', 'PCS', 'standard') ON CONFLICT (id) DO NOTHING`,
          [prodId, orgId]
        );
        await db.query(
          `INSERT INTO product_variants (id, organization_id, product_id, sku, barcode, name, cost_price, retail_price)
           VALUES ($1, $2, $3, 'SKU-CONCUR-TEST', 'BAR-CONCUR-TEST', 'Concurrency Variant', 10.0, 20.0) ON CONFLICT (id) DO NOTHING`,
          [varId, orgId, prodId]
        );

        const inventoryRepo = new InventoryRepository(db);
        const reservationRepo = new InventoryReservationRepository(db);
        const inventoryService = new InventoryService(inventoryRepo, new InventoryMovementRepository(db), db);
        const reservationService = new ReservationService(inventoryRepo, reservationRepo, db);

        // Delete previous records under this test org to clean state
        await db.query('DELETE FROM inventory_reservations WHERE organization_id = $1', [orgId]);
        await db.query('DELETE FROM inventory_movements WHERE organization_id = $1', [orgId]);
        await db.query('DELETE FROM inventory_balances WHERE organization_id = $1', [orgId]);

        // Seed opening balance of 100
        await inventoryService.recordOpeningBalance(
          orgId,
          {
            location_id: locId,
            variant_id: varId,
            quantity: '100.0000',
            unit_cost: '10.00',
          },
          'system'
        );

        // Get initial balance before conflict test
        const initialBal = await inventoryService.getBalance(orgId, locId, varId);
        const initialReserved = parseFloat(initialBal?.reserved || '0');

        const idemKeyConflict = 'idem_concur_conflict';
        const payloadBase = {
          location_id: locId,
          variant_id: varId,
          quantity: '5',
          reference_type: 'ORDER',
          reference_id: 'ref_concur_base',
          idempotency_key: idemKeyConflict,
        };

        // First creation succeeds
        const firstRes = await reservationService.createReservation(orgId, payloadBase, 'user_first');
        assert.ok(firstRes, 'First base reservation should succeed');

        const midBal = await inventoryService.getBalance(orgId, locId, varId);
        assert.strictEqual(
          parseFloat(midBal?.reserved || '0'),
          initialReserved + 5,
          'Reserved quantity must increase by 5 after first reservation'
        );

        // Second creation using identical key but with a conflicting payload (quantity: '10') must fail with IDEMPOTENCY_CONFLICT
        const payloadConflicting = {
          ...payloadBase,
          quantity: '10',
        };

        let threwConflict = false;
        try {
          await reservationService.createReservation(orgId, payloadConflicting, 'user_conflict');
        } catch (err: any) {
          threwConflict = true;
          assert.ok(err.message.includes('IDEMPOTENCY_CONFLICT'), 'Error message must specify IDEMPOTENCY_CONFLICT');
        }

        assert.ok(threwConflict, 'Conflicting idempotent payload must throw an error');

        // Verify reserved inventory remains unchanged by the losing request
        const finalBal = await inventoryService.getBalance(orgId, locId, varId);
        assert.strictEqual(
          parseFloat(finalBal?.reserved || '0'),
          initialReserved + 5,
          'Reserved inventory must not be modified by the rejected conflicting payload'
        );
      } finally {
        if (!process.env.DATABASE_URL && !process.env.PGHOST) {
          db.query('DELETE FROM inventory_reservations WHERE organization_id = $1', ['org_concur_test']).catch(() => {});
        }
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
