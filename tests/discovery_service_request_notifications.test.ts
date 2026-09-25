import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('notif_org','Notification Org','NOTIF_ORG',TRUE)");
  await db.query("INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active) VALUES ('notif_customer','notif_org','customer@example.test','Customer','x','x','viewer',TRUE),('notif_owner','notif_org','owner@example.test','Owner','x','x','business_owner',TRUE)");
  await db.query("INSERT INTO discovery_businesses (id,public_id,organization_id,name,slug,business_type,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('notif_business','NOTIF-PUBLIC','notif_org','Notification Provider','notification-provider','Services','DISCOVERY_AND_STORE','PUBLISHED','VERIFIED',TRUE,'notif_owner')");
  await db.query("INSERT INTO discovery_business_memberships(business_id,user_id,role,is_active) VALUES ('notif_business','notif_owner','OWNER',TRUE)");

  await db.query(
    "INSERT INTO discovery_service_requests(id,customer_user_id,customer_name,description) VALUES ('notif_request','notif_customer','Customer','Need a service')",
  );
  await db.query(
    "INSERT INTO discovery_service_request_events(id,request_id,event_type,from_status,to_status,actor_user_id,business_id,note) VALUES ('notif_event','notif_request','QUOTE_SUBMITTED','MATCHED','QUOTED','notif_owner','notif_business','A new quote was submitted.')",
  );

  const customer = await db.query("SELECT recipient_user_id,notification_type,title FROM discovery_service_request_notifications WHERE event_id='notif_event'");
  assert.strictEqual(customer.rows.length, 1);
  assert.strictEqual(customer.rows[0].recipient_user_id, 'notif_customer');
  assert.strictEqual(customer.rows[0].notification_type, 'QUOTE_SUBMITTED');

  await db.query(
    "INSERT INTO discovery_service_request_events(id,request_id,event_type,from_status,to_status,actor_user_id,business_id,quote_id,note) VALUES ('notif_event_accept','notif_request','QUOTE_ACCEPTED','QUOTED','ACCEPTED','notif_customer','notif_business','notif_quote','Customer accepted the quote.')",
  );
  const owner = await db.query("SELECT recipient_user_id,notification_type FROM discovery_service_request_notifications WHERE event_id='notif_event_accept'");
  assert.deepStrictEqual(owner.rows.map((row:any) => [row.recipient_user_id,row.notification_type]), [['notif_owner','QUOTE_ACCEPTED']]);

  const duplicate = await db.query("SELECT COUNT(*)::int AS count FROM discovery_service_request_notifications WHERE event_id='notif_event_accept' AND recipient_user_id='notif_owner'");
  assert.strictEqual(Number(duplicate.rows[0].count), 1);

  console.log('Discovery service request notification tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
