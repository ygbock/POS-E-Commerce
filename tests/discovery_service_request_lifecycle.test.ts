import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('req_org','Request Org','REQ_ORG',TRUE)");
  await db.query("INSERT INTO discovery_businesses (id,public_id,organization_id,name,slug,business_type,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('req_business','REQ-PUBLIC','req_org','Request Provider','request-provider','Services','DISCOVERY_AND_STORE','PUBLISHED','VERIFIED',TRUE,'req-owner')");
  await db.query("INSERT INTO discovery_services (id,business_id,name,slug,booking_mode) VALUES ('req_service','req_business','Home Service','home-service','QUOTE')");

  const requestId = 'req_lifecycle';
  await db.query(
    "INSERT INTO discovery_service_requests (id,customer_user_id,customer_name,description,city,budget_from,budget_to,preferred_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [requestId,'req-customer','Customer One','Need a home service.','Freetown',100,250,'2099-01-01'],
  );

  await db.query(
    "INSERT INTO discovery_service_request_events (id,request_id,from_status,to_status,actor_user_id,note) VALUES ('req_evt_open',$1,NULL,'OPEN','req-customer','Request created.')",
    [requestId],
  );

  await db.query("UPDATE discovery_service_requests SET status='MATCHED' WHERE id=$1", [requestId]);
  await db.query("INSERT INTO discovery_service_request_matches(request_id,business_id,match_score) VALUES($1,'req_business',1)", [requestId]);
  await db.query("UPDATE discovery_service_requests SET status='QUOTED' WHERE id=$1", [requestId]);

  await db.query(
    "INSERT INTO discovery_service_quotes(id,request_id,business_id,service_id,amount,currency,status) VALUES ('quote_one',$1,'req_business','req_service',200,'SLE','ACCEPTED')",
    [requestId],
  );

  await assert.rejects(
    () => db.query(
      "INSERT INTO discovery_service_quotes(id,request_id,business_id,service_id,amount,currency,status) VALUES ('quote_two',$1,'req_business','req_service',220,'SLE','ACCEPTED')",
      [requestId],
    ),
    /duplicate key|unique/i,
  );

  await db.query("UPDATE discovery_service_requests SET status='ACCEPTED' WHERE id=$1", [requestId]);
  const current = await db.query("SELECT status,budget_from,budget_to FROM discovery_service_requests WHERE id=$1", [requestId]);
  assert.strictEqual(current.rows[0].status, 'ACCEPTED');
  assert.strictEqual(Number(current.rows[0].budget_from), 100);
  assert.strictEqual(Number(current.rows[0].budget_to), 250);

  await assert.rejects(
    () => db.query(
      "INSERT INTO discovery_service_requests(id,customer_user_id,customer_name,description,budget_from,budget_to) VALUES ('req_bad_budget','req-customer','Customer','Bad budget',300,200)",
    ),
    /violates check constraint/i,
  );

  await db.query(
    "INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note) VALUES ('req_evt_accept',$1,'QUOTED','ACCEPTED','req-customer','Quote accepted.')",
    [requestId],
  );

  const events = await db.query("SELECT from_status,to_status FROM discovery_service_request_events WHERE request_id=$1 ORDER BY created_at,id", [requestId]);
  assert.deepStrictEqual(events.rows.map((r:any) => [r.from_status,r.to_status]), [
    [null,'OPEN'],
    ['QUOTED','ACCEPTED'],
  ]);

  console.log('Discovery service request lifecycle tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});