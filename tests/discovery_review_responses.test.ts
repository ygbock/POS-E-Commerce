import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO discovery_businesses (id,public_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('review_response_business','rr_public','Review Response Business','review-response-business','DISCOVERY_ONLY','PUBLISHED','UNVERIFIED',TRUE,'owner')");
  await db.query("INSERT INTO discovery_reviews (id,business_id,reviewer_user_id,reviewer_name,rating,title,body,status) VALUES ('rr_review','review_response_business','customer','Customer',5,'Great','Excellent service','PUBLISHED')");

  await db.query(
    "INSERT INTO discovery_review_responses(id,review_id,business_id,responder_user_id,response) VALUES ('rr_response','rr_review','review_response_business','owner','Thank you for your feedback.')",
  );
  const response = await db.query("SELECT response FROM discovery_review_responses WHERE review_id='rr_review'");
  assert.strictEqual(response.rows[0].response, 'Thank you for your feedback.');

  await db.query(
    "INSERT INTO discovery_review_responses(id,review_id,business_id,responder_user_id,response) VALUES ('rr_response_new','rr_review','review_response_business','owner','We appreciate you.') ON CONFLICT(review_id) DO UPDATE SET response=EXCLUDED.response",
  );
  const updated = await db.query("SELECT response FROM discovery_review_responses WHERE review_id='rr_review'");
  assert.strictEqual(updated.rows[0].response, 'We appreciate you.');

  const publicReview = await db.query(
    "SELECT r.id,rr.response AS merchant_response FROM discovery_reviews r LEFT JOIN discovery_review_responses rr ON rr.review_id=r.id WHERE r.id='rr_review' AND r.status='PUBLISHED'",
  );
  assert.strictEqual(publicReview.rows[0].merchant_response, 'We appreciate you.');

  await assert.rejects(
    () => db.query("INSERT INTO discovery_review_responses(id,review_id,business_id,responder_user_id,response) VALUES ('rr_bad','rr_review','review_response_business','owner','')"),
    /check|constraint/i,
  );

  console.log('Discovery review response tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
