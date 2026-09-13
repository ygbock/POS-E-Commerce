import type { Role } from '../../types';
import { isPlatformRole } from './platformAccess';

export interface PlatformNavItem {
  id: string;
  label: string;
  permission: 'view' | 'manage' | 'support' | 'billing';
}

export const PLATFORM_NAVIGATION: readonly PlatformNavItem[] = [
  { id: 'platform-dashboard', label: 'Platform Overview', permission: 'view' },
  { id: 'tenants', label: 'Tenants', permission: 'manage' },
  { id: 'subscriptions', label: 'Subscriptions', permission: 'billing' },
  { id: 'security', label: 'Security', permission: 'view' },
];

export function getPlatformNavigation(role: Role): PlatformNavItem[] {
  if (!isPlatformRole(role)) return [];
  return PLATFORM_NAVIGATION.filter((item) => {
    if (role === 'System Owner') return true;
    if (role === 'Platform Admin') return item.permission !== 'billing';
    if (role === 'Platform Support') return item.permission === 'view' || item.permission === 'support';
    if (role === 'Platform Finance') return item.permission === 'view' || item.permission === 'billing';
    return false;
  });
}
