import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_search_org','Search Test Org','DISC_SEARCH',TRUE)");

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const actor = { userId: 'disc-search-owner', role: 'admin', organizationId: 'disc_search_org' };

  const business = await service.create({
    name: 'Freetown Mobile Hub',
    shortDescription: 'Phones, accessories and repairs',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_search_org',
  }, actor);
  await service.submit(business.id, actor);
  await service.review(business.id, actor);
  await service.approve(business.id, actor);
  await service.publish(business.id, actor);

  await db.query(
    "INSERT INTO discovery_business_locations (id,business_id,name,city,district,region,latitude,longitude,is_primary,is_active) VALUES ('disc_search_loc',$1,'Main Branch','Freetown','Western Area Urban','Western Area',8.4840,-13.2299,TRUE,TRUE)",
    [business.id],
  );
  await db.query(
    "INSERT INTO discovery_business_category_map (business_id,category_id,is_primary) VALUES ($1,'disc_cat_electronics',TRUE)",
    [business.id],
  );
  await db.query(
    "INSERT INTO discovery_services (id,business_id,name,slug,description,service_type,booking_mode) VALUES ('disc_search_service',$1,'Phone Screen Repair','phone-screen-repair','Mobile phone screen replacement and repair','Repair','REQUEST')",
    [business.id],
  );

  const fts = await db.query(
    "SELECT id FROM discovery_businesses WHERE to_tsvector('simple',coalesce(name,'') || ' ' || coalesce(short_description,'')) @@ plainto_tsquery('simple',$1)",
    ['mobile phones'],
  );
  assert.ok(fts.rows.some((row:any) => row.id === business.id), 'business full-text search must match');

  const fuzzy = await db.query("SELECT discovery_search_similarity($1,$2) AS score", ['Freetown Mobile Hub', 'Freetown Moble Hub']);
  assert.ok(Number(fuzzy.rows[0]?.score) > 0.5, 'fuzzy search similarity must tolerate a typo');

  const serviceFuzzy = await db.query("SELECT discovery_search_similarity($1,$2) AS score", ['Phone Screen Repair', 'Phone Screen Repiar']);
  assert.ok(Number(serviceFuzzy.rows[0]?.score) > 0.5, 'service fuzzy similarity must tolerate a typo');

  const indexes = await db.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_discovery_business_search_fts','idx_products_discovery_search_fts','idx_discovery_services_search_fts') ORDER BY indexname",
  );
  assert.strictEqual(indexes.rows.length, 3, 'discovery search FTS indexes must be installed');

  console.log('Discovery search tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
