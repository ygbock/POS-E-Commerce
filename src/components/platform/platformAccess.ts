import { Role, PlatformRole } from '../../types';

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
