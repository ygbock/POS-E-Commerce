import { authClient } from './authClient';

export interface SalesSummary {
  from: string;
  to: string;
  orderCount: number;
  grossSales: string;
  discounts: string;
  tax: string;
  shipping: string;
  cogs: string;
  grossProfit: string;
  grossMarginPercent: number;
  averageOrderValue: string;
  byChannel: Array<{ channel: string; orderCount: number; revenue: string; cogs: string; grossProfit: string }>;
  daily: Array<{ day: string; orderCount: number; revenue: string; grossProfit: string }>;
}

export interface InventoryValuation {
  variantCount: number;
  onHandUnits: string;
  availableUnits: string;
  reservedUnits: string;
  quarantinedUnits: string;
  costValue: string;
  retailValue: string;
  byLocation: Array<{ locationId: string; locationName: string; availableUnits: string; costValue: string; retailValue: string }>;
}

export interface ShiftReconciliation {
  from: string;
  to: string;
  shiftCount: number;
  totals: { openingCash: number; expectedCash: number; countedCash: number; variance: number; cashSales: number; cashIn: number; cashOut: number };
  shifts: Array<Record<string, unknown>>;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...authClient.getAuthHeaders() } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Request failed with status ${response.status}`);
  return payload.data as T;
}

function query(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value) q.set(key, value); });
  return q.toString();
}

export const reportingApi = {
  getSalesSummary(filters: { from?: string; to?: string; locationId?: string; channel?: string } = {}) {
    const qs = query(filters);
    return request<SalesSummary>(`/api/reports/sales-summary${qs ? `?${qs}` : ''}`);
  },
  getInventoryValuation(locationId?: string) {
    const qs = query({ locationId });
    return request<InventoryValuation>(`/api/reports/inventory-valuation${qs ? `?${qs}` : ''}`);
  },
  getShiftReconciliation(filters: { from?: string; to?: string; locationId?: string } = {}) {
    const qs = query(filters);
    return request<ShiftReconciliation>(`/api/reports/shift-reconciliation${qs ? `?${qs}` : ''}`);
  },
};
