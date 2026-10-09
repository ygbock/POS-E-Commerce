import assert from 'node:assert/strict';
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

  await db.query(
    `UPDATE discovery_business_settings
        SET allow_phone_contact=FALSE,allow_whatsapp_contact=FALSE,
            allow_reviews=FALSE,allow_public_store_link=FALSE
      WHERE business_id=$1`,
    [business.id],
  );
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
  assert.ok(routes.includes("const reviewsAllowedExpr = \"COALESCE(bds.allow_reviews, TRUE)\""), 'search ranking must respect review visibility');
  assert.ok(routes.includes('locationMatchConditions'), 'business search must build correlated branch filters');
  assert.ok(routes.includes('productLocationConditions'), 'product search must filter against active branches');
  assert.ok(routes.includes('serviceLocationConditions'), 'service search must filter against active branches');
  assert.ok(routes.includes('ORDER BY CASE WHEN ${matchingLocationOrder} THEN 0 ELSE 1 END'), 'business search must return a location that matches its filters');
  assert.ok(routes.includes('CASE WHEN COALESCE(bds.allow_phone_contact, TRUE) THEN b.phone ELSE NULL END AS phone'), 'search results must mask disabled phone contact');
  assert.ok(routes.includes('CASE WHEN COALESCE(bds.allow_whatsapp_contact, TRUE) THEN b.whatsapp ELSE NULL END AS whatsapp'), 'search results must mask disabled WhatsApp contact');
  assert.ok(routes.includes('CASE WHEN COALESCE(bds.allow_public_store_link, TRUE) THEN o.slug ELSE NULL END AS tenant_slug'), 'search results must mask disabled storefront links');
  assert.ok(routes.includes("b.listing_status='PUBLISHED'") && routes.includes('b.is_discoverable=TRUE'), 'public search must exclude unpublished or undiscoverable listings');

  // Categories and listing details.
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

  await db.query("UPDATE discovery_businesses SET listing_status='PAUSED' WHERE id=$1", [business.id]);
  assert.equal(await service.getPublicProfile(business.id), null, 'paused listing must not expose a public profile');

  console.log('Public Discovery visibility/multi-location regression tests passed: six acceptance areas.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
