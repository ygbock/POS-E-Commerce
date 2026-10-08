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
      ('claim-customer','claim_owner_org','customer@claim.test','Customer','hash','salt','customer','customer',TRUE),
      ('claim-other-owner','claim_owner_org','other-owner@claim.test','Other Business Owner','hash','salt','business_owner','business_owner',TRUE)
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
  const otherOwnerToken = signToken({
    userId: 'claim-other-owner', email: 'other-owner@claim.test', organizationId: 'claim_owner_org', role: 'business_owner', identityType: 'business_owner', permissions: ['business.view', 'business.listing.manage', 'business.listing.submit'],
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

    const review = await request(baseUrl, `/api/platform/discovery/moderation/listings/${businessId}/decision`, {
      method: 'POST',
      token: platformToken,
      body: { status: 'UNDER_REVIEW', reason: 'Platform-created listing submitted for moderation.' },
    });
    assert.equal(review.status, 200);
    assert.equal(review.body.data.listing_status, 'UNDER_REVIEW');

    const approve = await request(baseUrl, `/api/platform/discovery/moderation/listings/${businessId}/decision`, {
      method: 'POST',
      token: platformToken,
      body: { status: 'APPROVED', reason: 'Platform-created listing approved.' },
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.data.listing_status, 'APPROVED');

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

    const myClaims = await request(baseUrl, '/api/discovery/my-claims', { token: ownerToken });
    assert.equal(myClaims.status, 200);
    assert.ok(myClaims.body.data.some((row: any) => row.id === claimId));

    const myBusinesses = await request(baseUrl, '/api/discovery/businesses/my', { token: ownerToken });
    assert.equal(myBusinesses.status, 200);
    assert.ok(myBusinesses.body.data.some((row: any) => row.id === businessId));

    await postClaimManagementJourney(db, baseUrl, platformToken, ownerToken, otherOwnerToken, businessId);

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

async function postClaimManagementJourney(db: DatabaseClient, baseUrl: string, platformToken: string, ownerToken: string, otherOwnerToken: string, businessId: string) {
  const categories = await db.query("SELECT id FROM discovery_business_categories WHERE is_active=TRUE LIMIT 1");
  if (!categories.rows[0]) await db.query("INSERT INTO discovery_business_categories (id,name,slug,display_order,is_active) VALUES ('claim_journey_cat','Claim Journey','claim-journey',1,TRUE)");
  const categoryId = categories.rows[0]?.id || 'claim_journey_cat';
  await db.query("INSERT INTO discovery_business_category_map (business_id,category_id,is_primary) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING", [businessId, categoryId]);

  const updated = await request(baseUrl, '/api/discovery/businesses/' + businessId, { method: 'PATCH', token: ownerToken, body: { shortDescription: 'Complete post-claim Discovery profile.', description: 'A fully configured business profile ready for platform moderation.', phone: '+23276000111', email: 'owner@claim.test' } });
  assert.equal(updated.status, 200);
  const location = await request(baseUrl, '/api/discovery/businesses/' + businessId + '/locations', { method: 'POST', token: ownerToken, body: { name: 'Main Branch', locationType: 'STORE', addressLine1: '1 Claim Street', city: 'Freetown', district: 'Western Area Urban', region: 'Western Area', latitude: 8.4840, longitude: -13.2299, isPrimary: true, isActive: true } });
  assert.equal(location.status, 201);
  const locationId = location.body.data.id;
  const hoursPayload: Array<{ dayOfWeek: number; isClosed: boolean; opensAt?: string; closesAt?: string }> = [
    ...[1,2,3,4,5,6].map((dayOfWeek) => ({ dayOfWeek, isClosed: false, opensAt: '08:00', closesAt: '18:00' })),
    { dayOfWeek: 7, isClosed: true },
  ];
  const hours = await request(baseUrl, '/api/discovery/businesses/' + businessId + '/locations/' + locationId + '/hours', { method: 'PUT', token: ownerToken, body: { hours: hoursPayload } });
  assert.equal(hours.status, 200);
  const service = await request(baseUrl, '/api/discovery/businesses/' + businessId + '/services', { method: 'POST', token: ownerToken, body: { name: 'Claim Journey Service', description: 'Service configured after ownership claim.', serviceType: 'General', bookingMode: 'REQUEST' } });
  assert.equal(service.status, 201);
  const verification = await request(baseUrl, '/api/discovery/businesses/' + businessId + '/verification', { method: 'POST', token: ownerToken, body: { evidence: { businessRegistration: 'verified-owner-evidence', submittedFor: 'post-claim-journey' } } });
  assert.equal(verification.status, 201);
  assert.equal(verification.body.data.status, 'PENDING');
  const workspace = await request(baseUrl, '/api/discovery/businesses/' + businessId + '/management', { token: ownerToken });
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body.data.readiness.ready, true);
  assert.equal(workspace.body.data.verification.status, 'PENDING');
  assert.ok(workspace.body.data.locations.some((row: any) => row.id === locationId));
  const submit = await request(baseUrl, '/api/discovery/businesses/' + businessId + '/submit', { method: 'POST', token: ownerToken, body: { reason: 'Owner completed the Discovery readiness checklist.' } });
  assert.equal(submit.status, 200);
  assert.equal(submit.body.data.listing_status, 'SUBMITTED');
  assert.equal(submit.body.data.is_discoverable, false);
  const otherOwner = await request(baseUrl, '/api/discovery/businesses/' + businessId, { method: 'PATCH', token: otherOwnerToken, body: { description: 'Unauthorized owner attempt' } });
  assert.equal(otherOwner.status, 403);
  const review = await request(baseUrl, '/api/platform/discovery/moderation/listings/' + businessId + '/decision', { method: 'POST', token: platformToken, body: { status: 'UNDER_REVIEW', reason: 'Post-claim listing moderation.' } });
  assert.equal(review.status, 200);
  const approve = await request(baseUrl, '/api/platform/discovery/moderation/listings/' + businessId + '/decision', { method: 'POST', token: platformToken, body: { status: 'APPROVED', reason: 'Post-claim listing approved.' } });
  assert.equal(approve.status, 200);
  const publish = await request(baseUrl, '/api/platform/discovery/moderation/listings/' + businessId + '/decision', { method: 'POST', token: platformToken, body: { status: 'PUBLISHED', reason: 'Post-claim listing published.' } });
  assert.equal(publish.status, 200);
  const publicProfile = await request(baseUrl, '/api/discovery/businesses/' + businessId);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.data.business.id, businessId);
  assert.ok(publicProfile.body.data.locations.some((row: any) => row.id === locationId));
  assert.equal(publicProfile.body.data.activeServices.length, 1);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
