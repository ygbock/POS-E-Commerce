import type { Role } from '../../types';
import { canAccessPlatform, isPlatformRole } from './platformAccess';

export function assertPlatformRoute(role: Role, permission: 'view' | 'manage' | 'support' | 'billing' = 'view'): void {
  if (!isPlatformRole(role) || !canAccessPlatform(role, permission)) {
    throw new Error('PLATFORM_ACCESS_DENIED');
  }
}

export function resolveDefaultRoute(role: Role): 'platform-dashboard' | 'dashboard' {
  return isPlatformRole(role) ? 'platform-dashboard' : 'dashboard';
}
