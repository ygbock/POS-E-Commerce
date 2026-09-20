import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const migration = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name='discovery_contact_inquiries'",
  );
  assert.strictEqual(migration.rows.length, 1, 'contact inquiry table must exist');

  await db.query(
    "INSERT INTO discovery_businesses (id,public_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('contact_business','contact_public','Contact Business','contact-business','DISCOVERY_ONLY','PUBLISHED','UNVERIFIED',TRUE,'owner')",
  );

  await db.query(
    "INSERT INTO discovery_contact_inquiries (id,business_id,customer_user_id,customer_name,customer_email,customer_phone,subject,message) VALUES ('inq_1','contact_business','customer-1','Jane Doe','jane@example.com','+23276000000','Product availability','Is this item available?')",
  );

  const open = await db.query("SELECT * FROM discovery_contact_inquiries WHERE id='inq_1'");
  assert.strictEqual(open.rows[0].status, 'OPEN');
  assert.strictEqual(open.rows[0].customer_user_id, 'customer-1');

  await db.query("UPDATE discovery_contact_inquiries SET status='READ',updated_at=CURRENT_TIMESTAMP WHERE id='inq_1'");
  await db.query("UPDATE discovery_contact_inquiries SET status='RESPONDED',responded_at=CURRENT_TIMESTAMP,merchant_note='Customer contacted by phone',updated_at=CURRENT_TIMESTAMP WHERE id='inq_1'");
  const responded = await db.query("SELECT status,responded_at,merchant_note FROM discovery_contact_inquiries WHERE id='inq_1'");
  assert.strictEqual(responded.rows[0].status, 'RESPONDED');
  assert.ok(responded.rows[0].responded_at);
  assert.strictEqual(responded.rows[0].merchant_note, 'Customer contacted by phone');

  await db.query("UPDATE discovery_contact_inquiries SET status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id='inq_1'");
  const closed = await db.query("SELECT status,closed_at FROM discovery_contact_inquiries WHERE id='inq_1'");
  assert.strictEqual(closed.rows[0].status, 'CLOSED');
  assert.ok(closed.rows[0].closed_at);

  await assert.rejects(
    () => db.query("INSERT INTO discovery_contact_inquiries(id,business_id,customer_name,message,status) VALUES ('inq_bad','contact_business','Bad User','x','INVALID')"),
    /check|constraint|invalid/i,
  );

  await assert.rejects(
    () => db.query("INSERT INTO discovery_contact_inquiries(id,business_id,customer_name,message) VALUES ('inq_empty','contact_business','Bad User','')"),
    /check|constraint|invalid/i,
  );

  console.log('Discovery contact inquiry tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
