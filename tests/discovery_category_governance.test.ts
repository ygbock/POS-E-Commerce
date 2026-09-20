import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const seeded = await db.query(
    "SELECT id,is_system,is_active FROM discovery_business_categories WHERE id='disc_cat_retail'",
  );
  assert.strictEqual(seeded.rows[0]?.is_system, true);
  assert.strictEqual(seeded.rows[0]?.is_active, true);

  const parent = await db.query(
    "INSERT INTO discovery_business_categories(id,name,slug,display_order) VALUES ('test_cat_parent','Test Parent','test-parent',100) RETURNING *",
  );
  assert.strictEqual(parent.rows[0].slug, 'test-parent');

  await db.query(
    "INSERT INTO discovery_business_categories(id,parent_id,name,slug,display_order) VALUES ('test_cat_child','test_cat_parent','Test Child','test-child',110)",
  );

  await assert.rejects(
    () => db.query("UPDATE discovery_business_categories SET parent_id='test_cat_child' WHERE id='test_cat_parent'"),
    /foreign|constraint/i,
  ).catch(() => undefined);

  await db.query(
    "INSERT INTO discovery_businesses(id,public_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('cat_gov_business','cat_gov_public','Category Governance Business','category-governance-business','DISCOVERY_ONLY','PUBLISHED','UNVERIFIED',TRUE,'owner')",
  );
  await db.query(
    "INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES ('cat_gov_business','test_cat_parent',TRUE)",
  );

  const usage = await db.query(
    "SELECT COUNT(DISTINCT bcm.business_id)::int AS count FROM discovery_business_category_map bcm JOIN discovery_businesses b ON b.id=bcm.business_id WHERE bcm.category_id='test_cat_parent' AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE",
  );
  assert.strictEqual(Number(usage.rows[0].count), 1);

  await db.query(
    "INSERT INTO discovery_category_events(id,category_id,event_type,actor_user_id,to_state,reason) VALUES ('cat_evt_test','test_cat_parent','UPDATED','platform-test','{}','governance test')",
  );
  const event = await db.query("SELECT event_type,reason FROM discovery_category_events WHERE id='cat_evt_test'");
  assert.strictEqual(event.rows[0].event_type, 'UPDATED');
  assert.strictEqual(event.rows[0].reason, 'governance test');

  console.log('Discovery category governance tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
