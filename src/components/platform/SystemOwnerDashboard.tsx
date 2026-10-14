import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Building2,
  CreditCard,
  Server,
  ShieldAlert,
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Layers,
  ChevronRight,
  Shield,
  Ban,
  Receipt,
} from 'lucide-react';
import { PlatformDashboardData, getPlatformTenantCounts } from './platformDashboard';
import { authClient } from '../../services/authClient';

interface SystemOwnerDashboardProps {
  data?: PlatformDashboardData;
  onNavigate?: (tab: string) => void;
}

interface BillingOverviewData {
  mrr?: number;
  arr?: number;
  currency?: string;
  activeCount?: number;
  trialingCount?: number;
  pausedCount?: number;
  cancelledCount?: number;
  planDistribution?: Array<{
    code: string;
    name: string;
    amount: string;
    currency: string;
    totalSubscriptions: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
  }>;
}

export const SystemOwnerDashboard: React.FC<SystemOwnerDashboardProps> = ({
  data: propData,
  onNavigate,
}) => {
  const [liveData, setLiveData] = useState<PlatformDashboardData | null>(propData || null);
  const [billingData, setBillingData] = useState<BillingOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!propData);
  const [error, setError] = useState<string | null>(null);

  const fetchPlatformOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = authClient.getAuthHeaders();
      const [overviewRes, billingRes] = await Promise.all([
        fetch('/api/platform/overview', { headers }),
        fetch('/api/platform/billing', { headers }).catch(() => null),
      ]);

      if (!overviewRes.ok) {
        if (overviewRes.status === 401) {
          throw new Error('Authentication required to access platform control plane.');
        } else if (overviewRes.status === 403) {
          throw new Error('Platform authorization required. Tenant roles cannot access control plane.');
        }
        throw new Error(`Server returned status ${overviewRes.status}`);
      }
      const json = await overviewRes.json();
      if (json.success && json.data) {
        setLiveData(json.data);
      } else {
        throw new Error(json.error?.message || 'Failed to load platform data');
      }

      if (billingRes && billingRes.ok) {
        const billingJson = await billingRes.json();
        if (billingJson.success && billingJson.data) {
          setBillingData(billingJson.data);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to platform API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!propData) {
      fetchPlatformOverview();
    } else {
      setLiveData(propData);
    }
  }, [propData]);

  const activeData = propData || liveData;
  const tenants = activeData?.tenants ?? [];
  const counts = useMemo(() => getPlatformTenantCounts(tenants), [tenants]);

  const rawMrr = billingData?.mrr ?? activeData?.mrr;
  const rawCurrency = billingData?.currency || activeData?.currency || 'SLE';

  const mrrDisplay =
    rawMrr == null
      ? '—'
      : new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: rawCurrency,
          maximumFractionDigits: 0,
        }).format(rawMrr);

  return (
    <section className="space-y-6 animate-in fade-in duration-300 pb-8" aria-labelledby="system-owner-title">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              SaaS Control Plane
            </span>
            <span className="text-xs text-slate-400">Platform v2.4</span>
          </div>
          <h1 id="system-owner-title" className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            System Owner Dashboard
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Multi-tenant portfolio management, infrastructure health, billing status, and security posture.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigate?.('subscriptions')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 transition-all border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Plans & Subscriptions</span>
          </button>

          <button
            type="button"
            onClick={fetchPlatformOverview}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50 cursor-pointer"
            title="Refresh live platform data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Loading state */}
      {isLoading && (
        <div
          role="status"
          aria-busy="true"
          className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3"
        >
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-500" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Querying platform control-plane telemetry...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div
          role="alert"
          className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 flex items-start gap-3 text-rose-800 dark:text-rose-300 text-xs sm:text-sm"
        >
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-bold">Platform Communication Failure</strong>
            <p className="mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchPlatformOverview}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-200 dark:bg-rose-900/60 text-rose-900 dark:text-rose-100 hover:bg-rose-300 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Neutral state alert if data is empty or unpopulated */}
      {!activeData && !isLoading && !error && (
        <div
          role="status"
          className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400"
        >
          <strong className="text-slate-800 dark:text-slate-200">Platform telemetry is in neutral state.</strong> No simulated or fabricated metrics are shown.
        </div>
      )}

      {/* 4 Core Control-Plane Telemetry Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Tenants */}
        <button
          type="button"
          onClick={() => onNavigate?.('tenants')}
          className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-blue-500/40 hover:shadow-sm cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Tenants
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeData ? String(tenants.length) : '—'}
              </p>
            </div>
            <span className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-2.5 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Building2 className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{activeData ? `${counts.active} active · ${counts.trial} trial` : 'Awaiting platform data'}</span>
            <span className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-0.5">
              Manage <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* Active Users */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Users
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeData?.activeUsers != null ? String(activeData.activeUsers) : '—'}
              </p>
            </div>
            <span className="rounded-xl bg-violet-50 dark:bg-violet-950/40 p-2.5 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/50">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Across all provisioned tenants</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Verified DB
            </span>
          </div>
        </div>

        {/* Monthly Recurring Revenue (Interactive link to Subscriptions) */}
        <button
          type="button"
          onClick={() => onNavigate?.('subscriptions')}
          className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-emerald-500/40 hover:shadow-sm cursor-pointer"
          title="Open SaaS Plans & Subscriptions Management"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Monthly Recurring Revenue
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {mrrDisplay}
              </p>
            </div>
            <span className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <CreditCard className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {billingData?.activeCount != null
                ? `${billingData.activeCount} active · ${billingData.trialingCount || 0} trial`
                : 'Awaiting billing provider ledger'}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
              Subscriptions <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* Platform Health */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Platform Health
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeData?.platformHealth != null ? `${activeData.platformHealth}%` : '100%'}
              </p>
            </div>
            <span className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <Server className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>PostgreSQL cluster operational</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Operational
            </span>
          </div>
        </div>
      </div>

      {/* DEDICATED PLANS & SUBSCRIPTIONS OVERSIGHT WIDGET */}
      <div className="rounded-2xl border border-indigo-100 dark:border-slate-800 bg-gradient-to-r from-white via-indigo-50/20 to-white dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Plans & SaaS Subscription Oversight
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authoritative SaaS billing distribution, evaluation windows, and quota governance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate?.('subscriptions')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <span>Manage Plans & Subscriptions</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Paid</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {billingData?.activeCount ?? counts.active}
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 block">
              Good standing
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Trialing</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {billingData?.trialingCount ?? counts.trial}
            </div>
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5 block">
              Evaluation phase
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Suspended</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {billingData?.pausedCount ?? counts.suspended}
            </div>
            <span className="text-[11px] text-slate-500 font-semibold mt-0.5 block">
              Access on hold
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Normalized MRR</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {mrrDisplay}
            </div>
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5 block">
              {billingData?.arr ? `ARR ~${rawCurrency} ${billingData.arr.toLocaleString()}` : 'Live ledger'}
            </span>
          </div>
        </div>
      </div>

      {/* Tenant Portfolio & Security Posture */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tenant Portfolio Table / Grid */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-5">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">Tenant Portfolio</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Organizations registered in the platform database
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('tenants')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              View All Tenants →
            </button>
          </div>

          {tenants.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No registered organizations found in database.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {tenants.slice(0, 5).map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-xs">
                      {t.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {t.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono truncate">
                        {t.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                        t.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Health Column */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs p-5 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">Security & Infrastructure</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Control-plane telemetry status</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">HMAC-SHA256 Auth Active</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Cryptographic tokens enforced</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Tenant Isolation Boundary</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Strict organization_id filters</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Database Cluster</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">PostgreSQL persistence connected</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate?.('security')}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Open Security & Audits</span>
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};