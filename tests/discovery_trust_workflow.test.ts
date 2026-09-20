import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('trust_org','Trust Test Org','TRUST_TEST',TRUE)");
  await db.query("INSERT INTO discovery_businesses (id,public_id,organization_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('trust_business','trust_public','trust_org','Trust Business','trust-business','DISCOVERY_AND_STORE','PUBLISHED','UNVERIFIED',TRUE,'trust-owner')");
  
  const verification = await db.query(
    "INSERT INTO discovery_verification_applications (id,business_id,applicant_user_id,evidence) VALUES ('ver_1','trust_business','trust-owner',$1) RETURNING *",
    [{ claimType: 'BUSINESS_REGISTRATION', note: 'registration evidence' }],
  );
  assert.strictEqual(verification.rows[0].status, 'PENDING');

  await assert.rejects(
    () => db.query("INSERT INTO discovery_verification_applications (id,business_id,applicant_user_id,evidence) VALUES ('ver_2','trust_business','trust-owner',$1)", [{}]),
    /unique|constraint|duplicate/i,
  );

  await db.query(
    "INSERT INTO discovery_trust_events (id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES ('trust_evt_1','trust_business','VERIFICATION','ver_1','VERIFICATION_SUBMITTED','UNVERIFIED','PENDING','trust-owner',NULL,$1)",
    [{}],
  );

  await db.query(
    "UPDATE discovery_verification_applications SET status='APPROVED',reviewed_by_user_id='trust-admin',reviewed_at=CURRENT_TIMESTAMP,review_reason='Evidence verified' WHERE id='ver_1'",
  );
  await db.query("UPDATE discovery_businesses SET verification_status='VERIFIED' WHERE id='trust_business'");
  await db.query(
    "INSERT INTO discovery_trust_events (id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES ('trust_evt_2','trust_business','VERIFICATION','ver_1','VERIFICATION_DECIDED','PENDING','VERIFIED','trust-admin','Evidence verified',$1)",
    [{}],
  );

  const verified = await db.query("SELECT verification_status FROM discovery_businesses WHERE id='trust_business'");
  assert.strictEqual(verified.rows[0].verification_status, 'VERIFIED');

  await db.query(
    "INSERT INTO discovery_reviews (id,business_id,reviewer_user_id,reviewer_name,rating,title,body,status) VALUES ('review_1','trust_business','customer-1','Customer',5,'Great','Good service','PENDING')",
  );
  await db.query(
    "INSERT INTO discovery_review_moderation_events (id,review_id,from_status,to_status,actor_user_id,reason) VALUES ('review_evt_1','review_1','PENDING','PUBLISHED','trust-admin','Approved')",
  );
  await db.query("UPDATE discovery_reviews SET status='PUBLISHED' WHERE id='review_1'");

  const published = await db.query("SELECT status FROM discovery_reviews WHERE id='review_1'");
  assert.strictEqual(published.rows[0].status, 'PUBLISHED');

  await db.query(
    "INSERT INTO discovery_reports (id,business_id,reporter_user_id,reason_code,description) VALUES ('report_1','trust_business','customer-2','MISLEADING','Needs review')",
  );
  await db.query(
    "INSERT INTO discovery_report_events (id,report_id,from_status,to_status,actor_user_id,note) VALUES ('report_evt_1','report_1','OPEN','UNDER_REVIEW','trust-admin','Investigating')",
  );
  await db.query("UPDATE discovery_reports SET status='UNDER_REVIEW' WHERE id='report_1'");

  const reportEvents = await db.query("SELECT count(*)::int AS count FROM discovery_report_events WHERE report_id='report_1'");
  assert.strictEqual(Number(reportEvents.rows[0].count), 1);

  const trustEvents = await db.query("SELECT count(*)::int AS count FROM discovery_trust_events WHERE business_id='trust_business'");
  assert.strictEqual(Number(trustEvents.rows[0].count), 2);

  console.log('Discovery trust workflow tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
