import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';
import fs from 'node:fs';
import path from 'node:path';
import { createIsolatedTestClient, type DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  // 1. Public profile, contact visibility, review visibility, and store-link visibility.
  await db.query(
    "INSERT INTO organizations (id,name,code,slug,is_active) VALUES ('pdv_org','Public Visibility Org','PDV_ORG','pdv-store',TRUE)",
  );
  const service = new DiscoveryBusinessService(new DiscoveryBusinessRepository(db), db);
  const business = await service.create({
    name: 'Public Discovery Visibility Fixture',
    shortDescription: 'Visibility and multi-location regression fixture',
    description: 'A public listing used to verify visibility controls.',
    phone: '+23276000123',
    whatsapp: '+23277000123',
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'pdv_org',
  });
  await db.query(
    "INSERT INTO discovery_business_categories (id,name,slug,display_order,is_active) VALUES ('pdv_cat','PDV Category','pdv-category',1,TRUE)",
  );
  await db.query(
    "INSERT INTO discovery_business_category_map (business_id,category_id,is_primary) VALUES ($1,'pdv_cat',TRUE)",
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_business_locations
      (id,business_id,name,city,district,region,latitude,longitude,phone,is_primary,is_active)
     VALUES
      ('pdv_loc_primary',$1,'Primary Branch','Freetown','Western Area Urban','Western Area',8.4840,-13.2299,'+23276000999',TRUE,TRUE),
      ('pdv_loc_secondary',$1,'Secondary Branch','Bo','Bo District','Southern Province',7.9640,-11.7380,'+23276000888',FALSE,TRUE)`,
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_reviews
      (id,business_id,reviewer_name,rating,title,body,verified_purchase,status)
     VALUES ('pdv_review',$1,'PDV Reviewer',5,'Public review','Review visibility regression fixture.',FALSE,'PUBLISHED')`,
    [business.id],
  );
  await db.query(
    "UPDATE discovery_businesses SET listing_status='PUBLISHED',is_discoverable=TRUE WHERE id=$1",
    [business.id],
  );

  // Exercise the real public HTTP endpoints, not just equivalent SQL or source strings.
  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(db));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Public visibility test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const getJson = async (route: string) => {
    const response = await fetch(baseUrl + route);
    return { status: response.status, body: await response.json() as any };
  };

  try {
  await db.query(
    `UPDATE discovery_business_settings
        SET allow_phone_contact=FALSE,allow_whatsapp_contact=FALSE,
            allow_reviews=FALSE,allow_public_store_link=FALSE
      WHERE business_id=$1`,
    [business.id],
  );

  const hiddenBusinessList = await getJson('/api/discovery/businesses?city=Freetown&limit=20');
  assert.equal(hiddenBusinessList.status, 200, `public business list failed: ${JSON.stringify(hiddenBusinessList.body)}`);
  const hiddenListedBusiness = hiddenBusinessList.body.data.find((item: any) => item.id === business.id);
  assert.ok(hiddenListedBusiness, 'published business should appear in the public business list');
  assert.equal(hiddenListedBusiness.phone, null, 'public business list must mask disabled phone contact');
  assert.equal(hiddenListedBusiness.whatsapp, null, 'public business list must mask disabled WhatsApp contact');

  const hiddenPublicProfile = await getJson(`/api/discovery/businesses/${encodeURIComponent(business.slug)}`);
  assert.equal(hiddenPublicProfile.status, 200, `public profile endpoint failed: ${JSON.stringify(hiddenPublicProfile.body)}`);
  assert.equal(hiddenPublicProfile.body.data.business.phone, null, 'public profile route must mask disabled phone contact');
  assert.equal(hiddenPublicProfile.body.data.business.whatsapp, null, 'public profile route must mask disabled WhatsApp contact');
  assert.equal(hiddenPublicProfile.body.data.business.tenant_slug, null, 'public profile route must mask disabled store links');
  assert.deepEqual(hiddenPublicProfile.body.data.recentReviews, [], 'public profile route must suppress reviews when disabled');
  assert.equal(Number(hiddenPublicProfile.body.data.reviewsSummary.count), 0, 'public profile route must suppress review counts when disabled');

  const hiddenSearch = await getJson('/api/discovery/search?type=businesses&city=Freetown&limit=20');
  assert.equal(hiddenSearch.status, 200, `public business search failed: ${JSON.stringify(hiddenSearch.body)}`);
  const hiddenSearchBusiness = hiddenSearch.body.data.businesses.find((item: any) => item.id === business.id);
  assert.ok(hiddenSearchBusiness, 'published listing should appear in the real public search endpoint');
  assert.equal(hiddenSearchBusiness.phone, null, 'search endpoint must mask disabled phone contact');
  assert.equal(hiddenSearchBusiness.whatsapp, null, 'search endpoint must mask disabled WhatsApp contact');
  assert.equal(hiddenSearchBusiness.tenant_slug, null, 'search endpoint must mask disabled public store links');
  assert.equal(Number(hiddenSearchBusiness.rating), 0, 'search endpoint must suppress ratings when reviews are disabled');
  assert.equal(Number(hiddenSearchBusiness.review_count), 0, 'search endpoint must suppress review counts when reviews are disabled');

  const hiddenLocations = await getJson(`/api/discovery/businesses/${encodeURIComponent(business.id)}/locations`);
  assert.equal(hiddenLocations.status, 200, `public locations endpoint failed: ${JSON.stringify(hiddenLocations.body)}`);
  assert.ok(hiddenLocations.body.data.every((location: any) => location.phone === null), 'real locations endpoint must mask branch phone numbers');

  const hiddenReviews = await getJson(`/api/discovery/businesses/${encodeURIComponent(business.id)}/reviews`);
  assert.equal(hiddenReviews.status, 200);
  assert.deepEqual(hiddenReviews.body.data, [], 'real reviews endpoint must not return reviews when disabled');
  assert.equal(Number(hiddenReviews.body.summary.count), 0, 'real reviews endpoint must suppress review count when disabled');

  // Exercise category, sort, distance, and open-now filters through the public HTTP API.
  const categorySearch = await getJson('/api/discovery/search?type=businesses&categoryId=pdv_cat&limit=20');
  assert.equal(categorySearch.status, 200, `category-filtered search failed: ${JSON.stringify(categorySearch.body)}`);
  assert.ok(categorySearch.body.data.businesses.some((item: any) => item.id === business.id), 'category filter must include a listing mapped to the active category');

  const nameSortedSearch = await getJson('/api/discovery/search?type=businesses&sort=name_asc&limit=20');
  assert.equal(nameSortedSearch.status, 200, `name-sorted search failed: ${JSON.stringify(nameSortedSearch.body)}`);
  const nameSortedNames = nameSortedSearch.body.data.businesses.map((item: any) => String(item.name));
  assert.deepEqual(nameSortedNames, [...nameSortedNames].sort((a: string, b: string) => a.localeCompare(b)), 'name_asc must return alphabetically ordered businesses');

  const distanceSearch = await getJson('/api/discovery/search?type=businesses&lat=7.9640&lng=-11.7380&radiusKm=5&sort=distance&limit=20');
  assert.equal(distanceSearch.status, 200, `distance search failed: ${JSON.stringify(distanceSearch.body)}`);
  const distanceBusiness = distanceSearch.body.data.businesses.find((item: any) => item.id === business.id);
  assert.ok(distanceBusiness, 'distance filter should match the secondary branch coordinates in range');
  assert.equal(distanceBusiness.city, 'Bo', 'distance-filtered results must return the branch that satisfied the radius');
  assert.ok(Number(distanceBusiness.distance_km) <= 5, 'distance sort/filter must return a computed distance within the requested radius');

  const now = new Date();
  const nowDow = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  await db.query(
    `INSERT INTO discovery_business_hours (id,location_id,day_of_week,opens_at,closes_at,is_closed)
     VALUES ('pdv_hours_today','pdv_loc_primary',$1,'00:00','23:59:59',FALSE)`,
    [nowDow],
  );
  const openNowSearch = await getJson('/api/discovery/search?type=businesses&city=Freetown&openNow=true&limit=20');
  assert.equal(openNowSearch.status, 200, `open-now search failed: ${JSON.stringify(openNowSearch.body)}`);
  assert.ok(openNowSearch.body.data.businesses.some((item: any) => item.id === business.id), 'openNow must include a listing with an active branch open at the current UTC time');

  const ratingSortedHidden = await getJson('/api/discovery/search?type=businesses&sort=rating&limit=20');
  assert.equal(ratingSortedHidden.status, 200, `rating-sorted search failed: ${JSON.stringify(ratingSortedHidden.body)}`);
  const hiddenRatingSortedBusiness = ratingSortedHidden.body.data.businesses.find((item: any) => item.id === business.id);
  assert.equal(Number(hiddenRatingSortedBusiness.rating), 0, 'rating sorting must not expose a hidden aggregate rating');
  assert.equal(Number(hiddenRatingSortedBusiness.review_count), 0, 'review-count sorting must not expose a hidden review count');
  const reviewCountSortedHidden = await getJson('/api/discovery/search?type=businesses&sort=review_count&limit=20');
  assert.equal(reviewCountSortedHidden.status, 200, `review-count-sorted search failed: ${JSON.stringify(reviewCountSortedHidden.body)}`);
  assert.equal(Number(reviewCountSortedHidden.body.data.businesses.find((item: any) => item.id === business.id).review_count), 0, 'review_count sorting must respect disabled review visibility');

  const matchingBranchSearch = await getJson('/api/discovery/search?type=businesses&city=Bo&region=Southern%20Province&limit=20');
  assert.equal(matchingBranchSearch.status, 200, `multi-location search failed: ${JSON.stringify(matchingBranchSearch.body)}`);
  const matchingSearchBusiness = matchingBranchSearch.body.data.businesses.find((item: any) => item.id === business.id);
  assert.ok(matchingSearchBusiness, 'active secondary branch must make the listing match the Bo search');
  assert.equal(matchingSearchBusiness.city, 'Bo', 'search result must describe the branch that matched the filter');

  const categoriesResponse = await getJson('/api/discovery/categories');
  assert.equal(categoriesResponse.status, 200);
  assert.ok(categoriesResponse.body.data.some((category: any) => category.id === 'pdv_cat'), 'active category should be returned by the real category endpoint');

  const hiddenSettingsProfile = await service.getPublicProfile(business.id);
  assert.ok(hiddenSettingsProfile, 'published and discoverable business should have a public profile');
  assert.equal(hiddenSettingsProfile.business.phone, null, 'disabled phone contact must not leak from profile API');
  assert.equal(hiddenSettingsProfile.business.whatsapp, null, 'disabled WhatsApp contact must not leak from profile API');
  assert.equal(hiddenSettingsProfile.business.tenant_slug, null, 'disabled public store link must not expose the tenant slug');
  assert.ok(hiddenSettingsProfile.locations.every((location) => location.phone === null), 'disabled phone contact must also mask branch phone numbers');
  assert.deepEqual(hiddenSettingsProfile.recentReviews, [], 'disabled reviews must not be returned by profile API');
  assert.equal(Number(hiddenSettingsProfile.reviewsSummary.rating), 0, 'disabled reviews must not expose an aggregate rating');
  assert.equal(Number(hiddenSettingsProfile.reviewsSummary.count), 0, 'disabled reviews must not expose a review count');

  await db.query(
    `UPDATE discovery_business_settings
        SET allow_phone_contact=TRUE,allow_whatsapp_contact=TRUE,
            allow_reviews=TRUE,allow_public_store_link=TRUE
      WHERE business_id=$1`,
    [business.id],
  );

  const visiblePublicProfile = await getJson(`/api/discovery/businesses/${encodeURIComponent(business.slug)}`);
  assert.equal(visiblePublicProfile.status, 200, `visible public profile failed: ${JSON.stringify(visiblePublicProfile.body)}`);
  assert.equal(visiblePublicProfile.body.data.business.phone, '+23276000123');
  assert.equal(visiblePublicProfile.body.data.business.whatsapp, '+23277000123');
  assert.equal(visiblePublicProfile.body.data.business.tenant_slug, 'pdv-store');
  assert.equal(visiblePublicProfile.body.data.recentReviews.length, 1);
  assert.equal(Number(visiblePublicProfile.body.data.reviewsSummary.rating), 5);
  assert.equal(Number(visiblePublicProfile.body.data.reviewsSummary.count), 1);

  const visibleSearch = await getJson('/api/discovery/search?type=businesses&city=Freetown&limit=20');
  assert.equal(visibleSearch.status, 200, `visible business search failed: ${JSON.stringify(visibleSearch.body)}`);
  const visibleSearchBusiness = visibleSearch.body.data.businesses.find((item: any) => item.id === business.id);
  assert.ok(visibleSearchBusiness);
  assert.equal(visibleSearchBusiness.phone, '+23276000123');
  assert.equal(visibleSearchBusiness.whatsapp, '+23277000123');
  assert.equal(visibleSearchBusiness.tenant_slug, 'pdv-store');

  const visibleLocations = await getJson(`/api/discovery/businesses/${encodeURIComponent(business.id)}/locations`);
  assert.equal(visibleLocations.status, 200);
  assert.equal(visibleLocations.body.data.find((location: any) => location.id === 'pdv_loc_primary')?.phone, '+23276000999');

  const visibleReviews = await getJson(`/api/discovery/businesses/${encodeURIComponent(business.id)}/reviews`);
  assert.equal(visibleReviews.status, 200, `public reviews endpoint failed: ${JSON.stringify(visibleReviews.body)}`);
  assert.equal(visibleReviews.body.data.length, 1, 'real reviews endpoint should return the published review when enabled');
  assert.equal(Number(visibleReviews.body.summary.count), 1);

  const visibleSettingsProfile = await service.getPublicProfile(business.id);
  assert.ok(visibleSettingsProfile);
  assert.equal(visibleSettingsProfile.business.phone, '+23276000123');
  assert.equal(visibleSettingsProfile.business.whatsapp, '+23277000123');
  assert.equal(visibleSettingsProfile.business.tenant_slug, 'pdv-store');
  assert.equal(visibleSettingsProfile.recentReviews.length, 1, 'published reviews should be visible when enabled');
  assert.equal(Number(visibleSettingsProfile.reviewsSummary.rating), 5);
  assert.equal(Number(visibleSettingsProfile.reviewsSummary.count), 1);

  // 2. Multi-location filtering must return the matching active branch, not only the primary.
  const matchingBranch = await db.query(
    `SELECT b.id,l.city
       FROM discovery_businesses b
       LEFT JOIN LATERAL (
         SELECT l.* FROM discovery_business_locations l
          WHERE l.business_id=b.id AND l.is_active=TRUE
          ORDER BY CASE WHEN lower(l.city)=lower($2) THEN 0 ELSE 1 END,
                   l.is_primary DESC,l.created_at ASC
          LIMIT 1
       ) l ON TRUE
      WHERE b.id=$1 AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE
        AND EXISTS (
          SELECT 1 FROM discovery_business_locations lm
           WHERE lm.business_id=b.id AND lm.is_active=TRUE AND lower(lm.city)=lower($2)
        )`,
    [business.id, 'Bo'],
  );
  assert.equal(matchingBranch.rows.length, 1, 'secondary branch must satisfy a city filter');
  assert.equal(matchingBranch.rows[0].city, 'Bo', 'search result should describe the branch that matched the location filter');

  await db.query("UPDATE discovery_business_locations SET is_active=FALSE WHERE id='pdv_loc_secondary'");
  const inactiveBranch = await db.query(
    `SELECT 1 FROM discovery_business_locations
      WHERE business_id=$1 AND is_active=TRUE AND lower(city)=lower($2)`,
    [business.id, 'Bo'],
  );
  assert.equal(inactiveBranch.rows.length, 0, 'inactive branches must not satisfy public location filters');

  // 3–6. Route/UI contracts ensure category, search, profile, reviews and visibility
  // behavior remains enforced at the API/data boundary rather than only in the UI.
  const root = process.cwd();
  const routes = fs.readFileSync(path.join(root, 'server/routes/discoveryRoutes.ts'), 'utf8');
  const profileUi = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryBusinessProfile.tsx'), 'utf8');
  const businessCard = fs.readFileSync(path.join(root, 'src/components/discovery/BusinessCard.tsx'), 'utf8');
  const categoryUi = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryCategoryExplorer.tsx'), 'utf8');
  const searchUi = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoverySearchResults.tsx'), 'utf8');

  // Search/filtering and public listing visibility.
  assert.ok(routes.includes('const reviewsAllowedExpr = "COALESCE((SELECT s.allow_reviews FROM discovery_business_settings s WHERE s.business_id=b.id), TRUE)"'), 'search ranking must respect review visibility without exposing ratings or review counts when disabled');
  assert.ok(routes.includes('locationMatchConditions'), 'business search must build correlated branch filters');
  assert.ok(routes.includes('productLocationConditions'), 'product search must filter against active branches');
  assert.ok(routes.includes('serviceLocationConditions'), 'service search must filter against active branches');
  assert.ok(routes.includes('ORDER BY CASE WHEN ${matchingLocationOrder} THEN 0 ELSE 1 END'), 'business search must return a location that matches its filters');
  assert.ok(routes.includes('CASE WHEN COALESCE(bds.allow_phone_contact, TRUE) THEN b.phone ELSE NULL END AS phone'), 'search results must mask disabled phone contact');
  assert.ok(routes.includes('CASE WHEN COALESCE(bds.allow_whatsapp_contact, TRUE) THEN b.whatsapp ELSE NULL END AS whatsapp'), 'search results must mask disabled WhatsApp contact');
  assert.ok(routes.includes('locations.map((location) => ({ ...location, phone: null }))'), 'public location endpoint must mask disabled branch phone numbers');
  assert.ok(routes.includes('CASE WHEN COALESCE(bds.allow_public_store_link, TRUE) THEN o.slug ELSE NULL END AS tenant_slug'), 'search results must mask disabled storefront links');
  assert.ok(routes.includes('CASE WHEN COALESCE(ds.show_prices, TRUE) THEN v.retail_price ELSE NULL END AS retail_price'), 'product search must not return prices when hidden');
  assert.ok(routes.includes('CASE WHEN COALESCE(ds.show_stock_status, FALSE) THEN COALESCE(SUM(ib.available),0) ELSE NULL END AS available_stock'), 'product search must not return stock counts when hidden');
  const attributionStart = routes.indexOf("router.post('/search/events'");
  const attributionEnd = routes.indexOf("router.post('/businesses/:id/reviews/:reviewId/response'", attributionStart);
  const attributionRoute = routes.slice(attributionStart, attributionEnd);
  assert.ok(attributionRoute.includes('COALESCE(ds.show_products,TRUE)=TRUE'), 'product attribution must reject events for products hidden by the owning business');
  assert.ok(routes.includes("b.listing_status='PUBLISHED'") && routes.includes('b.is_discoverable=TRUE'), 'public search must exclude unpublished or undiscoverable listings');

  // Categories and listing details.
  const favoritesStart = routes.indexOf("router.get('/favorites'");
  const favoritesEnd = routes.indexOf("router.get('/businesses/:id/favorite'", favoritesStart);
  const favoritesRoute = routes.slice(favoritesStart, favoritesEnd);
  assert.ok(favoritesRoute.includes('settings?.allow_phone_contact === false ? null : business.phone'), 'customer favorites must mask disabled phone contact');
  assert.ok(favoritesRoute.includes('settings?.allow_whatsapp_contact === false ? null : business.whatsapp'), 'customer favorites must mask disabled WhatsApp contact');
  assert.ok(routes.includes("router.get('/categories'"), 'public category endpoint must exist');
  assert.ok(routes.includes('WHERE is_active=TRUE'), 'public category listing must exclude inactive categories');
  assert.ok(categoryUi.includes('FALLBACK_SUBCATEGORIES'), 'category explorer must retain its fallback taxonomy behavior');
  assert.ok(profileUi.includes('canCall = s.allow_phone_contact && !!b.phone'), 'profile UI must gate call action on setting and data');
  assert.ok(profileUi.includes('canWhatsApp = s.allow_whatsapp_contact && !!b.whatsapp'), 'profile UI must gate WhatsApp action on setting and data');
  assert.ok(profileUi.includes('s.allow_public_store_link'), 'profile UI must gate storefront links');
  assert.ok(businessCard.includes('business.business_mode === \'DISCOVERY_AND_STORE\' && business.tenant_slug'), 'search cards must require a server-approved tenant slug');

  // Reviews and ratings.
  assert.ok(routes.includes("if(!b.settings.allow_reviews)return res.json({success:true,summary:{rating:'0.00',count:0},data:[]})"), 'reviews endpoint must suppress disabled reviews');
  assert.ok(routes.includes('const reviewCountExpr = `CASE WHEN ${reviewsAllowedExpr} THEN'), 'search review counts must respect review visibility');
  assert.ok(searchUi.includes('minRating: false'), 'unsupported minimum-rating filter must remain clearly disabled until implemented');

  // Public visibility must be shared by public routes, not just profile rendering.
  assert.ok(routes.includes("business.listing_status === 'PUBLISHED' && business.is_discoverable"), 'public subresources must enforce listing visibility');
  assert.ok(routes.includes('o.is_active'), 'public listing routes must enforce organization activation');

  // Category counts must only include businesses that are actually publicly discoverable.
  await db.query("UPDATE organizations SET is_active=FALSE WHERE id='pdv_org'");
  const categoriesAfterOrgDeactivation = await getJson('/api/discovery/categories');
  assert.equal(categoriesAfterOrgDeactivation.status, 200);
  const fixtureCategory = categoriesAfterOrgDeactivation.body.data.find((category: any) => category.id === 'pdv_cat');
  assert.ok(fixtureCategory, 'active category remains visible after organization deactivation');
  assert.equal(Number(fixtureCategory.item_count), 0, 'inactive organizations must not inflate public category counts');

  await db.query("UPDATE discovery_businesses SET listing_status='PAUSED' WHERE id=$1", [business.id]);
  assert.equal(await service.getPublicProfile(business.id), null, 'paused listing must not expose a public profile');

  console.log('Public Discovery visibility/multi-location regression tests passed: six acceptance areas.');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
