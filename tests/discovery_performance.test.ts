import assert from 'assert';
import express from 'express';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query(
    `INSERT INTO organizations (id,name,code,slug) VALUES ('perf_discovery_org','Discovery Performance Fixture','PERF-DISCOVERY','perf-discovery-fixture') ON CONFLICT (id) DO NOTHING`,
  );

  await db.query(
    `INSERT INTO users
     (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ('perf-user','perf_discovery_org','perf-user@test.local','Discovery Performance Fixture','hash','salt','admin',TRUE)`,
  );

  for (let i = 0; i < 300; i += 1) {
    await db.query(
      `INSERT INTO discovery_businesses
       (id,public_id,name,slug,business_type,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id)
       VALUES($1,$2,$3,$4,'Services','DISCOVERY_ONLY','PUBLISHED',$5,TRUE,'perf-user')`,
      [`perf_business_${i}`,`PERF-${i}`,i % 3 === 0 ? `Freetown Solar Solutions ${i}` : `Local Service Business ${i}`,`perf-business-${i}`,i % 5 === 0 ? 'VERIFIED' : 'UNVERIFIED'],
    );
  }

  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Performance test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const timings: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      const response = await fetch(baseUrl + '/api/discovery/search?q=solar&type=businesses&limit=20');
      const elapsed = performance.now() - started;
      assert.strictEqual(response.status, 200);
      timings.push(elapsed);
      await response.json();
    }

    timings.sort((a,b) => a-b);
    const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];
    const max = timings[timings.length - 1];
    assert.ok(p95 < 1500, `Discovery search p95 should remain below 1500ms in the isolated 300-listing fixture; observed ${p95.toFixed(1)}ms`);
    assert.ok(max < 2500, `Discovery search max should remain below 2500ms in the isolated fixture; observed ${max.toFixed(1)}ms`);

    console.log(`Discovery performance test passed: p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
