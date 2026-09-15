import { authClient } from './authClient';

export interface PlanLimits {
  users?: number;
  locations?: number;
  products?: number;
  monthly_orders?: number;
  [key: string]: number | undefined;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  amount: string | number;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  trial_days: number;
  limits: PlanLimits;
  features: Record<string, boolean>;
  is_active: boolean;
  display_order: number;
}

export interface TenantSubscription {
  id: string;
  organization_id: string;
  organization_name?: string;
  organization_code?: string;
  organization_slug?: string;
  organization_is_active?: boolean;
  status: 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  plan: SubscriptionPlan;
  usage?: {
    users: number;
    locations: number;
    products: number;
    monthly_orders: number;
  };
}

export interface BillingOverview {
  status: string;
  mrr: number;
  currency: string;
  activeCount: number;
  trialingCount: number;
  pausedCount: number;
  cancelledCount: number;
  planDistribution: Array<{
    code: string;
    name: string;
    amount: string;
    currency: string;
    totalSubscriptions: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
  }>;
  lastUpdated: string;
}

export interface SubscriptionAuditRecord {
  id: string;
  organization_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: any;
  after_state: any;
  metadata: any;
  severity: string;
  result: string;
  timestamp: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authClient.getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload.error?.code || `HTTP_${response.status}`;
    const message = payload.error?.message || `Request failed with status ${response.status}`;
    const error: any = new Error(message);
    error.code = code;
    error.status = response.status;
    throw error;
  }

  return payload.data as T;
}

export const subscriptionApi = {
  async getBillingOverview(): Promise<BillingOverview> {
    return request<BillingOverview>('/api/platform/billing');
  },

  async getPlans(includeInactive = true): Promise<SubscriptionPlan[]> {
    return request<SubscriptionPlan[]>(`/api/platform/plans?includeInactive=${includeInactive}`);
  },

  async getPlan(codeOrId: string): Promise<SubscriptionPlan> {
    return request<SubscriptionPlan>(`/api/platform/plans/${encodeURIComponent(codeOrId)}`);
  },

  async updatePlan(codeOrId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    return request<SubscriptionPlan>(`/api/platform/plans/${encodeURIComponent(codeOrId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getSubscriptions(filters: {
    status?: string;
    plan?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<TenantSubscription[]> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.plan && filters.plan !== 'all') params.set('plan', filters.plan);
    if (filters.search) params.set('search', filters.search);
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.offset) params.set('offset', String(filters.offset));

    const query = params.toString() ? `?${params.toString()}` : '';
    return request<TenantSubscription[]>(`/api/platform/subscriptions${query}`);
  },

  async getSubscriptionDetails(organizationId: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}`);
  },

  async getSubscriptionHistory(organizationId: string): Promise<SubscriptionAuditRecord[]> {
    return request<SubscriptionAuditRecord[]>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/history`);
  },

  async changePlan(organizationId: string, planCodeOrId: string, reason?: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/change-plan`, {
      method: 'POST',
      body: JSON.stringify({ planCodeOrId, reason }),
    });
  },

  async extendTrial(organizationId: string, days: number, reason?: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/extend-trial`, {
      method: 'POST',
      body: JSON.stringify({ days, reason }),
    });
  },

  async suspendSubscription(organizationId: string, reason?: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async reactivateSubscription(organizationId: string, reason?: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async cancelSubscription(organizationId: string, immediate: boolean, reason?: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ immediate, reason }),
    });
  },

  async restoreSubscription(organizationId: string, reason?: string): Promise<TenantSubscription> {
    return request<TenantSubscription>(`/api/platform/subscriptions/${encodeURIComponent(organizationId)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};
