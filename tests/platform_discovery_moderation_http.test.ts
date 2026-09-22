import assert from 'node:assert/strict';
import http from 'node:http';
import { signToken } from '../server/auth/token.ts';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrator.ts';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository.ts';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService.ts';
import { createApp } from '../server.ts';

async function request(baseUrl: string, path: string, options: { method?: string; token?: string; body?: any } = {}) {
  const bodyData = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (bodyData !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(bodyData).toString();
  }
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, { method: options.method || 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 500, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 500, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query(`
    INSERT INTO organizations (id,name,code,is_active,plan_tier)
    VALUES
      ('disc_http_platform','Discovery Platform Test','DISC_HTTP_PLATFORM',TRUE,'enterprise'),
      ('disc_http_merchant','Discovery Merchant Test','DISC_HTTP_MERCHANT',TRUE,'starter')
  `);
  await db.query(`
    INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
    VALUES
      ('disc-http-platform','disc_http_platform','platform@test.local','Platform Test Admin','hash','salt','platform_admin',TRUE),
      ('disc-http-merchant','disc_http_merchant','merchant@test.local','Merchant Test Owner','hash','salt','business_owner',TRUE),
      ('disc-http-tenant','disc_http_merchant','tenant@test.local','Tenant Super Admin','hash','salt','super_admin',TRUE)
  `);

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const merchant = { userId: 'disc-http-merchant', role: 'business_owner', organizationId: 'disc_http_merchant' };

  const business = await service.create({
    name: 'Platform Moderation HTTP Fixture',
    shortDescription: 'HTTP moderation test listing.',
    description: 'A complete listing used to verify the platform moderation center.',
    phone: '+232 76 222 222',
    businessMode: 'DISCOVERY_ONLY',
    organizationId: 'disc_http_merchant',
    createdByUserId: merchant.userId,
  }, merchant);

  await db.query(
    "INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES ($1,'disc_cat_retail',TRUE)",
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_business_locations
      (id,business_id,name,location_type,city,region,country,latitude,longitude,is_primary,is_active)
      VALUES ('disc_http_loc',$1,'Main Location','STORE','Freetown','Western Area','Sierra Leone',8.4840,-13.2299,TRUE,TRUE)`,
    [business.id],
  );
  await db.query(
    "INSERT INTO discovery_services (id,business_id,name,slug,booking_mode) VALUES ('disc_http_svc',$1,'Consultation','disc-http-consultation','REQUEST')",
    [business.id],
  );
  await service.submit(business.id, merchant);

  const { app } = await createApp({ db, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const platformAdminToken = signToken({
    userId: 'disc-http-platform',
    email: 'platform@test.local',
    organizationId: 'disc_http_platform',
    role: 'platform_admin',
    permissions: ['platform.view', 'platform.discovery'],
  });
  const tenantSuperAdminToken = signToken({
    userId: 'disc-http-tenant',
    email: 'tenant@test.local',
    organizationId: 'disc_http_merchant',
    role: 'super_admin',
    permissions: ['*'],
  });

  try {
    const unauth = await request(baseUrl, '/api/platform/discovery/moderation/listings');
    assert.equal(unauth.status, 401);

    const tenantDenied = await request(baseUrl, '/api/platform/discovery/moderation/listings', { token: tenantSuperAdminToken });
    assert.equal(tenantDenied.status, 403);

    const queue = await request(
      baseUrl,
      '/api/platform/discovery/moderation/listings?status=SUBMITTED&mode=DISCOVERY_ONLY&verification=UNVERIFIED&hasIssues=false&page=1&pageSize=10',
      { token: platformAdminToken },
    );
    assert.equal(queue.status, 200);
    assert.ok(Array.isArray(queue.body.data));
    assert.ok(queue.body.data.some((row: any) => row.id === business.id));
    assert.equal(queue.body.meta.page, 1);

    const detail = await request(baseUrl, `/api/platform/discovery/moderation/listings/${business.id}`, { token: platformAdminToken });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.business.id, business.id);
    assert.equal(detail.body.data.business.listing_status, 'SUBMITTED');

    const review = await request(baseUrl, `/api/platform/discovery/moderation/listings/${business.id}/decision`, {
      method: 'POST',
      token: platformAdminToken,
      body: { status: 'UNDER_REVIEW', reason: 'Moderation review started.' },
    });
    assert.equal(review.status, 200);
    assert.equal(review.body.data.listing_status, 'UNDER_REVIEW');

    const reject = await request(baseUrl, `/api/platform/discovery/moderation/listings/${business.id}/decision`, {
      method: 'POST',
      token: platformAdminToken,
      body: {
        status: 'REJECTED',
        issues: [
          { key: 'location', detail: 'Confirm the primary address and map pin.' },
          { key: 'offering', detail: 'Clarify the service offering.' },
        ],
      },
    });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.data.listing_status, 'REJECTED');

    const rejectedQueue = await request(
      baseUrl,
      '/api/platform/discovery/moderation/listings?status=REJECTED&hasIssues=true&page=1&pageSize=10',
      { token: platformAdminToken },
    );
    assert.equal(rejectedQueue.status, 200);
    assert.ok(rejectedQueue.body.data.some((row: any) => row.id === business.id && row.open_issue_count === 2));

    const persistedIssues = await db.query(
      "SELECT issue_key,status FROM discovery_listing_moderation_issues WHERE business_id=$1 ORDER BY issue_key",
      [business.id],
    );
    assert.deepEqual(persistedIssues.rows, [
      { issue_key: 'location', status: 'OPEN' },
      { issue_key: 'offering', status: 'OPEN' },
    ]);

    const rejectedDetail = await request(baseUrl, `/api/platform/discovery/moderation/listings/${business.id}`, { token: platformAdminToken });
    assert.equal(rejectedDetail.status, 200);
    assert.equal(rejectedDetail.body.data.issues.filter((issue: any) => issue.status === 'OPEN').length, 2);

    console.log('Platform Discovery moderation HTTP workflow passed.');
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
