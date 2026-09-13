import assert from 'node:assert/strict';
import { canAccessPlatform, getPermissionsForRole, isPlatformRole } from '../server/auth/roles.ts';

console.log('Platform authorization tests');

assert.equal(isPlatformRole('system_owner'), true);
assert.equal(isPlatformRole('admin'), false);

assert.equal(canAccessPlatform('system_owner', 'platform.view'), true);
assert.equal(canAccessPlatform('system_owner', 'platform.tenants'), true);
assert.equal(canAccessPlatform('system_owner', 'platform.billing'), true);

assert.equal(canAccessPlatform('admin', 'platform.view'), false);
assert.equal(canAccessPlatform('manager', 'platform.tenants'), false);

assert.equal(canAccessPlatform('platform_admin', 'platform.tenants'), true);
assert.equal(canAccessPlatform('platform_admin', 'platform.billing'), false);
assert.equal(canAccessPlatform('platform_support', 'platform.support'), true);
assert.equal(canAccessPlatform('platform_support', 'platform.billing'), false);
assert.equal(canAccessPlatform('platform_finance', 'platform.billing'), true);
assert.equal(canAccessPlatform('platform_finance', 'platform.support'), false);

assert.ok(getPermissionsForRole('system_owner').every((p) => p.startsWith('platform.')));
assert.ok(getPermissionsForRole('platform_support').every((p) => p.startsWith('platform.')));

console.log('PASS: platform authorization boundaries are enforced by the role policy.');
