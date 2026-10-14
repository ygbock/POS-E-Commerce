import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  FileText,
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
  Filter,
  X,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Calendar,
  Check,
  AlertCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useCommerce } from '../../context/CommerceContext';
import { canAccessPlatform } from './platformAccess';
import {
  subscriptionApi,
  SubscriptionPlan,
  TenantSubscription,
  BillingOverview,
  SubscriptionAuditRecord,
  BillingInvoice,
} from '../../services/subscriptionApi';

export const SubscriptionsManagementView: React.FC = () => {
  const { currentRole } = useCommerce();
  const canViewBilling = canAccessPlatform(currentRole, 'billing');
  const [activeSubTab, setActiveSubTab] = useState<'subscriptions' | 'plans' | 'invoices'>('subscriptions');

  // Overview state
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [invoiceTenants, setInvoiceTenants] = useState<TenantSubscription[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoiceOrganizationId, setInvoiceOrganizationId] = useState('');
  const [invoiceCreating, setInvoiceCreating] = useState(false);
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
    if (!canViewBilling) {
      setIsLoading(false);
      return;
    }
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
  }, [canViewBilling, statusFilter, planFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadInvoices = useCallback(async () => {
    if (!canViewBilling) return;
    setInvoicesLoading(true);
    try {
      const [rows, tenantRows] = await Promise.all([
        subscriptionApi.getInvoices({ status: invoiceStatusFilter, limit: 50, offset: 0 }),
        subscriptionApi.getSubscriptions({ limit: 200 }),
      ]);
      setInvoices(rows);
      setInvoiceTenants(tenantRows);
    } catch (err: any) {
      setError(err.message || 'Failed to load billing invoices.');
    } finally {
      setInvoicesLoading(false);
    }
  }, [canViewBilling, invoiceStatusFilter]);

  useEffect(() => {
    if (activeSubTab === 'invoices') loadInvoices();
  }, [activeSubTab, loadInvoices]);

  const handleCreateInvoice = async () => {
    if (!invoiceOrganizationId) {
      setError('Select a tenant before creating an invoice.');
      return;
    }
    setInvoiceCreating(true);
    setError(null);
    try {
      const invoice = await subscriptionApi.createInvoice(invoiceOrganizationId, 'Created from platform billing workspace');
      setActionSuccess(`Invoice ${invoice.invoice_number} created successfully.`);
      await loadInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice.');
    } finally {
      setInvoiceCreating(false);
    }
  };

  if (!canViewBilling) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" aria-labelledby="billing-access-title">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <h1 id="billing-access-title" className="text-lg font-bold">Billing access required</h1>
            <p className="text-sm">Your current platform role ({currentRole}) does not have permission to manage SaaS subscriptions or plans.</p>
            <p className="text-sm">Use a System Owner, Platform Admin, or Platform Finance account, or ask an authorized administrator to review your assigned platform role. This page has not sent any billing requests.</p>
          </div>
        </div>
      </section>
    );
  }

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
      setActionSuccess(`Plan successfully transitioned to ${targetPlanCode.toUpperCase()}`);
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
        setActionSuccess(`Subscription for ${selectedSub.organization_name || selectedSub.organization_id} suspended.`);
      } else if (lifecycleAction === 'reactivate') {
        await subscriptionApi.reactivateSubscription(selectedSub.organization_id, lifecycleReason);
        setActionSuccess(`Subscription for ${selectedSub.organization_name || selectedSub.organization_id} reactivated.`);
      } else if (lifecycleAction === 'cancel') {
        await subscriptionApi.cancelSubscription(selectedSub.organization_id, cancelImmediate, lifecycleReason);
        setActionSuccess(
          cancelImmediate
            ? 'Subscription cancelled immediately.'
            : 'Subscription scheduled for cancellation at current period end.'
        );
      } else if (lifecycleAction === 'restore') {
        await subscriptionApi.restoreSubscription(selectedSub.organization_id, lifecycleReason);
        setActionSuccess('Subscription restored to active status.');
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
          <Clock className="w-3 h-3" /> Cancelling Period-End
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
        return <Badge variant="danger">Cancelled</Badge>;
      case 'expired':
        return <Badge variant="danger">Expired</Badge>;
      default:
        return <Badge variant="neutral">{sub.status}</Badge>;
    }
  };

  const getPlanBadge = (code?: string) => {
    switch (code) {
      case 'enterprise':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60">
            Enterprise
          </span>
        );
      case 'professional':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60">
            Professional
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            Starter
          </span>
        );
    }
  };

  const renderQuotaBar = (current: number, max: number | null | undefined, label: string) => {
    const isUnlimited = max == null;
    const ratio = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100));
    const isOver = !isUnlimited && current >= max;
    const isWarning = !isUnlimited && current / max >= 0.8 && !isOver;

    const barColor = isOver
      ? 'bg-rose-500'
      : isWarning
      ? 'bg-amber-500'
      : 'bg-indigo-600 dark:bg-indigo-400';

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">{label}</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
            {current} / {isUnlimited ? '∞' : max}
          </span>
        </div>
        {!isUnlimited && (
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full transition-all duration-300`}
              style={{ width: `${Math.min(100, ratio)}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-7 pb-8" aria-labelledby="saas-subscription-billing-title">
      {/* Top Banner / Header */}
      <header className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/70 to-sky-50/70 p-6 shadow-lg shadow-indigo-950/5 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <CreditCard className="w-3.5 h-3.5" />
                Financial Command Center
              </span>
              <span className="text-xs font-semibold text-slate-400">
                Platform Finance & Subscription Operations
              </span>
            </div>
            <h1
              id="saas-subscription-billing-title"
              className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl"
            >
              SaaS Subscription & Billing Management
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Manage tenant subscriptions, recurring revenue, trials, plan limits, and lifecycle actions from one secure billing workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
              <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              Access profile: {currentRole}
            </span>
            <Button
              variant="outline"
              onClick={loadData}
              disabled={isLoading}
              isLoading={isLoading}
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
              className="rounded-2xl"
            >
              Refresh Data
            </Button>
          </div>
        </div>
      </header>

      {/* Notifications / Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-900 dark:text-rose-200">Subscription Management Error</p>
              <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-800 dark:hover:text-rose-200 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900"
        >
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{actionSuccess}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Authoritative Financial KPI Cards (Fully Responsive Grid) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {/* MRR Card */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:hover:border-indigo-900 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Authoritative MRR
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {overview ? `${overview.currency} ${overview.mrr.toLocaleString()}` : '—'}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>In-transaction normalized</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            Paid active subscriptions only
          </p>
        </div>

        {/* Active Subscribers */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Subscribers
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {overview ? overview.activeCount : '—'}
            </div>
            <div className="mt-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
              Good standing tenants
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            Unrestricted business plane
          </p>
        </div>

        {/* Trialing Accounts */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Trialing Accounts
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {overview ? overview.trialingCount : '—'}
            </div>
            <div className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              Evaluation window open
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            Automatic period-end billing
          </p>
        </div>

        {/* Suspended (Paused) */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Suspended (Paused)
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <Ban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {overview ? overview.pausedCount : '—'}
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-500">
              Access temporarily on hold
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            Reactivation requires review
          </p>
        </div>

        {/* Cancelled / Expired */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between sm:col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cancelled / Expired
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {overview ? overview.cancelledCount : '—'}
            </div>
            <div className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
              Historical churned records
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            Retained for audit fidelity
          </p>
        </div>
      </div>

      {/* Navigation Tabs (Tactile Segmented Bar) */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('subscriptions')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'subscriptions'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Tenant Subscriptions</span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold">
            {subscriptions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('invoices')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'invoices'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Billing Invoices</span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold">{invoices.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('plans')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'plans'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Plan Tiers & Canonical Quotas</span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold">
            {plans.length}
          </span>
        </button>
      </div>

      {/* TAB 1: TENANT SUBSCRIPTIONS */}
      {activeSubTab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Responsive Filter Bar */}
          <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tenant name, slug, or organization code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status & Plan Selectors */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <div className="w-full sm:w-44">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Statuses' },
                      { value: 'active', label: 'Active' },
                      { value: 'trialing', label: 'Trialing' },
                      { value: 'paused', label: 'Paused' },
                      { value: 'cancelled', label: 'Cancelled' },
                    ]}
                  />
                </div>

                <div className="w-full sm:w-44">
                  <Select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Plans' },
                      { value: 'starter', label: 'Starter Tier' },
                      { value: 'professional', label: 'Professional Tier' },
                      { value: 'enterprise', label: 'Enterprise Tier' },
                    ]}
                  />
                </div>

                {(statusFilter !== 'all' || planFilter !== 'all' || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStatusFilter('all');
                      setPlanFilter('all');
                      setSearchQuery('');
                    }}
                    title="Reset all filters"
                    className="shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Quick Filter Chips for One-Touch Navigation */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Quick Filter:</span>
              {[
                { label: 'All Subscriptions', status: 'all', plan: 'all' },
                { label: 'Active Paid', status: 'active', plan: 'all' },
                { label: 'In Evaluation (Trial)', status: 'trialing', plan: 'all' },
                { label: 'Suspended (Paused)', status: 'paused', plan: 'all' },
                { label: 'Enterprise Tier', status: 'all', plan: 'enterprise' },
              ].map((pill) => {
                const isActive = statusFilter === pill.status && planFilter === pill.plan;
                return (
                  <button
                    key={pill.label}
                    type="button"
                    onClick={() => {
                      setStatusFilter(pill.status);
                      setPlanFilter(pill.plan);
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subscriptions Content Area */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-md shadow-slate-950/[0.03]">
            {isLoading ? (
              <div className="p-16 flex flex-col items-center justify-center">
                <Spinner size="lg" />
                <p className="mt-3 text-xs font-semibold text-slate-500">Loading authoritative subscriptions...</p>
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">No subscriptions matched</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Try clearing your search query or selecting a different status filter from the controls above.
                </p>
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatusFilter('all');
                      setPlanFilter('all');
                      setSearchQuery('');
                    }}
                  >
                    Clear Filter Criteria
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* 1. DESKTOP TABLE VIEW (hidden on mobile, shown on md and above) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <th className="px-6 py-4">Tenant Organization</th>
                        <th className="px-6 py-4">Plan & Billing</th>
                        <th className="px-6 py-4">Subscription Status</th>
                        <th className="px-6 py-4">Billing Period</th>
                        <th className="px-6 py-4">Quotas & Utilization</th>
                        <th className="px-6 py-4 text-right">Administrative Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {subscriptions.map((sub) => {
                        const limits = sub.plan?.limits || {};
                        const usage = sub.usage || { users: 0, locations: 0, products: 0, monthly_orders: 0 };
                        return (
                          <tr
                            key={sub.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            {/* Tenant Organization */}
                            <td className="px-6 py-4 align-top">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {sub.organization_name || sub.organization_id}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-mono">
                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                                  {sub.organization_code || 'ORG'}
                                </span>
                                <span>{sub.organization_id}</span>
                              </div>
                            </td>

                            {/* Plan & Pricing */}
                            <td className="px-6 py-4 align-top">
                              <div>{getPlanBadge(sub.plan?.code)}</div>
                              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1.5">
                                {sub.plan?.currency} {sub.plan?.amount}
                                <span className="text-[11px] font-normal text-slate-400 ml-1">
                                  / {sub.plan?.billing_interval}
                                </span>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 align-top">
                              <div>{getStatusBadge(sub)}</div>
                              {sub.trial_ends_at && sub.status === 'trialing' && (
                                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Ends: {new Date(sub.trial_ends_at).toLocaleDateString()}</span>
                                </div>
                              )}
                            </td>

                            {/* Period */}
                            <td className="px-6 py-4 align-top text-xs text-slate-600 dark:text-slate-400">
                              <div className="space-y-0.5">
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Start:</span>
                                  {new Date(sub.current_period_start).toLocaleDateString()}
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Next:</span>
                                  {new Date(sub.current_period_end).toLocaleDateString()}
                                </div>
                              </div>
                            </td>

                            {/* Quota meters */}
                            <td className="px-6 py-4 align-top min-w-[200px]">
                              <div className="space-y-2">
                                {renderQuotaBar(usage.users, limits.users, 'Users')}
                                {renderQuotaBar(usage.locations, limits.locations, 'Locations')}
                                {renderQuotaBar(usage.products, limits.products, 'Products')}
                                {renderQuotaBar(usage.monthly_orders, limits.monthly_orders, 'Monthly Orders')}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 align-top text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleOpenChangePlan(sub)}
                                  title="Change Plan Tier"
                                  className="h-8 text-xs font-bold"
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                                  Plan
                                </Button>

                                {['trialing', 'active'].includes(sub.status) && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleOpenExtendTrial(sub)}
                                    title="Extend Trial Evaluation"
                                    className="h-8 text-xs font-bold"
                                  >
                                    <Clock className="w-3.5 h-3.5 mr-1" />
                                    Trial
                                  </Button>
                                )}

                                {['trialing', 'active'].includes(sub.status) && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleOpenLifecycle(sub, 'suspend')}
                                    title="Suspend Subscription"
                                    className="h-8 text-xs font-bold"
                                  >
                                    <Ban className="w-3.5 h-3.5 mr-1 text-amber-500" />
                                    Suspend
                                  </Button>
                                )}

                                {sub.status === 'paused' && (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleOpenLifecycle(sub, 'reactivate')}
                                    title="Reactivate Subscription"
                                    className="h-8 text-xs font-bold"
                                  >
                                    <Play className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                                    Reactivate
                                  </Button>
                                )}

                                {['active', 'trialing', 'paused'].includes(sub.status) && !sub.cancel_at_period_end && (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleOpenLifecycle(sub, 'cancel')}
                                    title="Cancel Subscription"
                                    className="h-8 text-xs font-bold"
                                  >
                                    Cancel
                                  </Button>
                                )}

                                {['cancelled', 'expired'].includes(sub.status) && (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleOpenLifecycle(sub, 'restore')}
                                    title="Restore Subscription"
                                    className="h-8 text-xs font-bold"
                                  >
                                    Restore
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenHistory(sub)}
                                  title="View Audit History"
                                  className="h-8 w-8 p-0"
                                >
                                  <History className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 2. MOBILE CARD VIEW (shown on mobile, hidden on md and above) */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {subscriptions.map((sub) => {
                    const limits = sub.plan?.limits || {};
                    const usage = sub.usage || { users: 0, locations: 0, products: 0, monthly_orders: 0 };
                    return (
                      <div key={sub.id} className="p-5 space-y-4">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base">
                              {sub.organization_name || sub.organization_id}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                {sub.organization_code || 'ORG'}
                              </span>
                              <span>{sub.organization_id}</span>
                            </div>
                          </div>
                          <div className="shrink-0">{getStatusBadge(sub)}</div>
                        </div>

                        {/* Plan & Pricing Strip */}
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Plan</div>
                            <div className="mt-0.5">{getPlanBadge(sub.plan?.code)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rate</div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                              {sub.plan?.currency} {sub.plan?.amount} / {sub.plan?.billing_interval}
                            </div>
                          </div>
                        </div>

                        {/* Billing Period Dates */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-2.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Start</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {new Date(sub.current_period_start).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-2.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Renewal / Next</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {new Date(sub.current_period_end).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Quotas & Usage Meters in a 2x2 grid */}
                        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 space-y-2.5">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Quota & Resource Utilization
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {renderQuotaBar(usage.users, limits.users, 'Users')}
                            {renderQuotaBar(usage.locations, limits.locations, 'Locations')}
                            {renderQuotaBar(usage.products, limits.products, 'Products')}
                            {renderQuotaBar(usage.monthly_orders, limits.monthly_orders, 'Monthly Orders')}
                          </div>
                        </div>

                        {/* Mobile Actions Grid */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenChangePlan(sub)}
                            className="flex-1 text-xs font-bold"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                            Plan
                          </Button>

                          {['trialing', 'active'].includes(sub.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenExtendTrial(sub)}
                              className="flex-1 text-xs font-bold"
                            >
                              <Clock className="w-3.5 h-3.5 mr-1" />
                              Extend
                            </Button>
                          )}

                          {['trialing', 'active'].includes(sub.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenLifecycle(sub, 'suspend')}
                              className="flex-1 text-xs font-bold"
                            >
                              <Ban className="w-3.5 h-3.5 mr-1 text-amber-500" />
                              Suspend
                            </Button>
                          )}

                          {sub.status === 'paused' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleOpenLifecycle(sub, 'reactivate')}
                              className="flex-1 text-xs font-bold"
                            >
                              <Play className="w-3.5 h-3.5 mr-1" />
                              Reactivate
                            </Button>
                          )}

                          {['active', 'trialing', 'paused'].includes(sub.status) && !sub.cancel_at_period_end && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleOpenLifecycle(sub, 'cancel')}
                              className="flex-1 text-xs font-bold"
                            >
                              Cancel
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenHistory(sub)}
                            className="text-xs font-bold"
                          >
                            <History className="w-3.5 h-3.5 mr-1" />
                            History
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB: BILLING INVOICES */}
      {activeSubTab === 'invoices' && (
        <section className="space-y-4" aria-labelledby="billing-invoices-title">
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="billing-invoices-title" className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">Billing invoices</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Review invoice status and create an invoice from the tenant's current subscription pricing.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:min-w-[620px]">
              <label className="text-[11px] font-bold text-slate-500">Invoice status
                <Select value={invoiceStatusFilter} onChange={(e) => setInvoiceStatusFilter(e.target.value)} options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'open', label: 'Open' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'past_due', label: 'Past due' },
                  { value: 'void', label: 'Void' },
                  { value: 'uncollectible', label: 'Uncollectible' },
                ]} />
              </label>
              <label className="text-[11px] font-bold text-slate-500">Tenant subscription
                <Select value={invoiceOrganizationId} onChange={(e) => setInvoiceOrganizationId(e.target.value)} options={[
                  { value: '', label: 'Select tenant…' },
                  ...invoiceTenants.map((sub) => ({ value: sub.organization_id, label: sub.organization_name || sub.organization_id })),
                ]} />
              </label>
              <div className="flex items-end gap-2">
                <Button variant="primary" onClick={handleCreateInvoice} disabled={!invoiceOrganizationId || invoiceCreating} isLoading={invoiceCreating} className="flex-1">
                  <FileText className="mr-1.5 h-4 w-4" /> Create invoice
                </Button>
                <Button variant="outline" onClick={loadInvoices} disabled={invoicesLoading} title="Refresh invoices" className="px-3">
                  <RefreshCw className={`h-4 w-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {invoicesLoading ? (
              <div className="flex flex-col items-center justify-center p-12"><Spinner size="lg" /><p className="mt-3 text-xs text-slate-500">Loading invoices…</p></div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No invoices found</h3>
                <p className="mt-1 text-xs text-slate-500">Try another status filter or create an invoice for a tenant subscription.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-950/50">
                    <tr><th className="px-5 py-4">Invoice</th><th className="px-5 py-4">Tenant</th><th className="px-5 py-4">Billing period</th><th className="px-5 py-4">Due date</th><th className="px-5 py-4">Total</th><th className="px-5 py-4">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {invoices.map((invoice) => {
                      const tenant = invoiceTenants.find((sub) => sub.organization_id === invoice.organization_id);
                      const statusStyle = invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : invoice.status === 'past_due' || invoice.status === 'uncollectible' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : invoice.status === 'void' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
                      return <tr key={invoice.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-4"><div className="font-bold text-slate-900 dark:text-white">{invoice.invoice_number}</div><div className="mt-1 text-[10px] text-slate-400">Created {new Date(invoice.created_at).toLocaleDateString()}</div></td>
                        <td className="px-5 py-4"><div className="font-semibold text-slate-800 dark:text-slate-200">{tenant?.organization_name || invoice.organization_id}</div><div className="mt-1 font-mono text-[10px] text-slate-400">{invoice.organization_id}</div></td>
                        <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-300">{new Date(invoice.period_start).toLocaleDateString()} – {new Date(invoice.period_end).toLocaleDateString()}</td>
                        <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-300">{invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : '—'}</td>
                        <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">{invoice.currency} {Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusStyle}`}>{invoice.status.replace(/_/g, ' ')}</span></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Showing up to 50 most recent invoices. Invoice amounts and status come from the billing API.</p>
        </section>
      )}

      {/* TAB 2: PLANS & LIMITS */}
      {activeSubTab === 'plans' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Canonical SaaS Plan Specifications
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Plans define authoritative limits and capability gates enforced across the POS, inventory, and storefront.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
              {plans.length} Canonical Tiers Defined
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isEnterprise = plan.code === 'enterprise';
              const isPro = plan.code === 'professional';

              return (
                <div
                  key={plan.id}
                  className={`p-6 rounded-3xl bg-white dark:bg-slate-900 border shadow-sm flex flex-col justify-between transition-all duration-200 ${
                    isEnterprise
                      ? 'border-purple-300 dark:border-purple-800/80 ring-2 ring-purple-500/15'
                      : isPro
                      ? 'border-sky-300 dark:border-sky-800/80 ring-2 ring-sky-500/15'
                      : 'border-slate-200/90 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Tier: {plan.code}
                      </span>
                      <Badge variant={plan.is_active ? 'success' : 'neutral'}>
                        {plan.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                      {plan.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px] leading-relaxed">
                      {plan.description || 'Standard plan tier specification for retail organizations.'}
                    </p>

                    <div className="mt-5 pb-5 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                          {plan.currency} {plan.amount}
                        </span>
                        <span className="text-xs text-slate-400 font-bold ml-1">
                          / {plan.billing_interval}
                        </span>
                      </div>
                    </div>

                    {/* Quotas */}
                    <div className="mt-5 space-y-3">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Included Resource Quotas
                      </span>
                      <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                        <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-850">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Users className="w-3.5 h-3.5 text-slate-400" /> Max Users
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white">
                            {plan.limits.users ?? 'Unlimited'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-850">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" /> Max Locations
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white">
                            {plan.limits.locations ?? 'Unlimited'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-850">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Package className="w-3.5 h-3.5 text-slate-400" /> Max Products
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white">
                            {plan.limits.products ?? 'Unlimited'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <ShoppingBag className="w-3.5 h-3.5 text-slate-400" /> Monthly Orders
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white">
                            {plan.limits.monthly_orders ?? 'Unlimited'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Feature Gates */}
                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Feature Capability Matrix
                      </span>
                      <div className="space-y-2 text-xs">
                        {Object.entries(plan.features || {}).map(([featureKey, enabled]) => (
                          <div key={featureKey} className="flex items-center justify-between">
                            <span className="text-slate-600 dark:text-slate-400 capitalize">
                              {featureKey.replace(/_/g, ' ')}
                            </span>
                            {enabled ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Enabled
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal text-[11px]">Disabled</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      variant="outline"
                      className="w-full rounded-2xl flex items-center justify-center gap-2 font-bold"
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
            Updating the plan for <strong>{selectedSub?.organization_name || selectedSub?.organization_id}</strong> will transactionally update tenant limits, gated capabilities, and synchronize the organization plan tier.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Select Target Plan Tier
            </label>
            <Select
              value={targetPlanCode}
              onChange={(e) => setTargetPlanCode(e.target.value)}
              options={plans.map((p) => ({
                value: p.code,
                label: `${p.name} (${p.currency} ${p.amount}/${p.billing_interval})`,
              }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Administrative Audit Reason
            </label>
            <Input
              type="text"
              placeholder="e.g., Customer requested tier upgrade to Professional"
              value={changePlanReason}
              onChange={(e) => setChangePlanReason(e.target.value)}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" onClick={() => setChangePlanModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExecuteChangePlan} isLoading={isProcessing} disabled={isProcessing}>
              Confirm Plan Change
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
            Grant additional evaluation days for <strong>{selectedSub?.organization_name || selectedSub?.organization_id}</strong>.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Additional Trial Days
            </label>
            <Input
              type="number"
              min={1}
              max={365}
              value={extendTrialDays}
              onChange={(e) => setExtendTrialDays(parseInt(e.target.value, 10) || 1)}
            />
            {/* Quick Extension Buttons */}
            <div className="flex gap-2 mt-2">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setExtendTrialDays(d)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                    extendTrialDays === d
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  +{d} days
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Audit Rationale / Justification
            </label>
            <Input
              type="text"
              placeholder="e.g., Customer requested onboarding grace period"
              value={extendTrialReason}
              onChange={(e) => setExtendTrialReason(e.target.value)}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" onClick={() => setExtendTrialModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExecuteExtendTrial} isLoading={isProcessing} disabled={isProcessing}>
              Confirm Trial Extension
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
            Target Organization: <strong>{selectedSub?.organization_name || selectedSub?.organization_id}</strong>
          </p>

          {lifecycleAction === 'cancel' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="flex items-center gap-2.5 text-sm font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cancelImmediate}
                  onChange={(e) => setCancelImmediate(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 accent-rose-600"
                />
                Immediate Cancellation
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {cancelImmediate
                  ? 'The subscription will terminate immediately, revoking access to billable capabilities today.'
                  : 'The subscription will remain active until the end of the current billing cycle.'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Audit Reason
            </label>
            <Input
              type="text"
              placeholder="e.g., Operator initiated lifecycle transition"
              value={lifecycleReason}
              onChange={(e) => setLifecycleReason(e.target.value)}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" onClick={() => setLifecycleModalOpen(false)} disabled={isProcessing}>
              Close
            </Button>
            <Button
              variant={lifecycleAction === 'cancel' || lifecycleAction === 'suspend' ? 'danger' : 'primary'}
              onClick={handleExecuteLifecycle}
              isLoading={isProcessing}
              disabled={isProcessing}
            >
              Confirm {lifecycleAction.toUpperCase()}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: AUDIT HISTORY */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={`Subscription Audit History: ${selectedSub?.organization_name || selectedSub?.organization_id}`}
        size="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {historyLoading ? (
            <div className="p-12 text-center">
              <Spinner size="md" />
              <p className="text-xs text-slate-400 mt-2">Loading historical audit events...</p>
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No audit records found for this subscription.
            </div>
          ) : (
            <div className="space-y-3">
              {historyRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500 font-mono">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider text-[11px]">
                      {rec.action}
                    </span>
                    <span className="text-[11px]">{new Date(rec.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-200">
                    Actor: <strong>{rec.actor_name}</strong> <span className="text-slate-400">({rec.actor_role})</span>
                  </div>
                  {rec.metadata?.reason && (
                    <div className="text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                      Reason: "{rec.metadata.reason}"
                    </div>
                  )}
                  {rec.after_state && (
                    <div className="mt-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">State Snapshot:</div>
                      <pre className="mt-1 p-2.5 rounded-xl bg-slate-950 text-slate-200 overflow-x-auto text-[10px] font-mono leading-relaxed">
                        {JSON.stringify(rec.after_state, null, 2)}
                      </pre>
                    </div>
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
        size="lg"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Plan Display Name
            </label>
            <Input
              type="text"
              value={editPlanName}
              onChange={(e) => setEditPlanName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Description
            </label>
            <Input
              type="text"
              value={editPlanDescription}
              onChange={(e) => setEditPlanDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Price ({selectedPlanForEdit?.currency || 'SLE'})
            </label>
            <Input
              type="number"
              step="0.01"
              value={editPlanAmount}
              onChange={(e) => setEditPlanAmount(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-2">
              Authoritative Quotas
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Max Users
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  value={editPlanUsersLimit}
                  onChange={(e) => setEditPlanUsersLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Max Locations
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={editPlanLocationsLimit}
                  onChange={(e) => setEditPlanLocationsLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Max Products
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 250"
                  value={editPlanProductsLimit}
                  onChange={(e) => setEditPlanProductsLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Monthly Orders
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={editPlanOrdersLimit}
                  onChange={(e) => setEditPlanOrdersLimit(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" onClick={() => setEditPlanModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExecuteEditPlan} isLoading={isProcessing} disabled={isProcessing}>
              Save Plan Configuration
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
