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

  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const owner = { userId: 'disc-owner', role: 'admin', organizationId: 'disc_test_org' };
  const otherTenantAdmin = { userId: 'disc-other-admin', role: 'admin', organizationId: 'disc_other_org' };

  const business = await service.create({ name: 'Discovery Test Shop', businessMode: 'DISCOVERY_AND_STORE', organizationId: 'disc_test_org', submitImmediately: false }, owner);
  assert.strictEqual(business.listing_status, 'DRAFT');
  assert.ok(business.slug.startsWith('discovery-test-shop'));

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

  // A discovery-only listing can be converted to the creator's tenant, preserving its identity and slug.
  const converted = await service.update(discoveryOnly.id, {
    businessMode: 'DISCOVERY_AND_STORE',
    organizationId: 'disc_test_org',
  }, owner);
  assert.strictEqual(converted.business_mode, 'DISCOVERY_AND_STORE');
  assert.strictEqual(converted.organization_id, 'disc_test_org');
  assert.strictEqual(converted.slug, discoveryOnly.slug);

  // Store conversion must be transactional and require an active commerce location.
  const provisioning = new DiscoveryStoreProvisioningService(db);
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('disc_store_org','Store Conversion Org','DISC_STORE',TRUE)");
  await db.query("INSERT INTO locations (id,organization_id,code,name,type,is_active) VALUES ('disc_store_loc','disc_store_org','DISC-STORE','Discovery Store','Retail Store',TRUE)");
  const provisionResult = await provisioning.provisionForDiscoveryBusiness(discoveryOnly.id, 'disc_store_org', discoveryOnly.slug, discoveryOnly.name);
  assert.strictEqual(provisionResult.businessId, discoveryOnly.id);
  assert.strictEqual(provisionResult.organizationId, 'disc_store_org');
  const provisioned = await repo.findById(discoveryOnly.id);
  assert.strictEqual(provisioned?.business_mode, 'DISCOVERY_AND_STORE');
  assert.strictEqual(provisioned?.organization_id, 'disc_store_org');
  assert.strictEqual(provisioned?.slug, discoveryOnly.slug);

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
