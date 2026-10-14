import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { authClient } from '../../services/authClient';
import { canAccessPlatform } from './platformAccess';

interface PlatformDashboardProps {
  setActiveTab: (tab: string) => void;
}

interface PlatformTenant {
  id: string;
  name: string;
  status: string;
  plan?: string | null;
}

interface PlatformOverview {
  tenants: PlatformTenant[];
  activeUsers?: number;
}

interface BillingOverview {
  mrr?: number;
  currency?: string;
  activeCount?: number;
  trialingCount?: number;
  lastUpdated?: string;
}

interface DashboardStats {
  tenants: PlatformTenant[];
  activeUsers: number | null;
  mrr: number | null;
  currency: string;
  activeSubscriptions: number | null;
  trialingSubscriptions: number | null;
  updatedAt: string | null;
}

const EMPTY_STATS: DashboardStats = {
  tenants: [],
  activeUsers: null,
  mrr: null,
  currency: 'SLE',
  activeSubscriptions: null,
  trialingSubscriptions: null,
  updatedAt: null,
};

async function readApiData<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(response.status === 401
      ? 'Your session has expired. Sign in again to view platform metrics.'
      : response.status === 403
        ? 'Your platform role is not permitted to access this metric.'
        : `${fallbackMessage} (HTTP ${response.status})`);
  }
  const json = await response.json();
  if (!json?.success || !json.data) {
    throw new Error(json?.error?.message || fallbackMessage);
  }
  return json.data as T;
}

export const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ setActiveTab }) => {
  const { currentRole } = useCommerce();
  const normalizedRole = String(currentRole || '').toLowerCase().replace(/[\s-]+/g, '_');
  const accessRole = normalizedRole === 'system_owner' ? 'System Owner'
    : normalizedRole === 'platform_admin' ? 'Platform Admin'
      : normalizedRole === 'platform_support' ? 'Platform Support'
        : normalizedRole === 'platform_finance' ? 'Platform Finance'
          : null;
  // Keep dashboard shortcuts aligned with the platform's canonical role policy.
  const canViewBilling = accessRole ? canAccessPlatform(accessRole, 'billing') : false;
  const canViewSecurity = accessRole ? canAccessPlatform(accessRole, 'manage') : false;
  const canViewSupport = accessRole ? canAccessPlatform(accessRole, 'support') : false;
  const canViewDiscovery = accessRole ? canAccessPlatform(accessRole, 'manage') : false;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingUnavailable, setBillingUnavailable] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  const loadMetrics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setBillingUnavailable(false);

    try {
      const overviewResponse = await fetch('/api/platform/overview', {
        credentials: 'include',
        headers: authClient.getAuthHeaders(),
      });
      const overview = await readApiData<PlatformOverview>(overviewResponse, 'Unable to load platform overview');
      const tenants = Array.isArray(overview.tenants) ? overview.tenants : [];

      let billing: BillingOverview | null = null;
      let billingFailed = false;
      if (canViewBilling) {
        try {
          const billingResponse = await fetch('/api/platform/billing', {
            credentials: 'include',
            headers: authClient.getAuthHeaders(),
          });
          billing = await readApiData<BillingOverview>(billingResponse, 'Unable to load billing metrics');
        } catch {
          billingFailed = true;
        }
      }

      setStats({
        tenants,
        activeUsers: Number.isFinite(Number(overview.activeUsers)) ? Number(overview.activeUsers) : null,
        mrr: billing && Number.isFinite(Number(billing.mrr)) ? Number(billing.mrr) : null,
        currency: billing?.currency || 'SLE',
        activeSubscriptions: billing && Number.isFinite(Number(billing.activeCount)) ? Number(billing.activeCount) : null,
        trialingSubscriptions: billing && Number.isFinite(Number(billing.trialingCount)) ? Number(billing.trialingCount) : null,
        updatedAt: billing?.lastUpdated || new Date().toISOString(),
      });
      setHasData(true);
      setBillingUnavailable(billingFailed);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load platform metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewBilling]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const counts = useMemo(() => stats.tenants.reduce((result, tenant) => {
    const status = String(tenant.status || '').toLowerCase();
    if (status === 'active') result.active += 1;
    else if (status === 'trial' || status === 'trialing' || status === 'onboarding') result.trial += 1;
    else if (status === 'suspended') result.suspended += 1;
    return result;
  }, { active: 0, trial: 0, suspended: 0 }), [stats.tenants]);

  const money = (amount: number | null) => amount == null
    ? '—'
    : new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: stats.currency,
        maximumFractionDigits: 0,
      }).format(amount);

  const MetricCard = ({
    label,
    value,
    description,
    icon,
    onClick,
    disabled = false,
  }: {
    label: string;
    value: string;
    description: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${loading ? 'Loading' : error && !hasData ? 'Unavailable' : value}. ${description}`}
      className="w-full text-left bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-indigo-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">{icon}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{loading ? '…' : error && !hasData ? '—' : value}</span>
        <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>
    </button>
  );

  const go = (tab: string) => setActiveTab(tab);

  return (
    <section className="space-y-6" aria-labelledby="platform-dashboard-title">
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Activity aria-hidden="true" className="w-3 h-3" /> Multi-Tenant Control Plane
              </span>
              <span className="text-xs text-slate-400 font-mono">Role: {String(currentRole || 'Platform Operator')}</span>
            </div>
            <h1 id="platform-dashboard-title" className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Control Panel Dashboard
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Live tenant and account metrics with role-aware shortcuts to platform operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => go('tenants')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Building2 aria-hidden="true" className="w-4 h-4" /> Manage Tenants
            </button>
            <button
              type="button"
              onClick={() => void loadMetrics(true)}
              disabled={loading || refreshing}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RefreshCw aria-hidden="true" className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh metrics'}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-200">
          <AlertCircle aria-hidden="true" className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Platform metrics could not be loaded</p>
            <p className="mt-1">{error}</p>
          </div>
          <button type="button" onClick={() => void loadMetrics(true)} disabled={refreshing} className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 font-semibold hover:bg-rose-100 dark:hover:bg-rose-900 disabled:opacity-50">
            Retry
          </button>
        </div>
      )}

      {billingUnavailable && canViewBilling && (
        <div role="status" className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
          Tenant metrics loaded, but billing metrics are temporarily unavailable. Revenue is shown as unavailable rather than estimated.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total Tenants"
          value={String(stats.tenants.length)}
          description="All registered tenant organizations"
          icon={<Building2 className="w-5 h-5" />}
          onClick={() => go('tenants')}
          disabled={loading}
        />
        <MetricCard
          label="Active Tenants"
          value={String(counts.active)}
          description="Organizations marked active"
          icon={<CheckCircle2 className="w-5 h-5" />}
          onClick={() => go('tenants')}
          disabled={loading}
        />
        <MetricCard
          label="Active Users"
          value={stats.activeUsers == null ? '—' : String(stats.activeUsers)}
          description="Active user accounts belonging to active tenant organizations"
          icon={<Users className="w-5 h-5" />}
          onClick={() => go('platform-users')}
          disabled={loading}
        />
        {canViewBilling ? (
          <MetricCard
            label="Monthly Recurring Revenue"
            value={money(stats.mrr)}
            description={stats.activeSubscriptions == null ? 'Live billing data unavailable' : `${stats.activeSubscriptions} active · ${stats.trialingSubscriptions ?? 0} trialing subscriptions`}
            icon={<CreditCard className="w-5 h-5" />}
            onClick={() => go('subscriptions')}
            disabled={loading}
          />
        ) : (
          <MetricCard
            label="Trial / Onboarding Tenants"
            value={String(counts.trial)}
            description="Tenants not yet in active lifecycle"
            icon={<Clock3 className="w-5 h-5" />}
            onClick={() => go('tenants')}
            disabled={loading}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm" aria-labelledby="platform-modules-title">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 id="platform-modules-title" className="text-base font-bold text-slate-900 dark:text-white">Platform Modules & Control Services</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Open a module to continue platform operations</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button type="button" onClick={() => go('tenants')} className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <div className="flex items-center justify-between mb-2"><span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center"><Building2 className="w-4 h-4" /></span><ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /></div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tenant Organizations</h3>
              <p className="text-xs text-slate-500 mt-1">View registered tenants and inspect their lifecycle status.</p>
            </button>
            <button type="button" onClick={() => go('platform-users')} className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <div className="flex items-center justify-between mb-2"><span className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center"><Users className="w-4 h-4" /></span><ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /></div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Tenant Users</h3>
              <p className="text-xs text-slate-500 mt-1">View active user accounts attached to active tenant organizations.</p>
            </button>
            {canViewBilling && (
              <button type="button" onClick={() => go('subscriptions')} className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <div className="flex items-center justify-between mb-2"><span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><CreditCard className="w-4 h-4" /></span><ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /></div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Plans & Subscriptions</h3>
                <p className="text-xs text-slate-500 mt-1">Review subscription counts and authoritative billing metrics.</p>
              </button>
            )}
            {canViewSupport && <button type="button" onClick={() => go('support')} className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <div className="flex items-center justify-between mb-2"><span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center"><Users className="w-4 h-4" /></span><ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /></div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Support & Operations</h3>
              <p className="text-xs text-slate-500 mt-1">Open the tenant support workspace.</p>
            </button>}
            {canViewSecurity && (
              <button type="button" onClick={() => go('security')} className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <div className="flex items-center justify-between mb-2"><span className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center"><ShieldAlert className="w-4 h-4" /></span><ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /></div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Security & Audit Logs</h3>
                <p className="text-xs text-slate-500 mt-1">Review platform audit and security events.</p>
              </button>
            )}
            {canViewDiscovery && (
              <button type="button" onClick={() => go('discovery-moderation')} className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <div className="flex items-center justify-between mb-2"><span className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center"><Activity className="w-4 h-4" /></span><ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /></div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Discovery Moderation</h3>
                <p className="text-xs text-slate-500 mt-1">Review marketplace listing and trust workflows.</p>
              </button>
            )}
          </div>
        </section>

        <aside className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col" aria-labelledby="platform-status-title">
          <div className="flex items-center justify-between mb-4">
            <h2 id="platform-status-title" className="text-base font-bold text-slate-900 dark:text-white">Dashboard Data Status</h2>
            <span className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-rose-500' : loading ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Platform overview API</span>
              <span className={`text-[11px] font-bold ${error ? 'text-rose-600' : loading ? 'text-amber-600' : 'text-emerald-600'}`}>{error ? 'Unavailable' : loading ? 'Loading' : 'Responding'}</span>
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Billing metrics</span>
              <span className="text-[11px] font-bold text-slate-500">{!canViewBilling ? 'Role restricted' : loading ? 'Loading' : billingUnavailable || stats.mrr == null ? 'Unavailable' : 'Loaded'}</span>
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tenant records</span>
              <span className="text-[11px] font-bold text-slate-500">{loading ? 'Loading' : error ? 'Unknown' : `${stats.tenants.length} loaded`}</span>
            </div>
          </div>
          <div className="pt-4 mt-auto border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock3 aria-hidden="true" className="w-3.5 h-3.5" />
            <span>{stats.updatedAt ? `Metrics refreshed ${new Date(stats.updatedAt).toLocaleString()}` : 'Metrics have not been refreshed yet'}</span>
          </div>
        </aside>
      </div>
    </section>
  );
};
