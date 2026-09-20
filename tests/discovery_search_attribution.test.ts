import assert from 'assert';
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
  return { status: response.status, body };
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_attr_org','Attribution Org','DISC_ATTR',TRUE)");

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const actor = { userId: 'disc-attr-owner', role: 'admin', organizationId: 'disc_attr_org' };

  const business = await service.create({
    name: 'Attribution Mobile Hub',
    shortDescription: 'Phones and repairs',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_attr_org',
  }, actor);
  for (const step of ['submit', 'review', 'approve', 'publish'] as const) await (service as any)[step](business.id, actor);
  await db.query(
    "INSERT INTO discovery_business_locations (id,business_id,name,city,is_primary,is_active) VALUES ('disc_attr_loc',$1,'Main Branch','Freetown',TRUE,TRUE)",
    [business.id],
  );

  const hidden = await service.create({
    name: 'Attribution Hidden',
    shortDescription: 'Never public',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_attr_org',
  }, actor);

  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    const raw = String(err?.message || 'error');
    const code = raw.split(':')[0];
    res.status(code === 'VALIDATION_ERROR' ? 422 : 500).json({ success: false, error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw } });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const search = await requestJson(baseUrl, '/api/discovery/search?q=mobile&type=businesses&limit=10');
    assert.strictEqual(search.status, 200);
    assert.match(search.body.searchId, /^search_[a-f0-9]{32}$/);
    const result = search.body.data.businesses.find((row: any) => row.id === business.id);
    assert.ok(result, 'published business should be returned');
    assert.strictEqual(result.searchId, search.body.searchId);
    assert.ok(result.resultPosition >= 1);

    const eventId = 'evt_0123456789abcdef0123456789abcdef';
    const payload = {
      eventId,
      eventType: 'IMPRESSION',
      searchId: search.body.searchId,
      entityType: 'BUSINESS',
      entityId: business.id,
      resultPosition: result.resultPosition,
      source: 'search_results',
    };
    const first = await requestJson(baseUrl, '/api/discovery/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(first.status, 202);
    assert.strictEqual(first.body.data.results[0].recorded, true);

    const duplicate = await requestJson(baseUrl, '/api/discovery/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(duplicate.status, 202);
    assert.strictEqual(duplicate.body.data.results[0].recorded, false);

    const stored = await db.query(
      "SELECT event_type,search_id,entity_type,entity_id,result_position,attribution_source,metadata FROM discovery_analytics_events WHERE id=$1",
      [eventId],
    );
    assert.strictEqual(stored.rows.length, 1);
    assert.strictEqual(stored.rows[0].search_id, search.body.searchId);
    assert.strictEqual(stored.rows[0].entity_id, business.id);
    assert.strictEqual(Number(stored.rows[0].result_position), result.resultPosition);
    assert.strictEqual(stored.rows[0].metadata.attributionSource, 'search_results');

    const hiddenEvent = await requestJson(baseUrl, '/api/discovery/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_abcdefabcdefabcdefabcdefabcdefab',
        eventType: 'VIEW',
        searchId: search.body.searchId,
        entityType: 'BUSINESS',
        entityId: hidden.id,
        resultPosition: 2,
      }),
    });
    assert.strictEqual(hiddenEvent.status, 404, 'unpublished targets must not accept attribution');

    const batch = await requestJson(baseUrl, '/api/discovery/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { eventId: 'evt_11111111111111111111111111111111', eventType: 'VIEW', searchId: search.body.searchId, entityType: 'BUSINESS', entityId: business.id, resultPosition: result.resultPosition },
          { eventId: 'evt_22222222222222222222222222222222', eventType: 'CONTACT', searchId: search.body.searchId, entityType: 'BUSINESS', entityId: business.id, resultPosition: result.resultPosition },
        ],
      }),
    });
    assert.strictEqual(batch.status, 202);
    assert.strictEqual(batch.body.data.accepted, 2);

    const invalid = await requestJson(baseUrl, '/api/discovery/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 'bad', eventType: 'SEARCH', searchId: search.body.searchId, entityType: 'BUSINESS', entityId: business.id }),
    });
    assert.strictEqual(invalid.status, 422);

    console.log('Discovery search attribution tests passed.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
