import assert from 'node:assert/strict';
import http from 'node:http';
import { signToken } from '../server/auth/token.ts';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrator.ts';
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
      ('claim_platform_org','Claim Platform','CLAIM_PLATFORM',TRUE,'enterprise'),
      ('claim_owner_org','Claim Owner','CLAIM_OWNER',TRUE,'starter')
  `);

  await db.query(`
    INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,identity_type,is_active)
    VALUES
      ('claim-platform-admin','claim_platform_org','platform@claim.test','Platform Admin','hash','salt','platform_admin','platform',TRUE),
      ('claim-owner','claim_owner_org','owner@claim.test','Business Owner','hash','salt','business_owner','business_owner',TRUE),
      ('claim-customer','claim_owner_org','customer@claim.test','Customer','hash','salt','customer','customer',TRUE)
  `);

  const { app } = await createApp({ db, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const platformToken = signToken({
    userId: 'claim-platform-admin',
    email: 'platform@claim.test',
    organizationId: 'claim_platform_org',
    role: 'platform_admin',
    identityType: 'platform',
    permissions: ['platform.view', 'platform.discovery'],
  });
  const ownerToken = signToken({
    userId: 'claim-owner',
    email: 'owner@claim.test',
    organizationId: 'claim_owner_org',
    role: 'business_owner',
    identityType: 'business_owner',
    permissions: ['business.view', 'business.listing.manage', 'business.listing.submit'],
  });
  const customerToken = signToken({
    userId: 'claim-customer',
    email: 'customer@claim.test',
    organizationId: 'claim_owner_org',
    role: 'customer',
    identityType: 'customer',
    permissions: [],
  });

  try {
    const created = await request(baseUrl, '/api/platform/discovery/moderation/listings', {
      method: 'POST',
      token: platformToken,
      body: {
        name: 'Freetown Claimable Business',
        businessType: 'Services',
        shortDescription: 'A platform-created listing available for ownership claims.',
        phone: '+232 76 000 000',
      },
    });
    assert.equal(created.status, 201);
    const businessId = created.body.data.id;
    assert.equal(created.body.data.listing_status, 'DRAFT');

    const membershipBefore = await db.query(
      'SELECT 1 FROM discovery_business_memberships WHERE business_id=$1 AND is_active=TRUE',
      [businessId],
    );
    assert.equal(membershipBefore.rows.length, 0);

    const approve = await request(baseUrl, `/api/platform/discovery/moderation/listings/${businessId}/decision`, {
      method: 'POST',
      token: platformToken,
      body: { status: 'APPROVED', reason: 'Platform-created listing approved.' },
    });
    assert.equal(approve.status, 200);

    const publish = await request(baseUrl, `/api/platform/discovery/moderation/listings/${businessId}/decision`, {
      method: 'POST',
      token: platformToken,
      body: { status: 'PUBLISHED', reason: 'Platform-created listing published.' },
    });
    assert.equal(publish.status, 200);
    assert.equal(publish.body.data.listing_status, 'PUBLISHED');
    assert.equal(publish.body.data.is_discoverable, true);

    const customerDenied = await request(baseUrl, `/api/discovery/businesses/${businessId}/claims`, {
      method: 'POST',
      token: customerToken,
      body: { evidence: { registration: 'customer-proof' } },
    });
    assert.equal(customerDenied.status, 403);

    const claim = await request(baseUrl, `/api/discovery/businesses/${businessId}/claims`, {
      method: 'POST',
      token: ownerToken,
      body: {
        claimantName: 'Business Owner',
        claimantEmail: 'owner@claim.test',
        evidence: { registration: 'business-registration-123', note: 'Ownership evidence supplied.' },
      },
    });
    assert.equal(claim.status, 201);
    const claimId = claim.body.data.id;
    assert.equal(claim.body.data.status, 'PENDING');

    const pending = await request(baseUrl, '/api/platform/discovery/moderation/claims', { token: platformToken });
    assert.equal(pending.status, 200);
    assert.ok(pending.body.data.some((row: any) => row.id === claimId));

    const decision = await request(baseUrl, `/api/platform/discovery/moderation/claims/${claimId}/decision`, {
      method: 'POST',
      token: platformToken,
      body: { status: 'APPROVED', reason: 'Ownership evidence verified.' },
    });
    assert.equal(decision.status, 200);
    assert.equal(decision.body.data.status, 'APPROVED');

    const membership = await db.query(
      'SELECT user_id,role,is_active FROM discovery_business_memberships WHERE business_id=$1',
      [businessId],
    );
    assert.deepEqual(membership.rows, [{ user_id: 'claim-owner', role: 'OWNER', is_active: true }]);

    const duplicateClaim = await request(baseUrl, `/api/discovery/businesses/${businessId}/claims`, {
      method: 'POST',
      token: ownerToken,
      body: { evidence: { registration: 'duplicate' } },
    });
    assert.equal(duplicateClaim.status, 409);

    console.log('Platform-created listing and business-owner claim workflow passed.');
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
