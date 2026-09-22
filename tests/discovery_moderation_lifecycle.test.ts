import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';

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

  console.log('Discovery moderation lifecycle tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
