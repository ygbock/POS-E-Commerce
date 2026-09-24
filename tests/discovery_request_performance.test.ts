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

async function timedConcurrent<T>(count: number, operation: (index: number) => Promise<T>) {
  const timings: number[] = [];
  const results = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const started = performance.now();
    const result = await operation(index);
    timings.push(performance.now() - started);
    return result;
  }));
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];
  return { results, p95, max: timings[timings.length - 1] };
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  const auth = new AuthService(db);

  await db.query(
    'INSERT INTO organizations (id,name,code,slug) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
    ['perf_req_org','Discovery Request Performance','PERF-REQ','perf-req'],
  );
  await db.query(
    'INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT (id) DO NOTHING',
    ['perf-req-admin','perf_req_org','perf-req-admin@test.local','Performance Admin','hash','salt','admin'],
  );

  const provider = await auth.registerBusinessOwner({
    name: 'Performance Provider',
    email: 'performance-provider@example.test',
    password: 'OwnerPassword123!',
    businessName: 'Performance Quote Provider',
    businessMode: 'DISCOVERY_ONLY',
  });
  const providerActor: Actor = {
    userId: provider.user.id,
    organizationId: provider.user.organizationId,
    role: 'business_owner',
  };

  await db.query(
    'UPDATE discovery_businesses SET listing_status=$1,verification_status=$2,is_discoverable=TRUE WHERE id=$3',
    ['PUBLISHED','VERIFIED',provider.business.id],
  );
  await db.query(
    'INSERT INTO discovery_services (id,business_id,name,slug,description,service_type,booking_mode,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT (id) DO NOTHING',
    ['perf-req-service',provider.business.id,'Performance Service','performance-service','Service performance fixture','Services','QUOTE'],
  );
  await db.query(
    'INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT (id) DO NOTHING',
    ['perf-req-customer','perf_req_org','perf-req-customer@test.local','Performance Customer','hash','salt','viewer'],
  );
  const customerActor: Actor = {
    userId: 'perf-req-customer',
    organizationId: 'perf_req_org',
    role: 'customer',
  };

  const requestIds: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    const requestId = 'perf-req-' + i;
    requestIds.push(requestId);
    await db.query(
      'INSERT INTO discovery_service_requests (id,customer_user_id,customer_name,description,service_type,city,district,region,status,budget_from,budget_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [requestId,customerActor.userId,'Performance Customer','Need a service performance fixture','Services','Freetown','Western Area Urban','Western Area','MATCHED',100,1000],
    );
    await db.query(
      'INSERT INTO discovery_service_request_matches (request_id,business_id,match_score,match_reason) VALUES ($1,$2,$3,$4)',
      [requestId,provider.business.id,0.91,'SERVICE_TYPE'],
    );
    if (i < 20) {
      await db.query(
        'INSERT INTO discovery_service_quotes (id,request_id,business_id,service_id,amount,currency,message,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        ['perf-req-existing-quote-' + i,requestId,provider.business.id,'perf-req-service',500,'SLE','Performance fixture quote','SUBMITTED'],
      );
    }
  }

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = String(req.headers['x-test-user'] || '');
    const actor = userId === providerActor.userId ? providerActor : userId === customerActor.userId ? customerActor : null;
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
    const status = ['PERMISSION_DENIED','TENANT_ACCESS_DENIED'].includes(code) ? 403
      : code === 'NOT_FOUND' ? 404
      : code === 'VALIDATION_ERROR' ? 422
      : ['INVALID_STATE_TRANSITION','CONFLICT'].includes(code) ? 409
      : 500;
    res.status(status).json({ success: false, error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw } });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Performance test server did not expose a port.');
  const baseUrl = 'http://127.0.0.1:' + address.port;

  try {
    const inbox = await timedConcurrent(30, async () => {
      const response = await requestJson(baseUrl, '/api/discovery/service-requests', customerActor);
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.strictEqual(response.body?.data?.length, 40);
      return response;
    });
    assert.ok(inbox.p95 < 2500, 'Concurrent customer request inbox p95 exceeded 2500ms: ' + inbox.p95.toFixed(1));
    assert.ok(inbox.max < 4000, 'Concurrent customer request inbox max exceeded 4000ms: ' + inbox.max.toFixed(1));

    const detail = await timedConcurrent(30, async (index) => {
      const requestId = requestIds[index % requestIds.length];
      const response = await requestJson(baseUrl, '/api/discovery/service-requests/' + requestId, customerActor);
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.strictEqual(response.body?.data?.quotes?.length, index < 20 ? 1 : 0);
      return response;
    });
    assert.ok(detail.p95 < 2500, 'Concurrent request detail p95 exceeded 2500ms: ' + detail.p95.toFixed(1));
    assert.ok(detail.max < 4000, 'Concurrent request detail max exceeded 4000ms: ' + detail.max.toFixed(1));

    const quoteWrite = await timedConcurrent(20, async (index) => {
      const requestId = requestIds[20 + index];
      const response = await requestJson(baseUrl, '/api/discovery/service-requests/' + requestId + '/quotes', providerActor, {
        method: 'POST',
        body: JSON.stringify({
          businessId: provider.business.id,
          amount: 650 + index,
          serviceId: 'perf-req-service',
          message: 'Concurrent performance quote',
        }),
      });
      assert.strictEqual(response.status, 201, JSON.stringify(response.body));
      return response;
    });
    assert.ok(quoteWrite.p95 < 3000, 'Concurrent quote-write p95 exceeded 3000ms: ' + quoteWrite.p95.toFixed(1));
    assert.ok(quoteWrite.max < 5000, 'Concurrent quote-write max exceeded 5000ms: ' + quoteWrite.max.toFixed(1));

    const quoteCount = await db.query(
      "SELECT COUNT(*)::int AS count FROM discovery_service_quotes WHERE business_id=$1 AND request_id LIKE 'perf-req-%'",
      [provider.business.id],
    );
    assert.strictEqual(Number(quoteCount.rows[0].count), 40);

    console.log(
      'Discovery request performance test passed: ' +
      'inbox p95=' + inbox.p95.toFixed(1) + 'ms max=' + inbox.max.toFixed(1) + 'ms; ' +
      'detail p95=' + detail.p95.toFixed(1) + 'ms max=' + detail.max.toFixed(1) + 'ms; ' +
      'quote-write p95=' + quoteWrite.p95.toFixed(1) + 'ms max=' + quoteWrite.max.toFixed(1) + 'ms',
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
