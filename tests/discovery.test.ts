import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';
import { DiscoveryStoreProvisioningService } from '../server/services/discoveryStoreProvisioningService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_test_org','Discovery Test Org','DISC_TEST',TRUE)");
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_other_org','Other Org','DISC_OTHER',TRUE)");

  // Service-level creation now enforces the real FK-backed OWNER membership
  // invariant. Seed the actor identities used by this isolated test database.
  await db.query(
    `INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES
       ('disc-owner','disc_test_org','disc-owner@test.local','Discovery Owner','hash','salt','admin',TRUE),
       ('disc-other-admin','disc_other_org','disc-other-admin@test.local','Other Tenant Admin','hash','salt','admin',TRUE),
       ('disc-self-service',NULL,'disc-self-service@test.local','Self Service Owner','hash','salt','customer',TRUE)`,
  );

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const owner = { userId: 'disc-owner', role: 'admin', organizationId: 'disc_test_org' };
  const otherTenantAdmin = { userId: 'disc-other-admin', role: 'admin', organizationId: 'disc_other_org' };

  const business = await service.create({ name: 'Discovery Test Shop', businessMode: 'DISCOVERY_AND_STORE', organizationId: 'disc_test_org', submitImmediately: false }, owner);
  assert.strictEqual(business.listing_status, 'DRAFT');
  assert.ok(business.slug.startsWith('discovery-test-shop'));

  // The submission gate is intentionally server-authoritative. Make this fixture
  // complete before exercising the happy-path lifecycle.
  await db.query(
    "INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES ($1,'disc_cat_retail',TRUE)",
    [business.id],
  );
  await db.query(
    `INSERT INTO discovery_business_locations
      (id,business_id,name,location_type,city,region,country,latitude,longitude,is_primary,is_active)
      VALUES ('disc_main_loc', $1, 'Main Location', 'STORE', 'Freetown', 'Western Area', 'Sierra Leone', 8.4840, -13.2299, TRUE, TRUE)`,
    [business.id],
  );
  await service.update(business.id, {
    description: 'A discovery test retail business with complete public listing information.',
    phone: '+232 76 000 000',
  }, owner);

  await service.submit(business.id, owner);
  assert.strictEqual((await repo.findById(business.id))?.listing_status, 'SUBMITTED');
  await service.review(business.id, owner);
  assert.strictEqual((await repo.findById(business.id))?.listing_status, 'UNDER_REVIEW');
  await service.approve(business.id, owner);
  await service.publish(business.id, owner);

  const published = await service.getBySlug(business.slug, true);
  assert.ok(published);
  assert.strictEqual(published?.is_discoverable, true);

  const publicProfile = await service.getPublicProfile(business.id);
  assert.ok(publicProfile);
  assert.ok(publicProfile?.settings);
  // Category governance: only active taxonomy entries participate in public filters.
  await db.query("INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES ($1,'disc_cat_retail',TRUE) ON CONFLICT DO NOTHING", [business.id]);
  const retailMatches = await repo.listPublished({ categoryId: 'disc_cat_retail' });
  assert.ok(retailMatches.some((row) => row.id === business.id));

  await db.query("UPDATE discovery_business_categories SET is_active=FALSE WHERE id='disc_cat_retail'");
  const inactiveRetailMatches = await repo.listPublished({ categoryId: 'disc_cat_retail' });
  assert.ok(!inactiveRetailMatches.some((row) => row.id === business.id));
  await db.query("UPDATE discovery_business_categories SET is_active=TRUE WHERE id='disc_cat_retail'");


  // A tenant user may not rebind an existing discovery business to another tenant.
  await assert.rejects(
    () => service.update(business.id, { organizationId: 'disc_other_org' }, owner),
    /TENANT_ACCESS_DENIED:/,
  );

  // Historical creator identity must not bypass the tenant boundary once bound.
  const crossTenantPatch = { phone: '+232 76 999 999' };
  await assert.rejects(
    () => service.update(business.id, crossTenantPatch, { userId: business.created_by_user_id!, role: 'admin', organizationId: 'disc_other_org' }),
    /PERMISSION_DENIED:/,
  );

  // Tenant administrators may moderate their own organization's listings, but not another tenant's.
  await assert.rejects(
    () => service.approve(business.id, otherTenantAdmin),
    /TENANT_ACCESS_DENIED:/,
  );

  // Discovery-only businesses are editable by their authorized creator without tenant middleware.
  const discoveryOnly = await service.create({ name: 'Independent Discovery Listing', businessMode: 'DISCOVERY_ONLY' }, owner);
  const edited = await service.update(discoveryOnly.id, { shortDescription: 'Updated independently.' }, owner);
  assert.strictEqual(edited.short_description, 'Updated independently.');

  // Self-service discovery onboarding: a normal authenticated user can create a private draft.
  const selfServiceOwner = { userId: 'disc-self-service', role: 'customer', organizationId: undefined };
  const selfService = await service.create({ name: 'Self Service Listing', businessMode: 'DISCOVERY_ONLY' }, selfServiceOwner);
  assert.strictEqual(selfService.listing_status, 'DRAFT');
  assert.strictEqual(selfService.organization_id, null);

  // Submission is server-gated until the readiness requirements are satisfied.
  await assert.rejects(
    () => service.submit(selfService.id, selfServiceOwner),
    /VALIDATION_ERROR:Complete the listing readiness requirements:/,
  );

  await db.query(
    "INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES ($1,'disc_cat_retail',TRUE)",
    [selfService.id],
  );
  await db.query(
    `INSERT INTO discovery_business_locations
      (id,business_id,name,location_type,city,region,country,latitude,longitude,is_primary,is_active)
      VALUES ('disc_self_loc', $1, 'Main Location', 'STORE', 'Freetown', 'Western Area', 'Sierra Leone', 8.4840, -13.2299, TRUE, TRUE)`,
    [selfService.id],
  );
  await db.query(
    "INSERT INTO discovery_services (id,business_id,name,slug,booking_mode) VALUES ('self_service_svc',$1,'Consultation','consultation','REQUEST')",
    [selfService.id],
  );
  await service.update(selfService.id, {
    description: 'A self-service discovery listing with complete public information.',
    phone: '+232 76 111111',
  }, selfServiceOwner);
  const submittedSelfService = await service.submit(selfService.id, selfServiceOwner);
  assert.strictEqual(submittedSelfService.listing_status, 'SUBMITTED');

  // A discovery-only listing can be converted to the creator's tenant, preserving its identity and slug.
  const converted = await service.update(discoveryOnly.id, {
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_test_org',
  }, owner);
  assert.strictEqual(converted.business_mode, 'DISCOVERY_AND_STORE');
  assert.strictEqual(converted.organization_id, 'disc_test_org');
  assert.strictEqual(converted.slug, discoveryOnly.slug);

  // Store conversion must be transactional and require an active commerce location.
  // Use a fresh discovery-only listing here: the earlier listing was intentionally
  // bound to disc_test_org to prove tenant-bound ownership cannot be rebound.
  const provisioning = new DiscoveryStoreProvisioningService(db);
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_store_org','Store Conversion Org','DISC_STORE',TRUE)");
  await db.query("INSERT INTO locations (id,organization_id,code,name,type,is_active) VALUES ('disc_store_loc','disc_store_org','DISC-STORE','Discovery Store','Retail Store',TRUE)");
  const provisionableBusiness = await service.create({ name: 'Provisionable Discovery Listing', businessMode: 'DISCOVERY_ONLY' }, owner);
  const provisionResult = await provisioning.provisionForDiscoveryBusiness(provisionableBusiness.id, 'disc_store_org', provisionableBusiness.slug, provisionableBusiness.name);
  assert.strictEqual(provisionResult.businessId, provisionableBusiness.id);
  assert.strictEqual(provisionResult.organizationId, 'disc_store_org');
  const provisioned = await repo.findById(provisionableBusiness.id);
  assert.strictEqual(provisioned?.business_mode, 'DISCOVERY_AND_STORE');
  assert.strictEqual(provisioned?.organization_id, 'disc_store_org');
  assert.strictEqual(provisioned?.slug, provisionableBusiness.slug);

  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_no_loc_org','No Location Org','DISC_NO_LOC',TRUE)");
  const noLocationBusiness = await service.create({ name: 'No Location Conversion', businessMode: 'DISCOVERY_ONLY' }, owner);
  await assert.rejects(
    () => provisioning.provisionForDiscoveryBusiness(noLocationBusiness.id, 'disc_no_loc_org', noLocationBusiness.slug, noLocationBusiness.name),
    /STORE_NOT_READY:/,
  );
  const afterFailedProvision = await repo.findById(noLocationBusiness.id);
  assert.strictEqual(afterFailedProvision?.business_mode, 'DISCOVERY_ONLY');
  assert.strictEqual(afterFailedProvision?.organization_id, null);

  await db.query("UPDATE organizations SET is_active=FALSE WHERE id='disc_test_org'");
  assert.strictEqual(await service.getBySlug(business.slug, true), null);

  console.log('Discovery tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
