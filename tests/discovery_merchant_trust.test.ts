import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('merchant_trust_org','Merchant Trust Org','MTRUST',TRUE)");
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('other_trust_org','Other Trust Org','OTRUST',TRUE)");
  await db.query("INSERT INTO discovery_businesses (id,public_id,organization_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('merchant_trust_business','merchant-trust-public','merchant_trust_org','Merchant Trust Business','merchant-trust-business','DISCOVERY_AND_STORE','PUBLISHED','REJECTED',TRUE,'merchant-owner')");
  await db.query("INSERT INTO discovery_businesses (id,public_id,organization_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('other_trust_business','other-trust-public','other_trust_org','Other Trust Business','other-trust-business','DISCOVERY_AND_STORE','PUBLISHED','UNVERIFIED',TRUE,'other-owner')");

  await db.query(
    "INSERT INTO discovery_verification_applications (id,business_id,applicant_user_id,evidence,status,reviewed_at,review_reason) VALUES ('merchant_ver_1','merchant_trust_business','merchant-owner',$1,'REJECTED',CURRENT_TIMESTAMP,'Evidence needs clarification')",
    [{ note: 'registration' }],
  );
  await db.query(
    "INSERT INTO discovery_business_claims (id,business_id,claimant_user_id,claimant_name,claimant_email,status,reviewed_at,review_reason) VALUES ('merchant_claim_1','merchant_trust_business','merchant-owner','Merchant Owner','owner@example.invalid','REJECTED',CURRENT_TIMESTAMP,'Claim evidence was incomplete')",
  );
  await db.query(
    "INSERT INTO discovery_business_claims (id,business_id,claimant_user_id,claimant_name,claimant_email,status) VALUES ('merchant_claim_other','merchant_trust_business','another-user','Another User','other@example.invalid','PENDING')",
  );
  await db.query(
    "INSERT INTO discovery_reviews (id,business_id,reviewer_user_id,reviewer_name,rating,title,body,status) VALUES ('merchant_review_1','merchant_trust_business','customer-1','Customer',5,'Good','Great service','PUBLISHED')",
  );
  await db.query(
    "INSERT INTO discovery_reviews (id,business_id,reviewer_user_id,reviewer_name,rating,title,body,status) VALUES ('merchant_review_2','merchant_trust_business','customer-2','Customer',2,'Needs work','Needs moderation','PENDING')",
  );
  await db.query(
    "INSERT INTO discovery_reports (id,business_id,reporter_user_id,reason_code,description,status) VALUES ('merchant_report_1','merchant_trust_business','reporter-secret','MISLEADING','private reporter text','UNDER_REVIEW')",
  );
  await db.query(
    "INSERT INTO discovery_trust_events (id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES ('merchant_trust_evt','merchant_trust_business','VERIFICATION','merchant_ver_1','VERIFICATION_DECIDED','PENDING','REJECTED','platform-secret','Evidence needs clarification',$1)",
    [{ private: 'do-not-expose' }],
  );

  const businessId='merchant_trust_business';
  const currentUser='merchant-owner';

  const applications = await db.query(
    "SELECT id,business_id,status,created_at,updated_at,reviewed_at,review_reason FROM discovery_verification_applications WHERE business_id=$1 ORDER BY created_at DESC LIMIT 20",
    [businessId],
  );
  assert.strictEqual(applications.rows[0].review_reason, 'Evidence needs clarification');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(applications.rows[0], 'evidence'), false);

  const claims = await db.query(
    "SELECT id,status,created_at,reviewed_at,review_reason,CASE WHEN claimant_user_id=$2 THEN TRUE ELSE FALSE END AS submitted_by_current_user FROM discovery_business_claims WHERE business_id=$1 ORDER BY created_at DESC LIMIT 20",
    [businessId,currentUser],
  );
  assert.strictEqual(claims.rows.length, 2);
  assert.strictEqual(claims.rows[0].submitted_by_current_user, false);
  assert.strictEqual(claims.rows[1].submitted_by_current_user, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(claims.rows[0], 'claimant_email'), false);

  const summary = await db.query(
    "SELECT COUNT(*) FILTER (WHERE status='PUBLISHED')::int AS published_count,COUNT(*) FILTER (WHERE status='PENDING')::int AS pending_count,COALESCE(ROUND(AVG(rating) FILTER (WHERE status='PUBLISHED'),2),0) AS published_rating FROM discovery_reviews WHERE business_id=$1",
    [businessId],
  );
  assert.strictEqual(Number(summary.rows[0].published_count),1);
  assert.strictEqual(Number(summary.rows[0].pending_count),1);
  assert.strictEqual(Number(summary.rows[0].published_rating),5);

  const reports = await db.query(
    "SELECT id,reason_code,status,resolution_note,created_at,resolved_at,CASE WHEN service_id IS NULL THEN 'BUSINESS' ELSE 'SERVICE' END AS target_type FROM discovery_reports WHERE business_id=$1",
    [businessId],
  );
  assert.strictEqual(reports.rows[0].reason_code, 'MISLEADING');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(reports.rows[0], 'reporter_user_id'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(reports.rows[0], 'description'), false);

  const events = await db.query(
    "SELECT id,entity_type,event_type,from_status,to_status,reason,created_at FROM discovery_trust_events WHERE business_id=$1",
    [businessId],
  );
  assert.strictEqual(events.rows[0].reason, 'Evidence needs clarification');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(events.rows[0], 'actor_user_id'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(events.rows[0], 'metadata'), false);

  const other = await db.query("SELECT organization_id,created_by_user_id FROM discovery_businesses WHERE id=$1",[ 'other_trust_business' ]);
  assert.notStrictEqual(other.rows[0].organization_id, 'merchant_trust_org');

  console.log('Discovery merchant trust center tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
