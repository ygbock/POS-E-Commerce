import type { Role } from '../../types';
import { isPlatformRole } from './platformAccess';

export interface PlatformNavItem {
  id: 'platform-dashboard' | 'tenants' | 'subscriptions' | 'support' | 'security';
  label: string;
}

export function getPlatformNavigation(role: Role | string): PlatformNavItem[] {
  if (!isPlatformRole(role)) return [];
  switch (role) {
    case 'Platform Finance':
      return [
        { id: 'platform-dashboard', label: 'Control Plane Dashboard' },
        { id: 'tenants', label: 'Tenant Organizations' },
        { id: 'subscriptions', label: 'Plans & Subscriptions' },
      ];
    case 'Platform Support':
      return [
        { id: 'platform-dashboard', label: 'Control Plane Dashboard' },
        { id: 'tenants', label: 'Tenant Organizations' },
        { id: 'support', label: 'Support & Tenant Operations' },
      ];
    case 'Platform Admin':
      return [
        { id: 'platform-dashboard', label: 'Control Plane Dashboard' },
        { id: 'tenants', label: 'Tenant Organizations' },
        { id: 'subscriptions', label: 'Plans & Subscriptions' },
        { id: 'security', label: 'Security & Audit Logs' },
      ];
    case 'System Owner':
    default:
      return [
        { id: 'platform-dashboard', label: 'Control Plane Dashboard' },
        { id: 'tenants', label: 'Tenant Organizations' },
        { id: 'subscriptions', label: 'Plans & Subscriptions' },
        { id: 'support', label: 'Support & Tenant Operations' },
        { id: 'security', label: 'Security & Audit Logs' },
      ];
  }
}
