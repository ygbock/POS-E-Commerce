import { authClient } from './authClient';

export interface AuditLogItem {
  id: string;
  organization_id?: string;
  actor_id?: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  location_id?: string | null;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
  ip_address?: string | null;
  severity?: 'Info' | 'Low' | 'Medium' | 'High' | 'Critical';
  result?: 'SUCCESS' | 'FAILED' | 'DENIED';
  timestamp: string;
}

export interface SecurityOverviewMetrics {
  eventsToday: number;
  eventsThisWeek: number;
  staffSuspensions: number;
  rolePermissionChanges: number;
  ownershipEvents: number;
  failedDeniedOperations: number;
  criticalAndHigh: number;
  recentSecurityEvents: AuditLogItem[];
}

export interface AuditQueryFilterParams {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  severity?: string;
  result?: string;
  search?: string;
}

export interface AuditApiResponse {
  success: boolean;
  count: number;
  data: AuditLogItem[];
  pagination: {
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class AuditApiClient {
  async fetchOverview(): Promise<SecurityOverviewMetrics> {
    const res = await fetch('/api/tenant/audit/overview', {
      headers: authClient.getAuthHeaders(),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error?.message || 'Failed to fetch security overview metrics');
    }
    return payload.data;
  }

  async fetchAuditLogs(params: AuditQueryFilterParams = {}): Promise<AuditApiResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.action && params.action !== 'ALL') query.set('action', params.action);
    if (params.entityType && params.entityType !== 'ALL') query.set('entityType', params.entityType);
    if (params.entityId) query.set('entityId', params.entityId);
    if (params.actorId && params.actorId !== 'ALL') query.set('actorId', params.actorId);
    if (params.severity && params.severity !== 'ALL') query.set('severity', params.severity);
    if (params.result && params.result !== 'ALL') query.set('result', params.result);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());

    const queryString = query.toString();
    const url = `/api/tenant/audit${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      headers: authClient.getAuthHeaders(),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error?.message || 'Failed to fetch audit events');
    }
    return payload;
  }
}

export const auditApiClient = new AuditApiClient();
