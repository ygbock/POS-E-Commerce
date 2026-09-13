import { describe, expect, it } from 'vitest';
import { canAccessPlatform, getPermissionsForRole } from '../auth/roles.ts';

describe('platform authorization boundary', () => {
  it('grants the system owner all platform permissions', () => {
    const permissions = getPermissionsForRole('system_owner');
    expect(canAccessPlatform('system_owner', 'platform.view')).toBe(true);
    expect(permissions).toContain('platform.tenants');
    expect(permissions).toContain('platform.billing');
  });

  it('keeps tenant admin outside the platform control plane', () => {
    expect(canAccessPlatform('admin', 'platform.view')).toBe(false);
    expect(canAccessPlatform('manager', 'platform.tenants')).toBe(false);
  });

  it('separates support and billing responsibilities', () => {
    expect(canAccessPlatform('platform_support', 'platform.support')).toBe(true);
    expect(canAccessPlatform('platform_support', 'platform.billing')).toBe(false);
    expect(canAccessPlatform('platform_finance', 'platform.billing')).toBe(true);
    expect(canAccessPlatform('platform_finance', 'platform.support')).toBe(false);
  });
});
