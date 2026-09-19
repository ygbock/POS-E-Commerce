import assert from 'assert';
import express from 'express';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';
import { discoveryFuzzyScore, rankDiscoveryFuzzy } from '../server/utils/discoverySearch';

async function requestJson(baseUrl: string, path: string) {
  const response = await fetch(baseUrl + path);
  const body = await response.json() as any;
  return { status: response.status, body };
}

async function waitForSearchEvent(db: DatabaseClient, queryHash: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await db.query(
      "SELECT metadata FROM discovery_analytics_events WHERE event_type='SEARCH' AND metadata->>'queryHash'=$1 ORDER BY created_at DESC LIMIT 1",
      [queryHash],
    );
    if (result.rows[0]) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_rank_org','Ranking Test Org','DISC_RANK',TRUE)");

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const actor = { userId: 'disc-rank-owner', role: 'admin', organizationId: 'disc_rank_org' };

  const exact = await service.create({
    name: 'Mobile Phones Freetown',
    shortDescription: 'Mobile phone sales',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_rank_org',
  }, actor);
  await db.query("INSERT INTO discovery_business_locations (id,business_id,name,city,is_primary,is_active) VALUES ('disc_rank_loc_exact',$1,'Main Branch','Freetown',TRUE,TRUE)",[exact.id]);
  for (const step of ['submit', 'review', 'approve', 'publish'] as const) await (service as any)[step](exact.id, actor);

  const typo = await service.create({
    name: 'Moble Phone Repairs',
    shortDescription: 'Phone repair services',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_rank_org',
  }, actor);
  await db.query("INSERT INTO discovery_business_locations (id,business_id,name,city,is_primary,is_active) VALUES ('disc_rank_loc_typo',$1,'Main Branch','Freetown',TRUE,TRUE)",[typo.id]);
  for (const step of ['submit', 'review', 'approve', 'publish'] as const) await (service as any)[step](typo.id, actor);

  const restaurant = await service.create({
    name: 'Freetown Restaurant',
    shortDescription: 'Local restaurant and takeaway',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_rank_org',
  }, actor);
  await db.query("INSERT INTO discovery_business_locations (id,business_id,name,city,is_primary,is_active) VALUES ('disc_rank_loc_rest',$1,'Main Branch','Freetown',TRUE,TRUE)",[restaurant.id]);
  for (const step of ['submit', 'review', 'approve', 'publish'] as const) await (service as any)[step](restaurant.id, actor);
  await db.query("INSERT INTO discovery_search_aliases (id,entity_type,entity_id,alias,normalized_alias) VALUES ('disc_rank_alias_rest','BUSINESS',$1,'Chop House','chop house')",[restaurant.id]);

  const hidden = await service.create({
    name: 'Mobile Hidden Listing',
    shortDescription: 'Should never appear publicly',
    businessMode: 'DISCOVERY_ONLY',
  }, actor);

  assert.ok(discoveryFuzzyScore('moble', 'Mobile') > 0.7, 'single-token typo should receive a meaningful fuzzy score');
  assert.ok(discoveryFuzzyScore('mobil phone', 'Mobile Phones Freetown') > 0.8, 'multi-token typo search should retain strong token coverage');
  assert.ok(discoveryFuzzyScore('restarant', 'Restaurant') > 0.7, 'common missing-letter typo should receive a meaningful fuzzy score');
  assert.ok(discoveryFuzzyScore('mobile', 'Mobile') > discoveryFuzzyScore('mobile', 'Moble'), 'exact spelling should outrank typo spelling');

  const ranked = rankDiscoveryFuzzy('moble', [
    { id: 'exact', text: 'Mobile Phones' },
    { id: 'typo', text: 'Moble Phone Repairs' },
    { id: 'other', text: 'School Supplies' },
  ]);
  assert.strictEqual(ranked[0].item.id, 'exact', 'fuzzy ranking should prefer the closest candidate');
  assert.ok(ranked[0].fuzzyScore > ranked[1].fuzzyScore, 'ranking should expose deterministic fuzzy scores');

  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const suggestionResponse = await requestJson(baseUrl, '/api/discovery/search/suggestions?q=moble&limit=5');
    assert.strictEqual(suggestionResponse.status, 200);
    assert.ok(
      suggestionResponse.body.data.some((row:any) => row.label === exact.name && row.type === 'business'),
      'suggestions should recover the correctly spelled business for a typo query',
    );
    assert.ok(
      suggestionResponse.body.data.some((row:any) => row.label === typo.name && row.type === 'business'),
      'suggestions should include a typo-compatible business candidate',
    );
    assert.strictEqual(
      suggestionResponse.body.data[0].label,
      exact.name,
      'suggestions should rank the corrected spelling ahead of the literal typo',
    );

    const fuzzyResponse = await requestJson(baseUrl, '/api/discovery/search?q=moble&type=businesses&limit=10');
    assert.strictEqual(fuzzyResponse.status, 200);
    const fuzzyBusinesses = fuzzyResponse.body.data.businesses;
    assert.ok(fuzzyBusinesses.some((row:any) => row.id === exact.id), 'typo search should find the exact business candidate');
    assert.ok(fuzzyBusinesses.some((row:any) => row.id === typo.id), 'typo search should find the typo-compatible candidate');
    assert.ok(!fuzzyBusinesses.some((row:any) => row.id === hidden.id), 'unpublished listings must never leak through fuzzy search');

    const multiTokenResponse = await requestJson(baseUrl, '/api/discovery/search?q=mobil%20phone&type=businesses&limit=10');
    assert.strictEqual(multiTokenResponse.status, 200);
    assert.ok(multiTokenResponse.body.data.businesses.some((row:any) => row.id === exact.id), 'multi-token typo search should recover the correctly spelled business');

    const aliasSuggestion = await requestJson(baseUrl, '/api/discovery/search/suggestions?q=chop&limit=5');
    assert.strictEqual(aliasSuggestion.status, 200);
    assert.ok(aliasSuggestion.body.data.some((row:any) => row.label === 'Chop House' && row.type === 'business'), 'search suggestions should include configured business aliases');

    const aliasResponse = await requestJson(baseUrl, '/api/discovery/search?q=chop%20house&type=businesses&limit=10');
    assert.strictEqual(aliasResponse.status, 200);
    assert.ok(aliasResponse.body.data.businesses.some((row:any) => row.id === restaurant.id), 'configured search aliases should recover the canonical business');

    const repeatedOne = await requestJson(baseUrl, '/api/discovery/search?q=mobile&type=businesses&limit=1&offset=0');
    const repeatedTwo = await requestJson(baseUrl, '/api/discovery/search?q=mobile&type=businesses&limit=1&offset=0');
    assert.strictEqual(repeatedOne.status, 200);
    assert.strictEqual(repeatedTwo.status, 200);
    assert.strictEqual(repeatedOne.body.data.businesses[0]?.id, repeatedTwo.body.data.businesses[0]?.id, 'relevance pagination must be deterministic');
    const exactResponse = await requestJson(baseUrl, '/api/discovery/search?q=mobile&type=businesses&limit=10');
    assert.strictEqual(exactResponse.status, 200);
    assert.strictEqual(exactResponse.body.data.businesses[0].id, exact.id, 'exact spelling should outrank typo-compatible result');

    const queryHash = createHash('sha256').update('moble').digest('hex');
    const event = await waitForSearchEvent(db, queryHash);
    assert.ok(event, 'search analytics event should be recorded');
    assert.strictEqual(event.metadata.type, 'businesses');
    assert.strictEqual(event.metadata.zeroResults, false);
    assert.strictEqual(event.metadata.resultCounts.businesses, fuzzyResponse.body.counts.businesses);
    assert.ok(!JSON.stringify(event.metadata).includes('Moble'), 'search analytics must not store the raw query');

    const emptyResponse = await requestJson(baseUrl, '/api/discovery/search?q=zzzzzznotfound&type=businesses&limit=10');
    assert.strictEqual(emptyResponse.status, 200);
    assert.strictEqual(emptyResponse.body.counts.businesses, 0);
    const emptyHash = (await import('node:crypto')).createHash('sha256').update('zzzzzznotfound').digest('hex');
    const emptyEvent = await waitForSearchEvent(db, emptyHash);
    assert.ok(emptyEvent, 'zero-result searches should be tracked');
    assert.strictEqual(emptyEvent.metadata.zeroResults, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log('Discovery fuzzy ranking and analytics tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
