import assert from 'assert';
import express from 'express';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';

async function requestJson(baseUrl: string, path: string) {
  const response = await fetch(baseUrl + path);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query(
    `INSERT INTO organizations (id,name,code,is_active)
     VALUES ('disc_prod_org','Discovery Production Gate','DISC_PROD',TRUE)
     ON CONFLICT (id) DO NOTHING`,
  );

  await db.query(
    `INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ('disc-prod-user','disc_prod_org','disc-prod@test.local','Discovery Production Gate','hash','salt','admin',TRUE)
     ON CONFLICT (id) DO NOTHING`,
  );

  await db.query(
    `INSERT INTO discovery_businesses
      (id,public_id,name,slug,business_type,business_mode,listing_status,verification_status,is_discoverable,organization_id,created_by_user_id,phone)
     VALUES ('disc_prod_business','DISC-PROD-1','Production Gate Business','production-gate-business','Services','DISCOVERY_ONLY','PUBLISHED','VERIFIED',TRUE,'disc_prod_org','disc-prod-user','+23276123456')
     ON CONFLICT (id) DO NOTHING`,
  );

  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Production readiness test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const invalidLimit = await requestJson(baseUrl, '/api/discovery/search?limit=not-a-number');
    assert.strictEqual(invalidLimit.response.status, 422);
    assert.strictEqual(invalidLimit.body?.error?.code, 'VALIDATION_ERROR');

    const invalidOffset = await requestJson(baseUrl, '/api/discovery/search?offset=10001');
    assert.strictEqual(invalidOffset.response.status, 422);
    assert.strictEqual(invalidOffset.body?.error?.code, 'VALIDATION_ERROR');

    const bounded = await requestJson(baseUrl, '/api/discovery/search?limit=100&offset=0');
    assert.strictEqual(bounded.response.status, 200);
    assert.strictEqual(Number(bounded.body?.counts?.businesses || 0), 1);
    assert.ok(
      Number(bounded.body?.data?.businesses?.[0]?.resultPosition || 0) >= 1,
      'search results must expose deterministic attribution positions',
    );

    const listing = await requestJson(baseUrl, '/api/discovery/businesses?limit=1&offset=0');
    assert.strictEqual(listing.response.status, 200);
    assert.strictEqual(listing.body?.data?.length, 1);
    assert.strictEqual(listing.response.headers.get('ratelimit-limit'), '120');
    assert.ok(listing.response.headers.get('ratelimit-remaining') !== null);

    const categories = await requestJson(baseUrl, '/api/discovery/categories');
    assert.strictEqual(categories.response.status, 200);
    assert.strictEqual(categories.response.headers.get('ratelimit-limit'), '120');

    const discoverySource = await import('node:fs/promises').then((fs) => fs.readFile('./server/routes/discoveryRoutes.ts', 'utf8'));
    assert.match(discoverySource, /DISCOVERY_MAX_OFFSET = 10000/);
    assert.match(discoverySource, /parseDiscoveryInteger\(req\.query\.limit/);
    assert.match(discoverySource, /router\.get\('\/businesses', discoverySearchRateLimiter/);
    assert.match(discoverySource, /router\.get\('\/categories', discoverySearchRateLimiter/);

    console.log('Discovery production readiness hardening tests passed.');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
