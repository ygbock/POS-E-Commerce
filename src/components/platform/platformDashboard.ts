export const SYSTEM_OWNER_DASHBOARD_STATUS = 'platform-control-plane';

export interface PlatformTenantSummary {
  id: string;
  name: string;
  status: 'active' | 'trial' | 'suspended' | 'onboarding';
  plan?: string;
  users?: number;
}

export interface PlatformDashboardData {
  tenants: PlatformTenantSummary[];
  activeUsers?: number;
  mrr?: number;
  platformHealth?: number;
  securityAlerts?: number;
  currency?: string;
  lastUpdated?: string;
}

export function getPlatformTenantCounts(tenants: PlatformTenantSummary[]) {
  return tenants.reduce((counts, tenant) => {
    counts[tenant.status] += 1;
    return counts;
  }, { active: 0, trial: 0, suspended: 0, onboarding: 0 } as Record<PlatformTenantSummary['status'], number>);
}
