import assert from 'node:assert';
import express from 'express';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';

async function requestJson(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(baseUrl + path, init);
  const body = await response.json() as any;
  return { response, status: response.status, body };
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_analytics_org','Analytics Org','DISC_ANALYTICS',TRUE)");
  await db.query(
    `INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ('disc-analytics-owner','disc_analytics_org','disc-analytics-owner@test.local','Discovery Analytics Owner','hash','salt','admin',TRUE)`,
  );

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const actor = { userId: 'disc-analytics-owner', role: 'admin', organizationId: 'disc_analytics_org' };

  const business = await service.create({
    name: 'Analytics Verification Hub',
    shortDescription: 'Analytics test business',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_analytics_org',
  }, actor);

  await db.query(
    "INSERT INTO discovery_business_category_map (business_id,category_id,is_primary) VALUES ($1,'disc_cat_electronics',TRUE)",
    [business.id],
  );
  await db.query(
    "INSERT INTO discovery_business_locations (id,business_id,name,city,region,latitude,longitude,is_primary,is_active) VALUES ('disc_analytics_loc',$1,'Analytics Branch','Freetown','Western Area',8.4840,-13.2299,TRUE,TRUE)",
    [business.id],
  );
  await db.query(
    "INSERT INTO products (id,organization_id,name,status,channels_ecommerce) VALUES ('disc_analytics_product','disc_analytics_org','Analytics Phone','active',TRUE)",
  );

  for (const step of ['submit', 'review', 'approve', 'publish'] as const) await (service as any)[step](business.id, actor);

  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    const raw = String(err?.message || 'error');
    const code = raw.split(':')[0];
    const status = code === 'NOT_FOUND' ? 404 : code === 'VALIDATION_ERROR' ? 422 : 500;
    res.status(status).json({ success: false, error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw } });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const eventId = 'evt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const first = await requestJson(baseUrl, '/api/discovery/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        eventType: 'VIEW',
        businessId: business.id,
        metadata: { source: 'profile' },
      }),
    });
    assert.strictEqual(first.status, 202);
    assert.strictEqual(first.body.data.recorded, true);
    assert.match(String(first.response.headers.get('set-cookie')), /discovery_sid=/);

    const duplicate = await requestJson(baseUrl, '/api/discovery/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        eventType: 'VIEW',
        businessId: business.id,
        metadata: { source: 'profile' },
      }),
    });
    assert.strictEqual(duplicate.status, 202);
    assert.strictEqual(duplicate.body.data.recorded, false);

    const stored = await db.query(
      "SELECT event_type,business_id,session_hash,metadata FROM discovery_analytics_events WHERE id=$1",
      [eventId],
    );
    assert.strictEqual(stored.rows.length, 1);
    assert.strictEqual(stored.rows[0].event_type, 'VIEW');
    assert.strictEqual(stored.rows[0].business_id, business.id);
    assert.match(String(stored.rows[0].session_hash), /^[a-f0-9]{64}$/);

    const productView = await requestJson(baseUrl, '/api/discovery/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        eventType: 'PRODUCT_VIEW',
        businessId: business.id,
        productId: 'disc_analytics_product',
      }),
    });
    assert.strictEqual(productView.status, 202);

    const foreignProduct = await requestJson(baseUrl, '/api/discovery/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_cccccccccccccccccccccccccccccccc',
        eventType: 'PRODUCT_VIEW',
        businessId: business.id,
        productId: 'missing-product',
      }),
    });
    assert.strictEqual(foreignProduct.status, 404);

    const missingService = await requestJson(baseUrl, '/api/discovery/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_dddddddddddddddddddddddddddddddd',
        eventType: 'SERVICE_VIEW',
        businessId: business.id,
      }),
    });
    assert.strictEqual(missingService.status, 422);

    const oversized = await requestJson(baseUrl, '/api/discovery/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        eventType: 'CONTACT',
        businessId: business.id,
        metadata: { payload: 'x'.repeat(8200) },
      }),
    });
    assert.strictEqual(oversized.status, 422);

    console.log('Discovery analytics event verification tests passed.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
