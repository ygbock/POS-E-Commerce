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

  const indexes = await db.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_discovery_business_search_fts','idx_products_discovery_search_fts','idx_discovery_services_search_fts') ORDER BY indexname",
  );
  assert.strictEqual(indexes.rows.length, 3, 'discovery search FTS indexes must be installed');

  const attributionColumns = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='discovery_analytics_events' AND column_name IN ('search_id','result_position','entity_type','entity_id','attribution_source') ORDER BY column_name",
  );
  assert.strictEqual(attributionColumns.rows.length, 5, 'search attribution columns must be installed');

  const rankingConfig = await db.query("SELECT id,text_match_weight,exact_match_weight,prefix_match_weight,verified_weight,rating_weight,review_count_weight,fuzzy_match_weight,distance_penalty_weight,availability_weight,is_active FROM discovery_search_ranking_config WHERE id='default'");
  assert.strictEqual(rankingConfig.rows.length, 1, 'default search ranking configuration must be installed');
  assert.strictEqual(Number(rankingConfig.rows[0].text_match_weight), 100);
  assert.strictEqual(Number(rankingConfig.rows[0].fuzzy_match_weight), 35);

  const aliasIndexes = await db.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('uq_discovery_search_alias_entity','idx_discovery_search_alias_lookup','idx_discovery_search_alias_entity','idx_discovery_search_alias_fts','idx_discovery_search_alias_prefix') ORDER BY indexname",
  );
  assert.strictEqual(aliasIndexes.rows.length, 5, 'discovery search alias indexes must be installed');
  await db.query("INSERT INTO discovery_search_aliases (id,entity_type,entity_id,alias,normalized_alias) VALUES ('disc_search_alias',$1,$2,$3,$4)", ['BUSINESS', business.id, 'cell phones', 'cell phones']);
  const alias = await db.query("SELECT alias FROM discovery_search_aliases WHERE entity_type='BUSINESS' AND entity_id=$1 AND is_active=TRUE", [business.id]);
  assert.strictEqual(alias.rows[0]?.alias, 'cell phones', 'search aliases must persist normalized discovery vocabulary');

  console.log('Discovery search tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
