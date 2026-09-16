import type { Role, PlatformRole } from '../../types';

export const PLATFORM_ROLES: readonly PlatformRole[] = [
  'System Owner',
  'Platform Admin',
  'Platform Support',
  'Platform Finance',
] as const;

export function isPlatformRole(role: Role | string): boolean {
  return PLATFORM_ROLES.includes(role as PlatformRole);
}

export function canManagePlatformPlans(role: Role | string): boolean {
  return role === 'System Owner' || role === 'Platform Admin';
}

export function canManagePlatformSubscriptions(role: Role | string): boolean {
  return role === 'System Owner' || role === 'Platform Admin' || role === 'Platform Finance';
}

export function canAccessPlatformSecurity(role: Role | string): boolean {
  return role === 'System Owner' || role === 'Platform Admin';
}

export function canAccessPlatformSupport(role: Role | string): boolean {
  return role === 'System Owner' || role === 'Platform Admin' || role === 'Platform Support';
}

export function canAccessPlatform(role: Role, permission: 'view' | 'manage' | 'support' | 'billing'): boolean {
  if (role === 'System Owner') return true;
  if (role === 'Platform Admin') return permission !== 'billing';
  if (role === 'Platform Support') return permission === 'view' || permission === 'support';
  if (role === 'Platform Finance') return permission === 'view' || permission === 'billing';
  return false;
}
