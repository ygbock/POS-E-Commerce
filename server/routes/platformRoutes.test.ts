import assert from 'node:assert/strict';
import { canAccessPlatform, getPermissionsForRole, isPlatformRole } from '../auth/roles.ts';

console.log('Platform route authorization boundary tests');

// System Owner
const permissions = getPermissionsForRole('system_owner');
assert.equal(canAccessPlatform('system_owner', 'platform.view'), true);
assert.ok(permissions.includes('platform.tenants'));
assert.ok(permissions.includes('platform.billing'));
assert.ok(permissions.includes('platform.support'));
assert.ok(permissions.includes('platform.discovery'));

// Tenant admin and manager cannot access platform
assert.equal(canAccessPlatform('admin', 'platform.view'), false);
assert.equal(canAccessPlatform('manager', 'platform.tenants'), false);
assert.equal(canAccessPlatform('super_admin', 'platform.view'), false);
assert.equal(canAccessPlatform('cashier', 'platform.view'), false);

// Role separation
assert.equal(canAccessPlatform('platform_support', 'platform.support'), true);
assert.equal(canAccessPlatform('platform_support', 'platform.billing'), false);
assert.equal(canAccessPlatform('platform_finance', 'platform.billing'), true);
assert.equal(canAccessPlatform('platform_finance', 'platform.support'), false);
assert.equal(canAccessPlatform('platform_finance', 'platform.discovery'), false);
assert.equal(canAccessPlatform('platform_admin', 'platform.tenants'), true);
assert.equal(canAccessPlatform('platform_admin', 'platform.discovery'), true);
assert.equal(canAccessPlatform('platform_admin', 'platform.billing'), false);

console.log('PASS: platform route authorization boundary tests passed.');
