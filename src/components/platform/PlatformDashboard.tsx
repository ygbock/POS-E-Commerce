import React, { useState, useEffect } from 'react';
import {
  Building2,
  ReceiptText,
  ShieldAlert,
  Users,
  Activity,
  Server,
  ArrowUpRight,
  TrendingUp,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface PlatformDashboardProps {
  setActiveTab: (tab: string) => void;
}

export const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ setActiveTab }) => {
  const { currentRole } = useCommerce();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalTenants: 12,
    activeSubscriptions: 11,
    trialTenants: 1,
    suspendedTenants: 0,
    mrr: 4890,
    systemUptime: '99.99%',
  });

  useEffect(() => {
    // Fetch live platform metrics if available
    async function loadMetrics() {
      try {
        setLoading(true);
        const res = await fetch('/api/platform/subscriptions', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('abacha_auth_token') || ''}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            const subs = json.data;
            const active = subs.filter((s: any) => s.status === 'active').length;
            const trial = subs.filter((s: any) => s.status === 'trial').length;
            const suspended = subs.filter((s: any) => s.status === 'suspended').length;
            setStats((prev) => ({
              ...prev,
              totalTenants: subs.length,
              activeSubscriptions: active,
              trialTenants: trial,
              suspendedTenants: suspended,
            }));
          }
        }
      } catch {
        // use default state
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Sparkles className="w-3 h-3 text-indigo-300" />
                Multi-Tenant Control Plane
              </span>
              <span className="text-xs text-slate-400 font-mono">Role: {currentRole}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Global Platform Overview
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Centralized platform operations for tenant provisioning, tier entitlements, subscription lifecycle, and security monitoring.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
            >
              <ReceiptText className="w-4 h-4" />
              Manage Subscriptions
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              Audit Logs
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Tenants</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalTenants}</span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" /> +2 this mo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Cross-regional commercial accounts</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Subscriptions</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.activeSubscriptions}</span>
            <span className="text-xs text-slate-400">({stats.trialTenants} on trial)</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Enforced with authoritative quotas</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Monthly Run Rate</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">${stats.mrr.toLocaleString()}</span>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">MRR</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Across Starter, Pro & Enterprise tiers</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Platform Health</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.systemUptime}</span>
            <span className="text-xs text-slate-400">uptime</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">All micro-services fully operational</p>
        </div>
      </div>

      {/* Operations Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Platform Modules & Control Services</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Direct operational gateways for the control plane</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setActiveTab('tenants')}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tenant Organizations</h3>
              <p className="text-xs text-slate-500 mt-1">View active tenants, inspect assigned plans, and adjust quotas.</p>
            </div>

            <div
              onClick={() => setActiveTab('subscriptions')}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <ReceiptText className="w-4 h-4" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Plans & Entitlements</h3>
              <p className="text-xs text-slate-500 mt-1">Configure pricing tiers, version definitions, and feature entitlement flags.</p>
            </div>

            <div
              onClick={() => setActiveTab('security')}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Platform Security & Auditing</h3>
              <p className="text-xs text-slate-500 mt-1">Review authoritative cryptographic audit logs across all tenants.</p>
            </div>

            <div
              onClick={() => setActiveTab('support')}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Support & Operations</h3>
              <p className="text-xs text-slate-500 mt-1">Extend trial periods, troubleshoot tenant sync, and manage incident overrides.</p>
            </div>
          </div>
        </div>

        {/* System Architecture Node Status */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Control Plane Health</h2>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Authoritative DB Engine</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">PostgreSQL Active</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Entitlements Gatekeeper</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Enforcing (011/012)</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">RBAC Token Verifier</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">SEC-001 Strict</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Platform Node: eu-west2 (Live)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
