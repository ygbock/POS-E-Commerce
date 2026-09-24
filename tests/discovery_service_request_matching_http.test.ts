import assert from 'assert';
import express from 'express';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';

type Actor = { userId: string; organizationId: string; role: string };

async function requestJson(baseUrl: string, path: string, actor: Actor, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('x-test-user', actor.userId);
  const response = await fetch(baseUrl + path, { ...init, headers });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  const auth = new AuthService(db);

  const ownerA = await auth.registerBusinessOwner({
    name: 'Matching Owner A',
    email: 'matching-owner-a@example.test',
    password: 'OwnerPassword123!',
    businessName: 'Solar Provider A',
    businessMode: 'DISCOVERY_ONLY',
  });
  const ownerB = await auth.registerBusinessOwner({
    name: 'Matching Owner B',
    email: 'matching-owner-b@example.test',
    password: 'OwnerPassword123!',
    businessName: 'Unrelated Provider B',
    businessMode: 'DISCOVERY_ONLY',
  });

  const actors: Record<string, Actor> = {
    ownerA: { userId: ownerA.user.id, organizationId: ownerA.user.organizationId, role: 'business_owner' },
    ownerB: { userId: ownerB.user.id, organizationId: ownerB.user.organizationId, role: 'business_owner' },
  };

  await db.query(
    'UPDATE discovery_businesses SET listing_status=\'PUBLISHED\', verification_status=\'VERIFIED\', is_discoverable=TRUE WHERE id IN ($1,$2)',
    [ownerA.business.id, ownerB.business.id],
  );

  await db.query(
    'INSERT INTO discovery_services (id,business_id,name,slug,description,service_type,booking_mode,is_active) VALUES ' +
    '($1,$2,\'Solar Installation\',\'solar-installation\',\'Solar panels and battery backup\',\'Solar Energy\',\'QUOTE\',TRUE), ' +
    '($3,$4,\'Plumbing Repairs\',\'plumbing-repairs\',\'Pipes leaks and water systems\',\'Plumbing\',\'QUOTE\',TRUE)',
    ['match-solar-service', ownerA.business.id, 'match-plumbing-service', ownerB.business.id],
  );

  await db.query(
    'INSERT INTO discovery_business_locations (id,business_id,name,location_type,city,district,region,latitude,longitude,is_primary,is_active) VALUES ' +
    '($1,$2,\'Solar Main Branch\',\'STORE\',\'Freetown\',\'Western Area Urban\',\'Western Area\',8.4840,-13.2299,TRUE,TRUE), ' +
    '($3,$4,\'Plumbing Main Branch\',\'STORE\',\'Freetown\',\'Western Area Urban\',\'Western Area\',8.4840,-13.2299,TRUE,TRUE)',
    ['match-solar-location', ownerA.business.id, 'match-plumbing-location', ownerB.business.id],
  );

  const requestId = 'match-http-request';
  await db.query(
    'INSERT INTO discovery_service_requests (id,customer_name,description,service_type,city,district,region,latitude,longitude,budget_from,budget_to,status) VALUES ($1,\'Customer\',\'Need solar panel installation and battery backup\',\'Solar Energy\',\'Freetown\',\'Western Area Urban\',\'Western Area\',8.4840,-13.2299,1000,5000,\'OPEN\')',
    [requestId],
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = Object.values(actors).find((candidate) => candidate.userId === String(req.headers['x-test-user'] || ''));
    if (actor) {
      req.auth = {
        userId: actor.userId,
        organizationId: actor.organizationId,
        role: actor.role as any,
        permissions: [],
        organizationActive: true,
      };
    }
    next();
  });
  app.use('/api/discovery', createDiscoveryRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    const raw = String(err?.message || 'error');
    const code = raw.split(':')[0];
    const status = ['PERMISSION_DENIED', 'TENANT_ACCESS_DENIED'].includes(code) ? 403
      : code === 'NOT_FOUND' ? 404
      : code === 'VALIDATION_ERROR' ? 422
      : code === 'INVALID_STATE_TRANSITION' ? 409
      : 500;
    res.status(status).json({ success: false, error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw } });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');
  const baseUrl = 'http://127.0.0.1:' + address.port;

  try {
    const matchPath = '/api/discovery/service-requests/' + requestId + '/match';

    const unrelated = await requestJson(baseUrl, matchPath, actors.ownerB, {
      method: 'POST',
      body: JSON.stringify({ businessId: ownerB.business.id, matchScore: 999999 }),
    });
    assert.strictEqual(unrelated.status, 404, JSON.stringify(unrelated.body));

    const noUnrelatedMatch = await db.query(
      'SELECT 1 FROM discovery_service_request_matches WHERE request_id=$1 AND business_id=$2',
      [requestId, ownerB.business.id],
    );
    assert.strictEqual(noUnrelatedMatch.rows.length, 0);

    const eligible = await requestJson(baseUrl, matchPath, actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({ businessId: ownerA.business.id, matchScore: 999999 }),
    });
    assert.strictEqual(eligible.status, 200);
    assert.strictEqual(eligible.body?.data?.status, 'MATCHED');

    const stored = await db.query(
      'SELECT match_score,match_reason FROM discovery_service_request_matches WHERE request_id=$1 AND business_id=$2',
      [requestId, ownerA.business.id],
    );
    assert.strictEqual(stored.rows.length, 1);
    assert.notStrictEqual(Number(stored.rows[0].match_score), 999999);
    assert.ok(['REQUESTED_SERVICE','SERVICE_TYPE','TEXT','LOCATION','BUDGET'].includes(String(stored.rows[0].match_reason)));

    const providerInbox = await requestJson(
      baseUrl,
      '/api/discovery/businesses/' + ownerA.business.id + '/service-requests?status=MATCHED',
      actors.ownerA,
    );
    assert.strictEqual(providerInbox.status, 200, JSON.stringify(providerInbox.body));
    assert.strictEqual(providerInbox.body?.data?.length, 1);
    assert.strictEqual(providerInbox.body?.data?.[0]?.id, requestId);
    assert.ok(providerInbox.body?.data?.[0]?.match_reason);
    assert.strictEqual(Number(providerInbox.body?.data?.[0]?.match_score), Number(stored.rows[0].match_score));

    const unrelatedInbox = await requestJson(
      baseUrl,
      '/api/discovery/businesses/' + ownerB.business.id + '/service-requests?status=MATCHED',
      actors.ownerB,
    );
    assert.strictEqual(unrelatedInbox.status, 200);
    assert.strictEqual(unrelatedInbox.body?.data?.length, 0);

    await db.query('UPDATE discovery_service_requests SET status=\'CLOSED\' WHERE id=$1', [requestId]);
    const terminal = await requestJson(baseUrl, matchPath, actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({ businessId: ownerA.business.id }),
    });
    assert.strictEqual(terminal.status, 409);

    const matchCount = await db.query(
      'SELECT COUNT(*)::int AS count FROM discovery_service_request_matches WHERE request_id=$1 AND business_id=$2',
      [requestId, ownerA.business.id],
    );
    assert.strictEqual(Number(matchCount.rows[0].count), 1);

    console.log('Discovery service request matching authorization/hardening tests passed.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
