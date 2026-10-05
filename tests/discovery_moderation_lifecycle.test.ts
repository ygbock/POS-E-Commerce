import assert from 'assert';
import express from 'express';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query(
    "INSERT INTO organizations (id,name,code,is_active) VALUES ('mod_cycle_org','Moderation Cycle Org','MOD_CYCLE',TRUE)",
  );
  await db.query(
    `INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES
       ('mod-owner','mod_cycle_org','mod-owner@test.local','Moderation Owner','hash','salt','admin',TRUE),
       ('mod-platform','mod_cycle_org','mod-platform@test.local','Platform Moderator','hash','salt','admin',TRUE)`,
  );

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const merchant = { userId: 'mod-owner', role: 'business_owner', organizationId: 'mod_cycle_org' };
  const moderator = { userId: 'mod-platform', role: 'admin', organizationId: 'mod_cycle_org' };

  const business = await service.create({
    name: 'Moderation Lifecycle Business',
    shortDescription: 'A complete moderation lifecycle fixture.',
    description: 'A complete moderation lifecycle fixture for Discovery.',
    phone: '+232 76 111 111',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'mod_cycle_org',
    createdByUserId: merchant.userId,
  }, merchant);

  await db.query(
    "INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES ($1,'disc_cat_retail',TRUE)",
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_business_locations
      (id,business_id,name,location_type,city,region,country,latitude,longitude,is_primary,is_active)
      VALUES ('mod_cycle_loc', $1, 'Main Location', 'STORE', 'Freetown', 'Western Area', 'Sierra Leone', 8.4840, -13.2299, TRUE, TRUE)`,
    [business.id],
  );
  await db.query(
    "INSERT INTO discovery_services (id,business_id,name,slug,booking_mode) VALUES ('mod_cycle_svc',$1,'Consultation','mod-cycle-consultation','REQUEST')",
    [business.id],
  );

  await service.submit(business.id, merchant);
  assert.strictEqual((await repo.findById(business.id))?.listing_status, 'SUBMITTED');

  await service.review(business.id, moderator, 'Moderation intake started.');
  assert.strictEqual((await repo.findById(business.id))?.listing_status, 'UNDER_REVIEW');

  const rejected = await service.reject(
    business.id,
    moderator,
    'Please correct the location and service information.',
    undefined,
    [
      { key: 'location', detail: 'Confirm the primary address and map pin.' },
      { key: 'offering', detail: 'Clarify the service description and booking setup.' },
    ],
  );
  assert.strictEqual(rejected.listing_status, 'REJECTED');
  assert.strictEqual(rejected.is_discoverable, false);

  const firstIssues = await db.query(
    `SELECT i.issue_key, i.detail, i.status, i.listing_event_id, e.to_status
       FROM discovery_listing_moderation_issues i
       LEFT JOIN discovery_listing_events e ON e.id=i.listing_event_id
      WHERE i.business_id=$1
      ORDER BY i.created_at ASC`,
    [business.id],
  );
  assert.strictEqual(firstIssues.rows.length, 2);
  assert.deepStrictEqual(firstIssues.rows.map((row: any) => row.issue_key).sort(), ['location', 'offering'].sort());
  assert.ok(firstIssues.rows.every((row: any) => row.status === 'OPEN'));
  assert.ok(firstIssues.rows.every((row: any) => row.listing_event_id));
  assert.ok(firstIssues.rows.every((row: any) => row.to_status === 'REJECTED'));

  // Merchant correction cycle resolves the current OPEN issue set atomically with resubmission.
  const resubmitted = await service.resubmit(
    business.id,
    merchant,
    'Corrections completed; please review again.',
  );
  assert.strictEqual(resubmitted.listing_status, 'SUBMITTED');

  const resolvedIssues = await db.query(
    "SELECT status, resolved_by_user_id, resolved_at FROM discovery_listing_moderation_issues WHERE business_id=$1 ORDER BY created_at ASC",
    [business.id],
  );
  assert.strictEqual(resolvedIssues.rows.length, 2);
  assert.ok(resolvedIssues.rows.every((row: any) => row.status === 'RESOLVED'));
  assert.ok(resolvedIssues.rows.every((row: any) => row.resolved_by_user_id === merchant.userId));
  assert.ok(resolvedIssues.rows.every((row: any) => row.resolved_at));

  // A new moderation cycle gets a new issue set.
  await service.review(business.id, moderator);
  assert.strictEqual((await repo.findById(business.id))?.listing_status, 'UNDER_REVIEW');

  // Simulate a stale open issue to verify the atomic rejection path supersedes it
  // before inserting the new issue set.
  await db.query(
    `INSERT INTO discovery_listing_moderation_issues
      (id,business_id,listing_event_id,issue_key,detail,status)
      VALUES ('mod_stale_issue',$1,NULL,'description','Stale moderation issue','OPEN')`,
    [business.id],
  );

  await service.reject(
    business.id,
    moderator,
    undefined,
    undefined,
    [{ key: 'contact', detail: 'Confirm the primary customer contact.' }],
  );

  const allIssues = await db.query(
    `SELECT issue_key, detail, status, resolved_by_user_id
       FROM discovery_listing_moderation_issues
      WHERE business_id=$1
      ORDER BY created_at ASC`,
    [business.id],
  );
  assert.strictEqual(allIssues.rows.length, 4);
  const staleIssue = allIssues.rows.find((row: any) => row.issue_key === 'description');
  const freshIssue = allIssues.rows.find((row: any) => row.issue_key === 'contact');
  assert.ok(staleIssue);
  assert.strictEqual(staleIssue.status, 'SUPERSEDED');
  assert.strictEqual(staleIssue.resolved_by_user_id, moderator.userId);
  assert.ok(freshIssue);
  assert.strictEqual(freshIssue.status, 'OPEN');

  // Merchant users are never allowed to invoke moderation decisions.
  await assert.rejects(
    () => service.review(business.id, merchant),
    /PERMISSION_DENIED:Discovery moderation requires administrator authorization/,
  );

  const detail = await service.getListingModerationDetail(business.id, moderator);
  assert.strictEqual(detail.business.listing_status, 'REJECTED');
  assert.strictEqual(detail.issues.filter((issue: any) => issue.status === 'OPEN').length, 1);

  // A later moderation cycle can approve the corrected listing, after which the
  // business owner—not the moderator—publishes it.
  await service.resubmit(business.id, merchant, 'Corrections completed for publication.');
  await service.review(business.id, moderator, 'Final moderation review.');
  const approved = await service.approve(business.id, moderator, 'Listing approved for publication.');
  assert.strictEqual(approved.listing_status, 'APPROVED');
  assert.strictEqual(approved.is_discoverable, false);

  const prePublicationListings = await service.listPublished({ limit: 200 });
  assert.ok(
    !prePublicationListings.some((listing) => listing.id === business.id),
    'approved but unpublished listing must remain absent from public Discovery',
  );

  const published = await service.publish(business.id, merchant, 'Publishing the approved listing.');
  assert.strictEqual(published.listing_status, 'PUBLISHED');
  assert.strictEqual(published.is_discoverable, true);
  assert.ok(published.published_at);

  const publicationEvent = await db.query(
    `SELECT from_status,to_status,actor_user_id
       FROM discovery_listing_events
      WHERE business_id=$1 AND to_status='PUBLISHED'
      ORDER BY created_at DESC
      LIMIT 1`,
    [business.id],
  );
  assert.strictEqual(publicationEvent.rows[0].from_status, 'APPROVED');
  assert.strictEqual(publicationEvent.rows[0].actor_user_id, merchant.userId);

  // Public Discovery visibility must be synchronized with publication: the listing
  // is absent before publication and becomes reachable through both public search
  // and the public business profile after the approved owner publishes it.
  const publishedListings = await service.listPublished({ limit: 200 });
  assert.ok(
    publishedListings.some((listing) => listing.id === business.id),
    'published listing must appear in the public Discovery listing surface',
  );

  const publicBySlug = await service.getBySlug(business.slug, true);
  assert.ok(publicBySlug, 'published listing must be resolvable by its public slug');

  const publicProfile = await service.getPublicProfile(business.id);
  assert.ok(publicProfile, 'published listing must expose a public Discovery profile');
  assert.strictEqual(publicProfile?.business.id, business.id);

  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    const raw = String(err?.message || 'error');
    const code = raw.split(':')[0];
    const status = code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ success: false, error: { code, message: raw } });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Owner lifecycle controls: pause hides the listing, republish restores it,
    // and archive permanently removes it from public Discovery.
    const paused = await service.pause(business.id, merchant, 'Owner temporarily paused the listing.');
    assert.strictEqual(paused.listing_status, 'PAUSED');
    assert.strictEqual(paused.is_discoverable, false);
    assert.ok(!(await service.listPublished({ limit: 200 })).some((listing) => listing.id === business.id));

    const republished = await service.publish(business.id, merchant, 'Owner resumed the paused listing.');
    assert.strictEqual(republished.listing_status, 'PUBLISHED');
    assert.strictEqual(republished.is_discoverable, true);
    assert.ok((await service.listPublished({ limit: 200 })).some((listing) => listing.id === business.id));

    const archived = await service.archive(business.id, merchant, 'Owner permanently retired the listing.');
    assert.strictEqual(archived.listing_status, 'ARCHIVED');
    assert.strictEqual(archived.is_discoverable, false);
    assert.ok(!(await service.listPublished({ limit: 200 })).some((listing) => listing.id === business.id));

    const lifecycleHistory = await db.query(
      'SELECT from_status,to_status,reason,actor_user_id FROM discovery_listing_events WHERE business_id=$1 ORDER BY created_at ASC',
      [business.id],
    );
    const historyStatuses = lifecycleHistory.rows.map((row: any) => row.to_status);
    assert.ok(historyStatuses.includes('SUBMITTED'));
    assert.ok(historyStatuses.includes('UNDER_REVIEW'));
    assert.ok(historyStatuses.includes('REJECTED'));
    assert.ok(historyStatuses.includes('APPROVED'));
    assert.ok(historyStatuses.includes('PUBLISHED'));
    assert.ok(historyStatuses.includes('PAUSED'));
    assert.ok(historyStatuses.includes('ARCHIVED'));
    assert.ok(lifecycleHistory.rows.some((row: any) => row.to_status === 'PAUSED' && row.actor_user_id === merchant.userId));
    assert.ok(lifecycleHistory.rows.some((row: any) => row.to_status === 'ARCHIVED' && row.actor_user_id === merchant.userId));

    const publicSearchResponse = await fetch(baseUrl + '/api/discovery/businesses?limit=200');
    assert.strictEqual(publicSearchResponse.status, 200);
    const publicSearchBody = await publicSearchResponse.json();
    assert.strictEqual(publicSearchBody?.success, true);
    assert.ok(
      publicSearchBody?.data?.some((listing: any) => listing.id === business.id),
      'published listing must be returned by the public Discovery HTTP search endpoint',
    );

    const publicProfileResponse = await fetch(
      baseUrl + `/api/discovery/businesses/${encodeURIComponent(business.slug)}`,
    );
    assert.strictEqual(publicProfileResponse.status, 200);
    const publicProfileBody = await publicProfileResponse.json();
    assert.strictEqual(publicProfileBody?.success, true);
    assert.strictEqual(publicProfileBody?.data?.business?.id, business.id);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }

  console.log('Discovery moderation lifecycle and public publication tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
