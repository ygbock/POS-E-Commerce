import React, { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Layers,
  Users,
  MapPin,
  Package,
  ShoppingBag,
  ArrowUpRight,
  Ban,
  Play,
  History,
  Edit,
  Shield,
  Search,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import {
  subscriptionApi,
  SubscriptionPlan,
  TenantSubscription,
  BillingOverview,
  SubscriptionAuditRecord,
} from '../../services/subscriptionApi';

export const SubscriptionsManagementView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'subscriptions' | 'plans'>('subscriptions');

  // Overview state
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action Modals State
  const [selectedSub, setSelectedSub] = useState<TenantSubscription | null>(null);
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false);
  const [targetPlanCode, setTargetPlanCode] = useState<string>('');
  const [changePlanReason, setChangePlanReason] = useState<string>('');

  const [extendTrialModalOpen, setExtendTrialModalOpen] = useState(false);
  const [extendTrialDays, setExtendTrialDays] = useState<number>(14);
  const [extendTrialReason, setExtendTrialReason] = useState<string>('');

  const [lifecycleModalOpen, setLifecycleModalOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<'suspend' | 'reactivate' | 'cancel' | 'restore'>('suspend');
  const [cancelImmediate, setCancelImmediate] = useState<boolean>(false);
  const [lifecycleReason, setLifecycleReason] = useState<string>('');

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<SubscriptionAuditRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [editPlanModalOpen, setEditPlanModalOpen] = useState(false);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<SubscriptionPlan | null>(null);
  const [editPlanName, setEditPlanName] = useState<string>('');
  const [editPlanDescription, setEditPlanDescription] = useState<string>('');
  const [editPlanAmount, setEditPlanAmount] = useState<string>('');
  const [editPlanUsersLimit, setEditPlanUsersLimit] = useState<string>('');
  const [editPlanLocationsLimit, setEditPlanLocationsLimit] = useState<string>('');
  const [editPlanProductsLimit, setEditPlanProductsLimit] = useState<string>('');
  const [editPlanOrdersLimit, setEditPlanOrdersLimit] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Load All Data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, plansData, subsData] = await Promise.all([
        subscriptionApi.getBillingOverview(),
        subscriptionApi.getPlans(true),
        subscriptionApi.getSubscriptions({
          status: statusFilter,
          plan: planFilter,
          search: searchQuery.trim() || undefined,
        }),
      ]);
      setOverview(overviewData);
      setPlans(plansData);
      setSubscriptions(subsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load platform subscription data.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, planFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenChangePlan = (sub: TenantSubscription) => {
    setSelectedSub(sub);
    setTargetPlanCode(sub.plan?.code || 'professional');
    setChangePlanReason('');
    setChangePlanModalOpen(true);
  };

  const handleExecuteChangePlan = async () => {
    if (!selectedSub || !targetPlanCode) return;
    setIsProcessing(true);
    setError(null);
    try {
      await subscriptionApi.changePlan(selectedSub.organization_id, targetPlanCode, changePlanReason);
      setActionSuccess(`Plan changed successfully to ${targetPlanCode.toUpperCase()}`);
      setChangePlanModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to change subscription plan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenExtendTrial = (sub: TenantSubscription) => {
    setSelectedSub(sub);
    setExtendTrialDays(14);
    setExtendTrialReason('');
    setExtendTrialModalOpen(true);
  };

  const handleExecuteExtendTrial = async () => {
    if (!selectedSub || extendTrialDays <= 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      await subscriptionApi.extendTrial(selectedSub.organization_id, extendTrialDays, extendTrialReason);
      setActionSuccess(`Trial extended by ${extendTrialDays} days.`);
      setExtendTrialModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to extend trial.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenLifecycle = (sub: TenantSubscription, action: 'suspend' | 'reactivate' | 'cancel' | 'restore') => {
    setSelectedSub(sub);
    setLifecycleAction(action);
    setCancelImmediate(false);
    setLifecycleReason('');
    setLifecycleModalOpen(true);
  };

  const handleExecuteLifecycle = async () => {
    if (!selectedSub) return;
    setIsProcessing(true);
    setError(null);
    try {
      if (lifecycleAction === 'suspend') {
        await subscriptionApi.suspendSubscription(selectedSub.organization_id, lifecycleReason);
        setActionSuccess('Subscription suspended.');
      } else if (lifecycleAction === 'reactivate') {
        await subscriptionApi.reactivateSubscription(selectedSub.organization_id, lifecycleReason);
        setActionSuccess('Subscription reactivated.');
      } else if (lifecycleAction === 'cancel') {
        await subscriptionApi.cancelSubscription(selectedSub.organization_id, cancelImmediate, lifecycleReason);
        setActionSuccess(cancelImmediate ? 'Subscription cancelled immediately.' : 'Subscription scheduled for period-end cancellation.');
      } else if (lifecycleAction === 'restore') {
        await subscriptionApi.restoreSubscription(selectedSub.organization_id, lifecycleReason);
        setActionSuccess('Subscription restored to active.');
      }
      setLifecycleModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || `Failed to execute ${lifecycleAction}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenHistory = async (sub: TenantSubscription) => {
    setSelectedSub(sub);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const records = await subscriptionApi.getSubscriptionHistory(sub.organization_id);
      setHistoryRecords(records);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription audit history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenEditPlan = (plan: SubscriptionPlan) => {
    setSelectedPlanForEdit(plan);
    setEditPlanName(plan.name);
    setEditPlanDescription(plan.description || '');
    setEditPlanAmount(String(plan.amount));
    setEditPlanUsersLimit(String(plan.limits.users ?? ''));
    setEditPlanLocationsLimit(String(plan.limits.locations ?? ''));
    setEditPlanProductsLimit(String(plan.limits.products ?? ''));
    setEditPlanOrdersLimit(String(plan.limits.monthly_orders ?? ''));
    setEditPlanModalOpen(true);
  };

  const handleExecuteEditPlan = async () => {
    if (!selectedPlanForEdit) return;
    setIsProcessing(true);
    setError(null);
    try {
      const amt = parseFloat(editPlanAmount);
      if (isNaN(amt) || amt < 0) {
        throw new Error('Please enter a valid non-negative amount.');
      }

      const limits: Record<string, number> = {};
      if (editPlanUsersLimit) limits.users = parseInt(editPlanUsersLimit, 10);
      if (editPlanLocationsLimit) limits.locations = parseInt(editPlanLocationsLimit, 10);
      if (editPlanProductsLimit) limits.products = parseInt(editPlanProductsLimit, 10);
      if (editPlanOrdersLimit) limits.monthly_orders = parseInt(editPlanOrdersLimit, 10);

      await subscriptionApi.updatePlan(selectedPlanForEdit.id, {
        name: editPlanName.trim(),
        description: editPlanDescription.trim() || null,
        amount: amt,
        limits,
      });

      setActionSuccess(`Plan '${selectedPlanForEdit.name}' updated successfully.`);
      setEditPlanModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update plan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (sub: TenantSubscription) => {
    if (sub.cancel_at_period_end) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          Cancelling Period-End
        </span>
      );
    }
    switch (sub.status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'trialing':
        return <Badge variant="warning">Trial</Badge>;
      case 'paused':
        return <Badge variant="neutral">Paused</Badge>;
      case 'cancelled':
        return <Badge variant="error">Cancelled</Badge>;
      case 'expired':
        return <Badge variant="error">Expired</Badge>;
      default:
        return <Badge variant="neutral">{sub.status}</Badge>;
    }
  };

  const getPlanBadge = (code: string) => {
    switch (code) {
      case 'enterprise':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Enterprise</span>;
      case 'professional':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Professional</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Starter</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            SaaS Subscription & Billing Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Super Admin control plane for SaaS tenant subscriptions, quotas, and canonical plan tiers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 text-sm font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{actionSuccess}</p>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800 text-sm font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Authoritative MRR</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {overview ? `${overview.currency} ${overview.mrr.toLocaleString()}` : '—'}
            </span>
            <span className="text-xs text-emerald-600 font-semibold flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" /> normalized
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Paid active subscriptions only</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Active Subscribers</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {overview ? overview.activeCount : '—'}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Tenants in good standing</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Trialing Accounts</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {overview ? overview.trialingCount : '—'}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Active evaluation window</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Suspended (Paused)</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <Ban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {overview ? overview.pausedCount : '—'}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Administrative review</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Cancelled / Expired</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {overview ? overview.cancelledCount : '—'}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Historical churned records</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveSubTab('subscriptions')}
          className={`pb-3 text-sm font-semibold transition-colors relative ${
            activeSubTab === 'subscriptions'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          Tenant Subscriptions ({subscriptions.length})
          {activeSubTab === 'subscriptions' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('plans')}
          className={`pb-3 text-sm font-semibold transition-colors relative ${
            activeSubTab === 'plans'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          Plan Tiers & Quotas ({plans.length})
          {activeSubTab === 'plans' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
          )}
        </button>
      </div>

      {/* TAB 1: TENANT SUBSCRIPTIONS */}
      {activeSubTab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-1 items-center gap-3 w-full">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tenant name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="w-40">
                <Select
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'active', label: 'Active' },
                    { value: 'trialing', label: 'Trialing' },
                    { value: 'paused', label: 'Paused' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>

              <div className="w-40">
                <Select
                  value={planFilter}
                  onChange={(val) => setPlanFilter(val)}
                  options={[
                    { value: 'all', label: 'All Plans' },
                    { value: 'starter', label: 'Starter' },
                    { value: 'professional', label: 'Professional' },
                    { value: 'enterprise', label: 'Enterprise' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center">
                <Spinner size="lg" />
                <p className="mt-3 text-sm text-slate-500">Loading tenant subscriptions...</p>
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No subscriptions found</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Try adjusting your filters or search terms.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Tenant</th>
                      <th className="px-6 py-3.5">Plan Tier</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Billing Period</th>
                      <th className="px-6 py-3.5">Quotas & Usage</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {subscriptions.map((sub) => {
                      const limits = sub.plan?.limits || {};
                      const usage = sub.usage || { users: 0, locations: 0, products: 0, monthly_orders: 0 };
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {sub.organization_name || sub.organization_id}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              {sub.organization_code || sub.organization_id}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {getPlanBadge(sub.plan?.code)}
                            <div className="text-xs text-slate-400 mt-1">
                              {sub.plan?.currency} {sub.plan?.amount} / {sub.plan?.billing_interval}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {getStatusBadge(sub)}
                            {sub.trial_ends_at && sub.status === 'trialing' && (
                              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                Ends: {new Date(sub.trial_ends_at).toLocaleDateString()}
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">
                            <div>Start: {new Date(sub.current_period_start).toLocaleDateString()}</div>
                            <div>End: {new Date(sub.current_period_end).toLocaleDateString()}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                <span>Users: <strong>{usage.users}</strong> / {limits.users ?? '∞'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>Locs: <strong>{usage.locations}</strong> / {limits.locations ?? '∞'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-slate-400" />
                                <span>Prods: <strong>{usage.products}</strong> / {limits.products ?? '∞'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                                <span>Orders/Mo: <strong>{usage.monthly_orders}</strong> / {limits.monthly_orders ?? '∞'}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Change Plan Button */}
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenChangePlan(sub)}
                                title="Change Plan"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                                Plan
                              </Button>

                              {/* Extend Trial (if active/trialing) */}
                              {['trialing', 'active'].includes(sub.status) && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleOpenExtendTrial(sub)}
                                  title="Extend Trial"
                                >
                                  <Clock className="w-3.5 h-3.5 mr-1" />
                                  Trial
                                </Button>
                              )}

                              {/* Suspend (if active/trialing) */}
                              {['trialing', 'active'].includes(sub.status) && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleOpenLifecycle(sub, 'suspend')}
                                  title="Suspend Subscription"
                                >
                                  <Ban className="w-3.5 h-3.5 mr-1 text-amber-500" />
                                  Suspend
                                </Button>
                              )}

                              {/* Reactivate (if paused) */}
                              {sub.status === 'paused' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleOpenLifecycle(sub, 'reactivate')}
                                  title="Reactivate Subscription"
                                >
                                  <Play className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                                  Reactivate
                                </Button>
                              )}

                              {/* Cancel (if active/trialing/paused) */}
                              {['active', 'trialing', 'paused'].includes(sub.status) && !sub.cancel_at_period_end && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleOpenLifecycle(sub, 'cancel')}
                                  title="Cancel Subscription"
                                >
                                  Cancel
                                </Button>
                              )}

                              {/* Restore (if cancelled/expired) */}
                              {['cancelled', 'expired'].includes(sub.status) && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleOpenLifecycle(sub, 'restore')}
                                  title="Restore Subscription"
                                >
                                  Restore
                                </Button>
                              )}

                              {/* Audit History */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenHistory(sub)}
                                title="View Audit History"
                              >
                                <History className="w-4 h-4 text-slate-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PLANS & LIMITS */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isEnterprise = plan.code === 'enterprise';
            const isPro = plan.code === 'professional';
            return (
              <div
                key={plan.id}
                className={`p-6 rounded-2xl bg-white dark:bg-slate-900 border shadow-sm flex flex-col justify-between ${
                  isEnterprise
                    ? 'border-purple-300 dark:border-purple-800 ring-2 ring-purple-500/20'
                    : isPro
                    ? 'border-blue-300 dark:border-blue-800 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {plan.code}
                    </span>
                    <Badge variant={plan.is_active ? 'success' : 'neutral'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 dark:text-white mt-2">
                    {plan.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
                    {plan.description || 'Standard plan tier specification.'}
                  </p>

                  <div className="mt-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">
                      {plan.currency} {plan.amount}
                    </span>
                    <span className="text-xs text-slate-400 font-medium ml-1">/ {plan.billing_interval}</span>
                  </div>

                  {/* Quotas */}
                  <div className="mt-4 space-y-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan Quotas</span>
                    <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" /> Max Users</span>
                        <strong>{plan.limits.users ?? 'Unlimited'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" /> Max Locations</span>
                        <strong>{plan.limits.locations ?? 'Unlimited'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><Package className="w-4 h-4 text-slate-400" /> Max Products</span>
                        <strong>{plan.limits.products ?? 'Unlimited'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><ShoppingBag className="w-4 h-4 text-slate-400" /> Monthly Orders</span>
                        <strong>{plan.limits.monthly_orders ?? 'Unlimited'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Feature Gates */}
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gated Features</span>
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(plan.features || {}).map(([featureKey, enabled]) => (
                        <div key={featureKey} className="flex items-center justify-between">
                          <span className="text-slate-600 dark:text-slate-400 capitalize">{featureKey.replace(/_/g, ' ')}</span>
                          {enabled ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Enabled
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Disabled</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-1.5"
                    onClick={() => handleOpenEditPlan(plan)}
                  >
                    <Edit className="w-4 h-4" />
                    Configure Limits & Pricing
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: CHANGE PLAN */}
      <Modal
        isOpen={changePlanModalOpen}
        onClose={() => setChangePlanModalOpen(false)}
        title="Change Tenant Subscription Plan"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Updating the plan for <strong>{selectedSub?.organization_name}</strong> will update tenant limits, gated features, and sync the organization record transactionally.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Select Target Plan
            </label>
            <Select
              value={targetPlanCode}
              onChange={(val) => setTargetPlanCode(val)}
              options={plans.map((p) => ({
                value: p.code,
                label: `${p.name} (${p.currency} ${p.amount}/${p.billing_interval})`,
              }))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Audit Reason
            </label>
            <Input
              type="text"
              placeholder="e.g., Customer requested tier upgrade"
              value={changePlanReason}
              onChange={(e) => setChangePlanReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setChangePlanModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExecuteChangePlan} disabled={isProcessing}>
              {isProcessing ? 'Updating...' : 'Confirm Plan Change'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: EXTEND TRIAL */}
      <Modal
        isOpen={extendTrialModalOpen}
        onClose={() => setExtendTrialModalOpen(false)}
        title="Extend Subscription Trial Window"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Extend the active trial evaluation for <strong>{selectedSub?.organization_name}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Additional Days
            </label>
            <Input
              type="number"
              min={1}
              max={365}
              value={extendTrialDays}
              onChange={(e) => setExtendTrialDays(parseInt(e.target.value, 10) || 1)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Reason / Justification
            </label>
            <Input
              type="text"
              placeholder="e.g., Customer onboarding extension granted"
              value={extendTrialReason}
              onChange={(e) => setExtendTrialReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setExtendTrialModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExecuteExtendTrial} disabled={isProcessing}>
              {isProcessing ? 'Extending...' : 'Confirm Trial Extension'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 3: LIFECYCLE ACTION (SUSPEND / REACTIVATE / CANCEL / RESTORE) */}
      <Modal
        isOpen={lifecycleModalOpen}
        onClose={() => setLifecycleModalOpen(false)}
        title={
          lifecycleAction === 'suspend'
            ? 'Suspend Tenant Subscription'
            : lifecycleAction === 'reactivate'
            ? 'Reactivate Tenant Subscription'
            : lifecycleAction === 'cancel'
            ? 'Cancel Tenant Subscription'
            : 'Restore Tenant Subscription'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Target Tenant: <strong>{selectedSub?.organization_name}</strong>
          </p>

          {lifecycleAction === 'cancel' && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cancelImmediate}
                  onChange={(e) => setCancelImmediate(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Immediate Cancellation
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cancelImmediate
                  ? 'The subscription will be cancelled immediately today, terminating billable service.'
                  : 'The subscription will remain active until the end of the current billing cycle.'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Audit Reason
            </label>
            <Input
              type="text"
              placeholder="e.g., Operator initiated lifecycle transition"
              value={lifecycleReason}
              onChange={(e) => setLifecycleReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setLifecycleModalOpen(false)} disabled={isProcessing}>
              Close
            </Button>
            <Button
              variant={lifecycleAction === 'cancel' || lifecycleAction === 'suspend' ? 'danger' : 'primary'}
              onClick={handleExecuteLifecycle}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : `Confirm ${lifecycleAction}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: AUDIT HISTORY */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={`Subscription Audit History: ${selectedSub?.organization_name}`}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {historyLoading ? (
            <div className="p-8 text-center">
              <Spinner size="md" />
              <p className="text-xs text-slate-400 mt-2">Loading audit events...</p>
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No audit records found for this subscription.
            </div>
          ) : (
            <div className="space-y-3">
              {historyRecords.map((rec) => (
                <div key={rec.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center justify-between text-slate-500 font-mono">
                    <span>{new Date(rec.timestamp).toLocaleString()}</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{rec.action}</span>
                  </div>
                  <div className="mt-1.5 text-slate-700 dark:text-slate-300">
                    Actor: <strong>{rec.actor_name}</strong> ({rec.actor_role})
                  </div>
                  {rec.metadata?.reason && (
                    <div className="mt-1 text-slate-500 italic">
                      Reason: "{rec.metadata.reason}"
                    </div>
                  )}
                  {rec.after_state && (
                    <pre className="mt-2 p-2 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 overflow-x-auto text-[11px]">
                      {JSON.stringify(rec.after_state, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL 5: EDIT PLAN DEFINITION */}
      <Modal
        isOpen={editPlanModalOpen}
        onClose={() => setEditPlanModalOpen(false)}
        title={`Configure Plan: ${selectedPlanForEdit?.name}`}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Plan Display Name
            </label>
            <Input
              type="text"
              value={editPlanName}
              onChange={(e) => setEditPlanName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Description
            </label>
            <Input
              type="text"
              value={editPlanDescription}
              onChange={(e) => setEditPlanDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Price ({selectedPlanForEdit?.currency})
            </label>
            <Input
              type="number"
              step="0.01"
              value={editPlanAmount}
              onChange={(e) => setEditPlanAmount(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Authoritative Quotas</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max Users</label>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  value={editPlanUsersLimit}
                  onChange={(e) => setEditPlanUsersLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max Locations</label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={editPlanLocationsLimit}
                  onChange={(e) => setEditPlanLocationsLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max Products</label>
                <Input
                  type="number"
                  placeholder="e.g. 250"
                  value={editPlanProductsLimit}
                  onChange={(e) => setEditPlanProductsLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Monthly Orders</label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={editPlanOrdersLimit}
                  onChange={(e) => setEditPlanOrdersLimit(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setEditPlanModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExecuteEditPlan} disabled={isProcessing}>
              {isProcessing ? 'Saving...' : 'Save Plan Configuration'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
