import assert from 'node:assert/strict';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO discovery_business_categories (id,name,slug,display_order,is_active) VALUES ('profile_cat','Profile Category','profile-category',1,TRUE)");

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const business = await service.create({
    name: 'Profile Contract Test',
    shortDescription: 'Public Discovery profile test',
    description: 'A complete public business profile contract test.',
    phone: '+23276000000',
    businessMode: 'DISCOVERY_ONLY',
  });

  await db.query("INSERT INTO discovery_business_category_map (business_id,category_id,is_primary) VALUES ($1,'profile_cat',TRUE)",[business.id]);
  await db.query(
    `INSERT INTO discovery_business_locations
      (id,business_id,name,city,district,region,latitude,longitude,is_primary,is_active)
     VALUES ('profile_loc',$1,'Main Branch','Freetown','Western Area Urban','Western Area',8.4840,-13.2299,TRUE,TRUE)`,
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_business_hours
      (id,location_id,day_of_week,is_closed,opens_at,closes_at)
     VALUES
      ('profile_mon','profile_loc',1,FALSE,'08:00','18:00'),
      ('profile_tue','profile_loc',2,FALSE,'08:00','18:00'),
      ('profile_sun','profile_loc',7,TRUE,NULL,NULL)`,
  );
  await db.query(
    `INSERT INTO discovery_services
      (id,business_id,name,slug,description,service_type,booking_mode,is_active)
     VALUES ('profile_service',$1,'Profile Service','profile-service','Public service','General','REQUEST',TRUE)`,
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_reviews
      (id,business_id,reviewer_name,rating,title,body,verified_purchase,status)
     VALUES ('profile_review',$1,'Profile Customer',5,'Great listing','Useful public profile.',FALSE,'PUBLISHED')`,
    [business.id],
  );
  await db.query("UPDATE discovery_businesses SET listing_status='PUBLISHED',is_discoverable=TRUE WHERE id=$1",[business.id]);

  const profile = await service.getPublicProfile(business.id);
  assert.ok(profile, 'published business must expose a public profile');
  assert.equal(profile.business.id, business.id);
  assert.equal(profile.locations.length, 1);
  assert.equal(profile.categories.length, 1);
  assert.equal(profile.hours.length, 3, 'public profile must include published weekly hours');
  assert.equal(profile.activeServices.length, 1, 'public profile must include active services');
  assert.equal(profile.recentReviews.length, 1, 'public profile must include published reviews');
  assert.equal(Number(profile.reviewsSummary.rating), 5);
  assert.equal(profile.reviewsSummary.count, 1);

  await db.query("UPDATE discovery_businesses SET listing_status='PAUSED' WHERE id=$1",[business.id]);
  const hidden = await service.getPublicProfile(business.id);
  assert.equal(hidden, null, 'non-published listings must not expose a public profile');


  const fs = await import('node:fs');
  const path = await import('node:path');
  const profileUi = fs.readFileSync(path.join(process.cwd(), 'src/components/discovery/DiscoveryBusinessProfile.tsx'), 'utf8');
  assert.match(profileUi, /canSubmitOwnershipClaim/);
  assert.match(profileUi, /authClient\.getUser\(\)\?\.role === 'business_owner'/);

  console.log('Discovery business profile tests passed: 12 assertions');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});