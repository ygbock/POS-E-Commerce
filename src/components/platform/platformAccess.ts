import type { Role } from '../../types';

export const PLATFORM_ROLES: readonly Role[] = [
  'System Owner',
  'Platform Admin',
  'Platform Support',
  'Platform Finance',
];

export function isPlatformRole(role: Role): boolean {
  return PLATFORM_ROLES.includes(role);
}

export function canAccessPlatform(role: Role, permission: 'view' | 'manage' | 'support' | 'billing'): boolean {
  if (role === 'System Owner') return true;
  if (role === 'Platform Admin') return permission !== 'billing';
  if (role === 'Platform Support') return permission === 'view' || permission === 'support';
  if (role === 'Platform Finance') return permission === 'view' || permission === 'billing';
  return false;
}
