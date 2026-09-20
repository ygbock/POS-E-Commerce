import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO discovery_businesses (id,public_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('fav_business','fav_public','Favorite Business','favorite-business','DISCOVERY_ONLY','PUBLISHED','UNVERIFIED',TRUE,'owner')");
  await db.query("INSERT INTO discovery_businesses (id,public_id,name,slug,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id) VALUES ('hidden_business','hidden_public','Hidden Business','hidden-business','DISCOVERY_ONLY','DRAFT','UNVERIFIED',FALSE,'owner')");

  await db.query(
    "INSERT INTO discovery_business_favorites(id,business_id,user_id) VALUES ('fav_1','fav_business','customer-1')",
  );
  await db.query(
    "INSERT INTO discovery_business_favorites(id,business_id,user_id) VALUES ('fav_2','fav_business','customer-2')",
  );

  const mine = await db.query(
    "SELECT f.id AS favorite_id,b.id,b.name FROM discovery_business_favorites f JOIN discovery_businesses b ON b.id=f.business_id WHERE f.user_id=$1 ORDER BY f.created_at DESC",
    ['customer-1'],
  );
  assert.strictEqual(mine.rows.length, 1);
  assert.strictEqual(mine.rows[0].name, 'Favorite Business');

  await assert.rejects(
    () => db.query("INSERT INTO discovery_business_favorites(id,business_id,user_id) VALUES ('fav_duplicate','fav_business','customer-1')"),
    /unique|constraint|duplicate/i,
  );

  const publicSaved = await db.query(
    "SELECT b.id FROM discovery_business_favorites f JOIN discovery_businesses b ON b.id=f.business_id WHERE f.user_id=$1 AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE",
    ['customer-1'],
  );
  assert.strictEqual(publicSaved.rows.length, 1);

  await db.query("DELETE FROM discovery_business_favorites WHERE business_id=$1 AND user_id=$2", ['fav_business','customer-1']);
  const removed = await db.query("SELECT 1 FROM discovery_business_favorites WHERE business_id=$1 AND user_id=$2", ['fav_business','customer-1']);
  assert.strictEqual(removed.rows.length, 0);

  console.log('Discovery customer favorites tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
