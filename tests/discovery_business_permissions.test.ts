import assert from 'assert';
import {
  hasBusinessPermission,
  permissionsForBusinessRole,
  type DiscoveryBusinessScopedRole,
} from '../server/services/discoveryBusinessAccess';

const roles: DiscoveryBusinessScopedRole[] = ['OWNER', 'MANAGER', 'STAFF'];

assert.deepStrictEqual(
  permissionsForBusinessRole('OWNER').length,
  12,
);

assert.strictEqual(hasBusinessPermission('OWNER', 'business.team.manage'), true);
assert.strictEqual(hasBusinessPermission('OWNER', 'business.store.manage'), true);
assert.strictEqual(hasBusinessPermission('OWNER', 'business.verification.manage'), true);

assert.strictEqual(hasBusinessPermission('MANAGER', 'business.listing.manage'), true);
assert.strictEqual(hasBusinessPermission('MANAGER', 'business.locations.manage'), true);
assert.strictEqual(hasBusinessPermission('MANAGER', 'business.services.manage'), true);
assert.strictEqual(hasBusinessPermission('MANAGER', 'business.analytics.view'), true);
assert.strictEqual(hasBusinessPermission('MANAGER', 'business.team.manage'), false);
assert.strictEqual(hasBusinessPermission('MANAGER', 'business.store.manage'), false);
assert.strictEqual(hasBusinessPermission('MANAGER', 'business.verification.manage'), false);

assert.strictEqual(hasBusinessPermission('STAFF', 'business.services.manage'), true);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.leads.manage'), true);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.reviews.manage'), true);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.analytics.view'), true);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.listing.manage'), false);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.locations.manage'), false);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.settings.manage'), false);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.team.manage'), false);
assert.strictEqual(hasBusinessPermission('STAFF', 'business.store.manage'), false);

assert.deepStrictEqual(
  roles.map((role) => [role, permissionsForBusinessRole(role).length]),
  [['OWNER', 12], ['MANAGER', 8], ['STAFF', 4]],
);

console.log('Discovery business permission matrix tests passed.');
