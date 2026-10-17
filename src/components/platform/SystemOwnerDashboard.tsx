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
  Search,
  Filter,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  MoreVertical,
  SlidersHorizontal,
  ChevronDown,
  Eye,
  X,
} from 'lucide-react';
import { PlatformDashboardData, getPlatformTenantCounts } from './platformDashboard';
import { authClient } from '../../services/authClient';
import { subscriptionApi, TenantSubscription, BillingOverview } from '../../services/subscriptionApi';

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
  const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!propData);
  const [isSubsLoading, setIsSubsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Subscriptions Table Filter State for System Owner
  const [subSearch, setSubSearch] = useState<string>('');
  const [subFilter, setSubFilter] = useState<'all' | 'active' | 'trialing' | 'high_quota' | 'paused'>('all');
  const [openActionSubId, setOpenActionSubId] = useState<string | null>(null);
  const [quotaInspectionSub, setQuotaInspectionSub] = useState<TenantSubscription | null>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = () => setOpenActionSubId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenActionSubId(null);
        setQuotaInspectionSub(null);
      }
    };
    if (openActionSubId) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [openActionSubId]);

  const fetchPlatformOverview = async () => {
    setIsLoading(true);
    setIsSubsLoading(true);
    setError(null);
    try {
      const headers = authClient.getAuthHeaders();
      const [overviewRes, billingRes, subsData] = await Promise.all([
        fetch('/api/platform/overview', { headers }),
        fetch('/api/platform/billing', { headers }).catch(() => null),
        subscriptionApi.getSubscriptions({ limit: 50 }).catch(() => []),
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

      setSubscriptions(subsData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to platform API');
    } finally {
      setIsLoading(false);
      setIsSubsLoading(false);
    }
  };

  useEffect(() => {
    if (!propData) {
      fetchPlatformOverview();
    } else {
      setLiveData(propData);
      // Fetch billing and subscriptions if propData was passed
      subscriptionApi.getBillingOverview().then((b) => setBillingData(b)).catch(() => {});
      subscriptionApi.getSubscriptions({ limit: 50 }).then((s) => {
        setSubscriptions(s);
        setIsSubsLoading(false);
      }).catch(() => setIsSubsLoading(false));
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

  // Compute maximum quota utilization ratio for a subscription
  const getMaxQuotaRatio = (sub: TenantSubscription): number => {
    const limits = sub.plan?.limits || {};
    const usage = sub.usage || { users: 0, locations: 0, products: 0, monthly_orders: 0 };
    const ratios: number[] = [];
    if (limits.users) ratios.push(usage.users / limits.users);
    if (limits.locations) ratios.push(usage.locations / limits.locations);
    if (limits.products) ratios.push(usage.products / limits.products);
    if (limits.monthly_orders) ratios.push(usage.monthly_orders / limits.monthly_orders);
    return ratios.length ? Math.max(...ratios) : 0;
  };

  // Filter subscriptions for table
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      const name = (sub.organization_name || sub.organization_id || '').toLowerCase();
      const code = (sub.organization_code || '').toLowerCase();
      const planCode = (sub.plan?.code || '').toLowerCase();
      const matchesSearch =
        !subSearch.trim() ||
        name.includes(subSearch.toLowerCase()) ||
        code.includes(subSearch.toLowerCase()) ||
        planCode.includes(subSearch.toLowerCase());

      if (!matchesSearch) return false;

      if (subFilter === 'active') return sub.status === 'active';
      if (subFilter === 'trialing') return sub.status === 'trialing';
      if (subFilter === 'paused') return sub.status === 'paused';
      if (subFilter === 'high_quota') return getMaxQuotaRatio(sub) >= 0.8;

      return true;
    });
  }, [subscriptions, subSearch, subFilter]);

  const getSubStatusBadge = (sub: TenantSubscription) => {
    if (sub.cancel_at_period_end) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
          <Clock className="w-3 h-3 text-amber-600" />
          <span>Cancelling</span>
        </span>
      );
    }
    switch (sub.status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Active</span>
          </span>
        );
      case 'trialing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Trial</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            <Ban className="w-3 h-3 text-slate-500" />
            <span>Paused</span>
          </span>
        );
      case 'cancelled':
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60">
            <span>{sub.status}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {sub.status}
          </span>
        );
    }
  };

  const getSubPlanBadge = (code?: string) => {
    switch (code) {
      case 'enterprise':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60">
            Enterprise
          </span>
        );
      case 'professional':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60">
            Professional
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            Starter
          </span>
        );
    }
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-300 pb-12" aria-labelledby="system-owner-title">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              SaaS Control Plane
            </span>
            <span className="text-xs text-slate-400 font-mono">Platform v2.4</span>
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

      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <span className="font-bold">Dashboard Synchronization Error: </span>
            {error}
          </div>
        </div>
      )}

      {/* Primary Executive Metric Cards (Responsive Grid) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Tenants */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Tenants
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeData?.totalTenants ?? tenants.length}
              </p>
            </div>
            <span className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-2.5 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Building2 className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {counts.active} active · {counts.trial} trial
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              {counts.suspended} paused
            </span>
          </div>
        </div>

        {/* Active Platform Users */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Users
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeData?.activeUsers ?? '—'}
              </p>
            </div>
            <span className="rounded-xl bg-purple-50 dark:bg-purple-950/40 p-2.5 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Across all provisioned tenants</span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700">
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
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4">
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

      {/* CORE SUBSCRIPTION TABLE FOR SYSTEM OWNER */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {/* Table Header & Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="font-bold text-slate-900 dark:text-white text-base">
                  Tenant Subscriptions & Plan Licensing
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                  {subscriptions.length} registered
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Real-time tenant subscription tiers, MRR contribution, renewal cycles, and resource utilization
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate?.('subscriptions')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <span>Open Full Management Workspace</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tenant or plan tier..."
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Tactile Segmented Filter */}
            <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 inline-flex items-center gap-1">
              {[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Trial', value: 'trialing' },
                { label: 'High Quota', value: 'high_quota' },
                { label: 'Paused', value: 'paused' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setSubFilter(tab.value as any)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    subFilter === tab.value
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Subscriptions Table / Cards */}
        {isSubsLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-indigo-500" />
            Loading subscription ledger...
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No subscriptions found matching the selected filter criteria.
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                    <th className="px-5 py-3.5">Organization</th>
                    <th className="px-5 py-3.5">Plan Tier</th>
                    <th className="px-5 py-3.5">MRR Contribution</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Renewal Cycle</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Quota Health</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredSubscriptions.map((sub) => {
                    const maxRatio = getMaxQuotaRatio(sub);
                    const isHigh = maxRatio >= 0.8;
                    const periodEnd = new Date(sub.current_period_end).toLocaleDateString();

                    return (
                      <tr
                        key={sub.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-850/40 transition-colors group"
                      >
                        {/* Tenant Organization */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs border border-indigo-200/40 dark:border-indigo-800/40">
                              {(sub.organization_name || sub.organization_code || 'T').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">
                                {sub.organization_name || sub.organization_id}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                                <span>{sub.organization_code || 'ORG'}</span>
                                <span>·</span>
                                <span className="truncate max-w-[90px]">{sub.organization_id}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Plan Tier */}
                        <td className="px-5 py-3.5">
                          <div>{getSubPlanBadge(sub.plan?.code)}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            {sub.plan?.billing_interval || 'monthly'}
                          </div>
                        </td>

                        {/* MRR / Rate */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {sub.plan?.currency} {Number(sub.plan?.amount).toLocaleString()}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          {getSubStatusBadge(sub)}
                        </td>

                        {/* Renewal */}
                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1 text-[11px] font-mono">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{periodEnd}</span>
                          </div>
                        </td>

                        {/* Quota Health */}
                        <td className="px-5 py-3.5 min-w-[140px]">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400 font-medium">Utilization</span>
                              <span className={`font-mono font-bold ${isHigh ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                {Math.round(maxRatio * 100)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  maxRatio >= 1.0
                                    ? 'bg-rose-500'
                                    : isHigh
                                    ? 'bg-amber-500'
                                    : 'bg-indigo-600 dark:bg-indigo-400'
                                }`}
                                style={{ width: `${Math.min(100, Math.round(maxRatio * 100))}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Administrative Action Dropdown */}
                        <td className="px-5 py-3.5 text-right relative">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionSubId(openActionSubId === sub.id ? null : sub.id);
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                                openActionSubId === sub.id
                                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
                              }`}
                              title="Administrative actions"
                            >
                              <span>Actions</span>
                              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${openActionSubId === sub.id ? 'rotate-180' : ''}`} />
                            </button>

                            {openActionSubId === sub.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute right-0 ${
                                  filteredSubscriptions.indexOf(sub) >= filteredSubscriptions.length - 2
                                    ? 'bottom-full mb-1.5'
                                    : 'top-full mt-1.5'
                                } w-56 z-50 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl p-1 text-xs divide-y divide-slate-100 dark:divide-slate-800 text-left`}
                              >
                                <div className="py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionSubId(null);
                                      onNavigate?.('subscriptions');
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 transition-colors cursor-pointer"
                                  >
                                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Manage in Workspace</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionSubId(null);
                                      setQuotaInspectionSub(sub);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Inspect Quota Health</span>
                                  </button>
                                </div>
                                <div className="py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionSubId(null);
                                      onNavigate?.('tenants');
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                    <span>View Tenant Directory</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< 768px) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSubscriptions.map((sub) => {
                const maxRatio = getMaxQuotaRatio(sub);
                const isHigh = maxRatio >= 0.8;

                return (
                  <div key={sub.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                          {(sub.organization_name || sub.organization_code || 'T').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white text-xs">
                            {sub.organization_name || sub.organization_id}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {sub.organization_code || 'ORG'}
                          </p>
                        </div>
                      </div>
                      <div>{getSubStatusBadge(sub)}</div>
                    </div>

                    <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Plan</span>
                        <div className="mt-0.5">{getSubPlanBadge(sub.plan?.code)}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">Rate</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {sub.plan?.currency} {Number(sub.plan?.amount).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="text-[11px] text-slate-500">
                        Renewal: <span className="font-mono font-semibold">{new Date(sub.current_period_end).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuotaInspectionSub(sub)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigate?.('subscriptions')}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          <span>Manage</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
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
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold capitalize border ${
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

      {/* Quick Quota Inspection Modal for System Owner */}
      {quotaInspectionSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  {(quotaInspectionSub.organization_name || quotaInspectionSub.organization_code || 'T').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {quotaInspectionSub.organization_name || quotaInspectionSub.organization_id}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                    <span>{quotaInspectionSub.organization_code || 'ORG'}</span>
                    <span>·</span>
                    <span>Plan: {quotaInspectionSub.plan?.name || 'Starter'}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuotaInspectionSub(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Resource Quota Utilization</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: 'Users / Operators', used: quotaInspectionSub.usage?.users || 0, limit: quotaInspectionSub.plan?.limits?.users },
                  { name: 'Store Locations', used: quotaInspectionSub.usage?.locations || 0, limit: quotaInspectionSub.plan?.limits?.locations },
                  { name: 'Product Catalog', used: quotaInspectionSub.usage?.products || 0, limit: quotaInspectionSub.plan?.limits?.products },
                  { name: 'Monthly Orders', used: quotaInspectionSub.usage?.monthly_orders || 0, limit: quotaInspectionSub.plan?.limits?.monthly_orders },
                ].map((meter) => {
                  const ratio = meter.limit ? meter.used / meter.limit : 0;
                  const isHigh = ratio >= 0.8;
                  const isExceeded = ratio >= 1.0;
                  return (
                    <div key={meter.name} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{meter.name}</span>
                        <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-white">
                          {meter.used} / {meter.limit ?? '∞'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-750 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isExceeded ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-indigo-600 dark:bg-indigo-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isExceeded ? 'Quota Exceeded' : isHigh ? 'Approaching Limit' : 'Within Limits'} ({Math.round(ratio * 100)}%)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="text-slate-500">
                Renewal: <strong className="text-slate-800 dark:text-slate-200">{new Date(quotaInspectionSub.current_period_end).toLocaleDateString()}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuotaInspectionSub(null)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuotaInspectionSub(null);
                    onNavigate?.('subscriptions');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Open Full Workspace</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};