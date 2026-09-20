import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO discovery_businesses(id,public_id,name,slug,business_mode,listing_status,verification_status,is_discoverable) VALUES ('loc_quality_biz','loc_quality_public','Location Quality Test','location-quality-test','DISCOVERY_ONLY','PUBLISHED','UNVERIFIED',TRUE)");

  const created = await db.query(
    'INSERT INTO discovery_business_locations (id,business_id,name,location_type,city,district,region,latitude,longitude,service_radius_km,is_primary,is_active,location_quality_status,location_source,address_completeness_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
    ['loc_quality_1','loc_quality_biz','Primary','SERVICE_AREA','Freetown','Western Area Urban','Western Area',8.48,-13.23,15,true,true,'HIGH','GPS',100],
  );
  assert.strictEqual(created.rows[0].location_quality_status, 'HIGH');
  assert.strictEqual(created.rows[0].location_source, 'GPS');
  assert.strictEqual(Number(created.rows[0].address_completeness_score), 100);

  await assert.rejects(
    () => db.query("INSERT INTO discovery_business_locations(id,business_id,name,location_type,city,latitude,longitude,is_primary,is_active) VALUES ('loc_quality_bad','loc_quality_biz','Bad Service Area','SERVICE_AREA','Freetown',8.48,-13.23,TRUE,TRUE)"),
    /service_area_radius/,
  );

  await assert.rejects(
    () => db.query("INSERT INTO discovery_business_locations(id,business_id,name,location_type,latitude,longitude,is_primary,is_active) VALUES ('loc_quality_bad_coords','loc_quality_biz','Bad Coordinates','STORE',91,-13.23,FALSE,TRUE)"),
    /latitude/,
  );

  const distance = await db.query(
    "SELECT 6371 * acos(LEAST(1,GREATEST(-1, cos(radians(8.48))*cos(radians(latitude))*cos(radians(longitude)-radians(-13.23)) + sin(radians(8.48))*sin(radians(latitude)) ))) AS distance_km FROM discovery_business_locations WHERE id='loc_quality_1'",
  );
  assert.ok(Number(distance.rows[0].distance_km) < 0.01);

  console.log('Discovery location quality tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});