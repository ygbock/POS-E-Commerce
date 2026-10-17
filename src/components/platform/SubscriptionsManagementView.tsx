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
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Calendar,
  Check,
  AlertCircle,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  Receipt,
  Download,
  Info,
  Printer,
  Copy,
  MoreVertical,
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

  // Filters & Sorting for Subscriptions
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'active' | 'trialing' | 'high_quota' | 'paused' | 'cancelling' | 'cancelled'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'plan' | 'status' | 'period_end' | 'quota'>('period_end');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Mobile card expanded states
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  // Dropdown menu state for administrative actions
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Filters & Controls for Billing Invoices
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>('');
  const [invoiceTenantFilter, setInvoiceTenantFilter] = useState<string>('all');
  const [invoiceSortBy, setInvoiceSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'due_date'>('date_desc');
  const [openInvoiceActionId, setOpenInvoiceActionId] = useState<string | null>(null);

  // Invoice Modals State
  const [createInvoiceModalOpen, setCreateInvoiceModalOpen] = useState<boolean>(false);
  const [createInvoiceDueDays, setCreateInvoiceDueDays] = useState<number>(7);
  const [createInvoiceReason, setCreateInvoiceReason] = useState<string>('Monthly SaaS Subscription Checkout');
  const [selectedInvoiceForDetails, setSelectedInvoiceForDetails] = useState<BillingInvoice | null>(null);
  const [selectedInvoiceForStatus, setSelectedInvoiceForStatus] = useState<{
    invoice: BillingInvoice;
    targetStatus: 'paid' | 'void' | 'past_due' | 'uncollectible';
  } | null>(null);
  const [statusChangeReason, setStatusChangeReason] = useState<string>('');
  const [statusChangeProcessing, setStatusChangeProcessing] = useState<boolean>(false);

  // Action Modals State
  const [selectedSub, setSelectedSub] = useState<TenantSubscription | null>(null);
  const [dossierSub, setDossierSub] = useState<TenantSubscription | null>(null);
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

  // Click-outside and Escape key listener for action dropdowns
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenActionMenuId(null);
      setOpenInvoiceActionId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenActionMenuId(null);
        setOpenInvoiceActionId(null);
        setSelectedInvoiceForDetails(null);
        setSelectedInvoiceForStatus(null);
        setCreateInvoiceModalOpen(false);
      }
    };
    if (openActionMenuId || openInvoiceActionId) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [openActionMenuId, openInvoiceActionId]);

  const handleCreateInvoice = async (tenantIdOverride?: string, dueDaysOverride?: number, reasonOverride?: string) => {
    const targetOrgId = tenantIdOverride || invoiceOrganizationId;
    if (!targetOrgId) {
      setError('Select a tenant before creating an invoice.');
      return;
    }
    setInvoiceCreating(true);
    setError(null);
    try {
      const invoice = await subscriptionApi.createInvoice(targetOrgId, {
        dueDays: dueDaysOverride ?? createInvoiceDueDays,
        reason: (reasonOverride ?? createInvoiceReason).trim() || 'Created from platform billing workspace',
      });
      setActionSuccess(`Invoice ${invoice.invoice_number} created successfully.`);
      setCreateInvoiceModalOpen(false);
      await loadInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice.');
    } finally {
      setInvoiceCreating(false);
    }
  };

  const handleTransitionInvoiceStatus = async () => {
    if (!selectedInvoiceForStatus) return;
    setStatusChangeProcessing(true);
    setError(null);
    try {
      const updated = await subscriptionApi.updateInvoiceStatus(
        selectedInvoiceForStatus.invoice.id,
        selectedInvoiceForStatus.targetStatus,
        statusChangeReason.trim() || undefined
      );
      setActionSuccess(`Invoice ${updated.invoice_number} marked as ${updated.status}.`);
      setSelectedInvoiceForStatus(null);
      setStatusChangeReason('');
      await loadInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to update invoice status.');
    } finally {
      setStatusChangeProcessing(false);
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

  // Count active subscriptions per plan
  const planSubscriberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subscriptions.forEach((sub) => {
      const code = sub.plan?.code || 'starter';
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [subscriptions]);

  // Compute maximum quota utilization percentage for a subscription
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

  // Count subscriptions in each filter category for the segmented bar
  const subCounts = useMemo(() => {
    return {
      all: subscriptions.length,
      active: subscriptions.filter((s) => s.status === 'active').length,
      trialing: subscriptions.filter((s) => s.status === 'trialing').length,
      high_quota: subscriptions.filter((s) => getMaxQuotaRatio(s) >= 0.8).length,
      paused: subscriptions.filter((s) => s.status === 'paused').length,
      cancelling: subscriptions.filter((s) => s.cancel_at_period_end).length,
      cancelled: subscriptions.filter((s) => ['cancelled', 'expired'].includes(s.status)).length,
    };
  }, [subscriptions]);

  // Client-side quick filtering & sorting
  const processedSubscriptions = useMemo(() => {
    let list = [...subscriptions];

    if (quickFilter === 'active') {
      list = list.filter((sub) => sub.status === 'active');
    } else if (quickFilter === 'trialing') {
      list = list.filter((sub) => sub.status === 'trialing');
    } else if (quickFilter === 'high_quota') {
      list = list.filter((sub) => getMaxQuotaRatio(sub) >= 0.8);
    } else if (quickFilter === 'trial_ending') {
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      list = list.filter((sub) => {
        if (sub.status !== 'trialing' || !sub.trial_ends_at) return false;
        const end = new Date(sub.trial_ends_at).getTime();
        return end >= now && end - now <= sevenDays;
      });
    } else if (quickFilter === 'cancelling') {
      list = list.filter((sub) => sub.cancel_at_period_end);
    } else if (quickFilter === 'paused') {
      list = list.filter((sub) => sub.status === 'paused');
    } else if (quickFilter === 'cancelled') {
      list = list.filter((sub) => ['cancelled', 'expired'].includes(sub.status));
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        const nameA = (a.organization_name || a.organization_id).toLowerCase();
        const nameB = (b.organization_name || b.organization_id).toLowerCase();
        cmp = nameA.localeCompare(nameB);
      } else if (sortBy === 'plan') {
        const amtA = Number(a.plan?.amount) || 0;
        const amtB = Number(b.plan?.amount) || 0;
        cmp = amtA - amtB;
      } else if (sortBy === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortBy === 'period_end') {
        const dateA = new Date(a.current_period_end).getTime() || 0;
        const dateB = new Date(b.current_period_end).getTime() || 0;
        cmp = dateA - dateB;
      } else if (sortBy === 'quota') {
        cmp = getMaxQuotaRatio(a) - getMaxQuotaRatio(b);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [subscriptions, quickFilter, sortBy, sortDirection]);

  // Filtered & Sorted Invoices
  const processedInvoices = useMemo(() => {
    let list = [...invoices];

    if (invoiceSearchQuery.trim()) {
      const q = invoiceSearchQuery.trim().toLowerCase();
      list = list.filter((inv) => {
        const tenant = invoiceTenants.find((t) => t.organization_id === inv.organization_id);
        const tenantName = (tenant?.organization_name || '').toLowerCase();
        const tenantCode = (tenant?.organization_code || '').toLowerCase();
        return (
          inv.invoice_number.toLowerCase().includes(q) ||
          inv.organization_id.toLowerCase().includes(q) ||
          tenantName.includes(q) ||
          tenantCode.includes(q)
        );
      });
    }

    if (invoiceTenantFilter !== 'all') {
      list = list.filter((inv) => inv.organization_id === invoiceTenantFilter);
    }

    list.sort((a, b) => {
      if (invoiceSortBy === 'date_desc') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (invoiceSortBy === 'date_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (invoiceSortBy === 'amount_desc') {
        return Number(b.total) - Number(a.total);
      } else if (invoiceSortBy === 'due_date') {
        const dateA = a.due_at ? new Date(a.due_at).getTime() : 0;
        const dateB = b.due_at ? new Date(b.due_at).getTime() : 0;
        return dateA - dateB;
      }
      return 0;
    });

    return list;
  }, [invoices, invoiceSearchQuery, invoiceTenantFilter, invoiceSortBy, invoiceTenants]);

  // Invoice Metric Aggregates
  const invoiceMetrics = useMemo(() => {
    const totalVolume = invoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
    const paidInvoices = invoices.filter((inv) => inv.status === 'paid');
    const paidVolume = paidInvoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
    const openInvoices = invoices.filter((inv) => inv.status === 'open');
    const openVolume = openInvoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
    const pastDueInvoices = invoices.filter((inv) => ['past_due', 'uncollectible'].includes(inv.status));
    const pastDueVolume = pastDueInvoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
    const currency = invoices[0]?.currency || 'SLE';

    return {
      totalVolume,
      paidVolume,
      paidCount: paidInvoices.length,
      openVolume,
      openCount: openInvoices.length,
      pastDueVolume,
      pastDueCount: pastDueInvoices.length,
      currency,
    };
  }, [invoices]);

  const toggleSort = (column: 'name' | 'plan' | 'status' | 'period_end' | 'quota') => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  const toggleCardExpansion = (subId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [subId]: !prev[subId],
    }));
  };

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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Cancelling Period-End</span>
        </span>
      );
    }
    switch (sub.status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Active</span>
          </span>
        );
      case 'trialing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span>Trial</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            <Ban className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Paused</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60">
            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Cancelled</span>
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60">
            <span>Expired</span>
          </span>
        );
      default:
        return <Badge variant="neutral">{sub.status}</Badge>;
    }
  };

  const getPlanBadge = (code?: string) => {
    switch (code) {
      case 'enterprise':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60">
            Enterprise
          </span>
        );
      case 'professional':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60">
            Professional
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            Starter
          </span>
        );
    }
  };

  const renderCompactQuotaMeter = (current: number, max: number | null | undefined, label: string) => {
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
          <span className="text-slate-500 dark:text-slate-400 truncate max-w-[75px] font-medium">{label}</span>
          <span className={`font-mono text-[11px] font-bold ${isOver ? 'text-rose-600 dark:text-rose-400' : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {current} / {isUnlimited ? '∞' : max}
          </span>
        </div>
        {!isUnlimited ? (
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full transition-all duration-300`}
              style={{ width: `${Math.min(100, ratio)}%` }}
            />
          </div>
        ) : (
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full" />
        )}
      </div>
    );
  };

  // Helper for billing progress in days
  const getBillingProgress = (start: string, end: string) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const now = Date.now();
    if (isNaN(s) || isNaN(e) || e <= s) return null;
    const totalDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((now - s) / (1000 * 60 * 60 * 24))));
    const percent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
    const daysRemaining = Math.max(0, Math.round((e - now) / (1000 * 60 * 60 * 24)));
    return { totalDays, elapsedDays, percent, daysRemaining };
  };

  // Render Administrative Actions Dropdown Menu
  const renderActionDropdown = (sub: TenantSubscription, isNearBottom: boolean, isMobile = false) => {
    const isOpen = openActionMenuId === sub.id;

    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenActionMenuId(isOpen ? null : sub.id);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer select-none ${
            isOpen
              ? 'border-indigo-500 bg-indigo-50/80 text-indigo-700 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/70 dark:text-indigo-300 ring-2 ring-indigo-500/20'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 dark:hover:border-slate-600 shadow-xs'
          } ${isMobile ? 'min-h-[44px] justify-center px-4' : 'h-8'}`}
          aria-haspopup="true"
          aria-expanded={isOpen}
          title="Administrative Actions Menu"
        >
          <SlidersHorizontal className={`w-3.5 h-3.5 ${isOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
          <span>Actions</span>
          <ChevronDown
            className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </button>

        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute right-0 ${
              isNearBottom ? 'bottom-full mb-2' : 'top-full mt-2'
            } w-64 z-50 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl shadow-slate-950/15 dark:shadow-slate-950/60 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100 dark:divide-slate-800/70`}
          >
            {/* Header info strip inside dropdown */}
            <div className="px-3 py-2 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Administrative Actions
              </p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                {sub.organization_name || sub.organization_code || sub.organization_id}
              </p>
            </div>

            {/* Core Plan & Evaluation Actions */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpenActionMenuId(null);
                  handleOpenChangePlan(sub);
                }}
                className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors group cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold text-xs">Change Plan Tier</div>
                  <div className="text-[10px] text-slate-400 font-normal">Switch between Starter, Pro, Enterprise</div>
                </div>
              </button>

              {['trialing', 'active'].includes(sub.status) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionMenuId(null);
                    handleOpenExtendTrial(sub);
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50/80 dark:hover:bg-amber-950/50 hover:text-amber-700 dark:hover:text-amber-300 transition-colors group cursor-pointer"
                >
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-xs">Extend Trial Evaluation</div>
                    <div className="text-[10px] text-slate-400 font-normal">Grant additional evaluation days</div>
                  </div>
                </button>
              )}
            </div>

            {/* Dossier & History Inspection */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpenActionMenuId(null);
                  setDossierSub(sub);
                }}
                className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
              >
                <Eye className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold text-xs">Inspect Subscription Dossier</div>
                  <div className="text-[10px] text-slate-400 font-normal">Detailed limits, usage & tenant data</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpenActionMenuId(null);
                  handleOpenHistory(sub);
                }}
                className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
              >
                <History className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold text-xs">View Audit History</div>
                  <div className="text-[10px] text-slate-400 font-normal">Immutable platform transaction log</div>
                </div>
              </button>
            </div>

            {/* Lifecycle Operations (Suspend / Reactivate / Cancel / Restore) */}
            <div className="py-1">
              {['trialing', 'active'].includes(sub.status) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionMenuId(null);
                    handleOpenLifecycle(sub, 'suspend');
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors group cursor-pointer"
                >
                  <Ban className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-xs">Suspend Subscription</div>
                    <div className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-normal">Put tenant access on hold</div>
                  </div>
                </button>
              )}

              {sub.status === 'paused' && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionMenuId(null);
                    handleOpenLifecycle(sub, 'reactivate');
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors group cursor-pointer"
                >
                  <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-xs">Reactivate Subscription</div>
                    <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-normal">Restore active tenant status</div>
                  </div>
                </button>
              )}

              {['active', 'trialing', 'paused'].includes(sub.status) && !sub.cancel_at_period_end && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionMenuId(null);
                    handleOpenLifecycle(sub, 'cancel');
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors group cursor-pointer"
                >
                  <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-xs">Cancel Subscription</div>
                    <div className="text-[10px] text-rose-600/70 dark:text-rose-400/70 font-normal">Cancel immediately or at period end</div>
                  </div>
                </button>
              )}

              {['cancelled', 'expired'].includes(sub.status) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionMenuId(null);
                    handleOpenLifecycle(sub, 'restore');
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors group cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-xs">Restore Subscription</div>
                    <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-normal">Reopen churned subscription</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Invoice Actions Dropdown Menu
  const renderInvoiceActionDropdown = (inv: BillingInvoice, isNearBottom: boolean) => {
    const isOpen = openInvoiceActionId === inv.id;
    const canMarkPaid = ['open', 'past_due'].includes(inv.status);
    const canMarkPastDue = inv.status === 'open';
    const canVoid = !['paid', 'void'].includes(inv.status);

    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenInvoiceActionId(isOpen ? null : inv.id);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
            isOpen
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
          }`}
          title="Invoice actions"
        >
          <span>Actions</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute right-0 ${
              isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            } w-52 z-50 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl p-1 text-xs divide-y divide-slate-100 dark:divide-slate-800 text-left`}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpenInvoiceActionId(null);
                  setSelectedInvoiceForDetails(inv);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                <span>View & Print Slip</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenInvoiceActionId(null);
                  navigator.clipboard?.writeText(inv.invoice_number);
                  setActionSuccess(`Copied invoice ${inv.invoice_number} to clipboard.`);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Invoice #</span>
              </button>
            </div>

            {(canMarkPaid || canMarkPastDue || canVoid) && (
              <div className="py-1">
                {canMarkPaid && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenInvoiceActionId(null);
                      setSelectedInvoiceForStatus({ invoice: inv, targetStatus: 'paid' });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mark as Paid</span>
                  </button>
                )}

                {canMarkPastDue && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenInvoiceActionId(null);
                      setSelectedInvoiceForStatus({ invoice: inv, targetStatus: 'past_due' });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Mark as Past Due</span>
                  </button>
                )}

                {canVoid && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenInvoiceActionId(null);
                      setSelectedInvoiceForStatus({ invoice: inv, targetStatus: 'void' });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Void Invoice</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-7 pb-12" aria-labelledby="saas-subscription-billing-title">
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
            className="text-rose-600 hover:text-rose-800 dark:hover:text-rose-200 p-1 rounded-lg cursor-pointer"
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
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 p-1 rounded-lg cursor-pointer"
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
              {overview ? (overview.currency === 'MULTI'
                ? overview.revenueByCurrency.map((item) => `${item.currency} ${item.mrr.toLocaleString()}`).join(' · ')
                : `${overview.currency} ${overview.mrr.toLocaleString()}`) : '—'}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>In-transaction normalized</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            Paid active subscriptions only · grouped by currency
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
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold">
            {invoices.length}
          </span>
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
          {/* Unified Filter & Search Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3">
            {/* Top Row: Search & Plan & Sorting */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tenant name, slug, or organization code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Plan & Sort Selectors */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <div className="w-full sm:w-40">
                  <Select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Plan Tiers' },
                      { value: 'starter', label: 'Starter Tier' },
                      { value: 'professional', label: 'Professional Tier' },
                      { value: 'enterprise', label: 'Enterprise Tier' },
                    ]}
                  />
                </div>

                <div className="w-full sm:w-44">
                  <Select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    options={[
                      { value: 'period_end', label: 'Sort: Renewal Date' },
                      { value: 'name', label: 'Sort: Tenant Name' },
                      { value: 'plan', label: 'Sort: Plan Rate' },
                      { value: 'quota', label: 'Sort: Quota Usage' },
                      { value: 'status', label: 'Sort: Status' },
                    ]}
                  />
                </div>

                {(planFilter !== 'all' || searchQuery || quickFilter !== 'all' || statusFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStatusFilter('all');
                      setPlanFilter('all');
                      setSearchQuery('');
                      setQuickFilter('all');
                    }}
                    title="Reset all filters"
                    className="shrink-0 h-9 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Bottom Row: Tactile Segmented Filter Bar (Replaces awkward quick filter dropdown) */}
            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
                <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 inline-flex items-center gap-1 min-w-max">
                  {[
                    { id: 'all', label: 'All', count: subCounts.all },
                    { id: 'active', label: 'Active', count: subCounts.active },
                    { id: 'trialing', label: 'Trialing', count: subCounts.trialing },
                    { id: 'high_quota', label: 'High Quota Alert', count: subCounts.high_quota, alert: true },
                    { id: 'paused', label: 'Suspended', count: subCounts.paused },
                    { id: 'cancelling', label: 'Cancelling', count: subCounts.cancelling },
                    { id: 'cancelled', label: 'Cancelled', count: subCounts.cancelled },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setQuickFilter(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        quickFilter === tab.id
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tab.alert && tab.count > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      <span>{tab.label}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                        quickFilter === tab.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                <span>
                  Showing <strong className="text-slate-900 dark:text-white font-bold">{processedSubscriptions.length}</strong> of {subscriptions.length}
                </span>
                {(planFilter !== 'all' || searchQuery || quickFilter !== 'all' || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setPlanFilter('all');
                      setSearchQuery('');
                      setQuickFilter('all');
                    }}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-1"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Subscriptions Content Area */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-md shadow-slate-950/[0.03]">
            {isLoading ? (
              <div className="p-16 flex flex-col items-center justify-center">
                <Spinner size="lg" />
                <p className="mt-3 text-xs font-semibold text-slate-500">Loading authoritative subscriptions...</p>
              </div>
            ) : processedSubscriptions.length === 0 ? (
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
                      setQuickFilter('all');
                    }}
                  >
                    Clear Filter Criteria
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* 1. DESKTOP & TABLET TABLE VIEW (hidden on mobile < 768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left border-collapse text-sm">
                    <thead>
                      <tr className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                        <th
                          className="px-6 py-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[240px]"
                          onClick={() => toggleSort('name')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Tenant Organization</span>
                            {sortBy === 'name' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />)}
                          </div>
                        </th>
                        <th
                          className="px-6 py-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[160px]"
                          onClick={() => toggleSort('plan')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Plan & Rate</span>
                            {sortBy === 'plan' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />)}
                          </div>
                        </th>
                        <th
                          className="px-6 py-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[140px]"
                          onClick={() => toggleSort('status')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Status</span>
                            {sortBy === 'status' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />)}
                          </div>
                        </th>
                        <th
                          className="px-6 py-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[170px]"
                          onClick={() => toggleSort('period_end')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Billing Cycle</span>
                            {sortBy === 'period_end' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />)}
                          </div>
                        </th>
                        <th
                          className="px-6 py-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[240px]"
                          onClick={() => toggleSort('quota')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Quotas & Utilization</span>
                            {sortBy === 'quota' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />)}
                          </div>
                        </th>
                        <th className="px-6 py-4 text-right min-w-[150px]">Administrative Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {processedSubscriptions.map((sub, index) => {
                        const limits = sub.plan?.limits || {};
                        const usage = sub.usage || { users: 0, locations: 0, products: 0, monthly_orders: 0 };
                        const cycle = getBillingProgress(sub.current_period_start, sub.current_period_end);
                        const maxRatio = getMaxQuotaRatio(sub);
                        const isHighUsage = maxRatio >= 0.8;

                        return (
                          <tr
                            key={sub.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                          >
                            {/* Tenant Organization */}
                            <td className="px-6 py-4 align-top">
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs border border-indigo-200/50 dark:border-indigo-800/50">
                                  {(sub.organization_name || sub.organization_code || 'T').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 dark:text-white truncate max-w-[220px]">
                                    {sub.organization_name || sub.organization_id}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400 font-mono">
                                    <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                      {sub.organization_code || 'ORG'}
                                    </span>
                                    <span className="truncate max-w-[120px]">{sub.organization_id}</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Plan & Pricing */}
                            <td className="px-6 py-4 align-top">
                              <div>{getPlanBadge(sub.plan?.code)}</div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1.5">
                                {sub.plan?.currency} {Number(sub.plan?.amount).toLocaleString()}
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
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Renewal:</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {new Date(sub.current_period_end).toLocaleDateString()}
                                  </span>
                                </div>
                                {cycle && (
                                  <div className="space-y-1 pt-0.5">
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${cycle.daysRemaining <= 3 ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-500'} rounded-full transition-all`}
                                        style={{ width: `${cycle.percent}%` }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                      <span>Day {cycle.elapsedDays} of {cycle.totalDays}</span>
                                      <span>{cycle.daysRemaining}d left</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Quota meters (High-density 2x2 grid) */}
                            <td className="px-6 py-4 align-top min-w-[240px]">
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                  {renderCompactQuotaMeter(usage.users, limits.users, 'Users')}
                                  {renderCompactQuotaMeter(usage.locations, limits.locations, 'Locations')}
                                  {renderCompactQuotaMeter(usage.products, limits.products, 'Products')}
                                  {renderCompactQuotaMeter(usage.monthly_orders, limits.monthly_orders, 'Orders')}
                                </div>
                                {isHighUsage && (
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/60 w-fit">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>High Quota ({Math.round(maxRatio * 100)}%)</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Actions Dropdown Menu */}
                            <td className="px-6 py-4 align-top text-right min-w-[150px] relative">
                              {renderActionDropdown(sub, index >= processedSubscriptions.length - 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-6 py-2 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between xl:hidden">
                    <span>Tip: Scroll horizontally to review quotas and actions</span>
                    <span>← Swipe horizontally →</span>
                  </div>
                </div>

                {/* 2. MOBILE CARD VIEW (shown on mobile, hidden on md and above) */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {processedSubscriptions.map((sub) => {
                    const limits = sub.plan?.limits || {};
                    const usage = sub.usage || { users: 0, locations: 0, products: 0, monthly_orders: 0 };
                    const isExpanded = !!expandedCards[sub.id];
                    const cycle = getBillingProgress(sub.current_period_start, sub.current_period_end);

                    return (
                      <div key={sub.id} className="p-5 space-y-4">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs border border-indigo-200/50 dark:border-indigo-800/50">
                              {(sub.organization_name || sub.organization_code || 'T').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                                {sub.organization_name || sub.organization_id}
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono">
                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                  {sub.organization_code || 'ORG'}
                                </span>
                                <span>{sub.organization_id}</span>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0">{getStatusBadge(sub)}</div>
                        </div>

                        {/* Plan & Pricing Strip */}
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Plan</div>
                            <div className="mt-0.5">{getPlanBadge(sub.plan?.code)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rate</div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                              {sub.plan?.currency} {Number(sub.plan?.amount).toLocaleString()} / {sub.plan?.billing_interval}
                            </div>
                          </div>
                        </div>

                        {/* Billing Period Dates & Progress */}
                        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Start</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {new Date(sub.current_period_start).toLocaleDateString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Renewal Date</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {new Date(sub.current_period_end).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {cycle && (
                            <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full"
                                  style={{ width: `${cycle.percent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Day {cycle.elapsedDays} of {cycle.totalDays}</span>
                                <span>{cycle.daysRemaining} days remaining</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Collapsible Quotas & Usage Accordion */}
                        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleCardExpansion(sub.id)}
                            className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>Quota & Resource Utilization</span>
                              {getMaxQuotaRatio(sub) >= 0.8 && (
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                              )}
                            </span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </button>

                          {isExpanded && (
                            <div className="p-3.5 pt-0 border-t border-slate-100 dark:border-slate-800 space-y-2.5 mt-2">
                              <div className="grid grid-cols-2 gap-3">
                                {renderCompactQuotaMeter(usage.users, limits.users, 'Users')}
                                {renderCompactQuotaMeter(usage.locations, limits.locations, 'Locations')}
                                {renderCompactQuotaMeter(usage.products, limits.products, 'Products')}
                                {renderCompactQuotaMeter(usage.monthly_orders, limits.monthly_orders, 'Monthly Orders')}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Mobile Actions Toolbar */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenChangePlan(sub)}
                            className="flex-1 text-xs font-bold min-h-[44px]"
                          >
                            <ArrowUpRight className="w-4 h-4 mr-1 text-indigo-600" />
                            Change Plan
                          </Button>
                          {renderActionDropdown(sub, false, true)}
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
        <section className="space-y-5" aria-labelledby="billing-invoices-title">
          {/* 1. FINANCIAL KPI SUMMARY CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Invoiced Volume */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Invoiced
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
                  {invoiceMetrics.currency} {invoiceMetrics.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] font-bold text-slate-500">
                  {invoices.length} invoices generated
                </div>
              </div>
            </div>

            {/* Paid / Collected */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Collected / Paid
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {invoiceMetrics.currency} {invoiceMetrics.paidVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  {invoiceMetrics.paidCount} settled invoices
                </div>
              </div>
            </div>

            {/* Open Receivables */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Open Receivables
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                  {invoiceMetrics.currency} {invoiceMetrics.openVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  {invoiceMetrics.openCount} awaiting payment
                </div>
              </div>
            </div>

            {/* Past Due / At Risk */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between sm:col-span-2 md:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Past Due / Void
                </span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                  {invoiceMetrics.currency} {invoiceMetrics.pastDueVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  {invoiceMetrics.pastDueCount} overdue / risk
                </div>
              </div>
            </div>
          </div>

          {/* 2. UNIFIED CONTROLS & SEARCH BAR */}
          <div className="p-4 sm:p-5 rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 id="billing-invoices-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Authoritative Billing Invoices
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Manage tenant subscription charges, receivables, printable invoice slips, and payment settlements
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (invoiceTenants.length > 0 && !invoiceOrganizationId) {
                      setInvoiceOrganizationId(invoiceTenants[0].organization_id);
                    }
                    setCreateInvoiceModalOpen(true);
                  }}
                  className="rounded-xl font-bold text-xs shadow-xs"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  <span>Create Invoice</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={loadInvoices}
                  disabled={invoicesLoading}
                  title="Refresh invoices"
                  className="px-3 rounded-xl h-9"
                >
                  <RefreshCw className={`h-4 w-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Filter Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice #, tenant, org ID..."
                  value={invoiceSearchQuery}
                  onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                {invoiceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setInvoiceSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div>
                <Select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'open', label: 'Open / Pending' },
                    { value: 'paid', label: 'Paid / Settled' },
                    { value: 'past_due', label: 'Past Due' },
                    { value: 'void', label: 'Voided' },
                    { value: 'uncollectible', label: 'Uncollectible' },
                  ]}
                />
              </div>

              {/* Tenant Filter */}
              <div>
                <Select
                  value={invoiceTenantFilter}
                  onChange={(e) => setInvoiceTenantFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Tenants' },
                    ...invoiceTenants.map((sub) => ({
                      value: sub.organization_id,
                      label: `${sub.organization_name || sub.organization_id} (${sub.plan?.name || 'Starter'})`,
                    })),
                  ]}
                />
              </div>

              {/* Sort By Filter */}
              <div>
                <Select
                  value={invoiceSortBy}
                  onChange={(e) => setInvoiceSortBy(e.target.value as any)}
                  options={[
                    { value: 'date_desc', label: 'Sort: Newest First' },
                    { value: 'date_asc', label: 'Sort: Oldest First' },
                    { value: 'amount_desc', label: 'Sort: Highest Amount' },
                    { value: 'due_date', label: 'Sort: Due Date' },
                  ]}
                />
              </div>
            </div>

            {/* Result summary and clear button */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong className="text-slate-900 dark:text-white font-bold">{processedInvoices.length}</strong> of {invoices.length} invoices
                </span>
                {(invoiceStatusFilter !== 'all' || invoiceTenantFilter !== 'all' || invoiceSearchQuery.trim()) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                    Filtered
                  </span>
                )}
              </div>
              {(invoiceStatusFilter !== 'all' || invoiceTenantFilter !== 'all' || invoiceSearchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceStatusFilter('all');
                    setInvoiceTenantFilter('all');
                    setInvoiceSearchQuery('');
                  }}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Clear invoice filters
                </button>
              )}
            </div>
          </div>

          {/* 3. INVOICES DATA CONTAINER */}
          <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {invoicesLoading ? (
              <div className="flex flex-col items-center justify-center p-16">
                <Spinner size="lg" />
                <p className="mt-3 text-xs text-slate-500 font-semibold">Loading authoritative billing invoices…</p>
              </div>
            ) : processedInvoices.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">No invoices found</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Try adjusting your search criteria, clearing status filters, or generate a new invoice for an active tenant.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  {(invoiceStatusFilter !== 'all' || invoiceTenantFilter !== 'all' || invoiceSearchQuery.trim()) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInvoiceStatusFilter('all');
                        setInvoiceTenantFilter('all');
                        setInvoiceSearchQuery('');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCreateInvoiceModalOpen(true)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create New Invoice
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop & Tablet Invoices Table (>= 768px) */}
                <div className="hidden md:block overflow-x-auto min-h-[380px] pb-24">
                  <table className="w-full min-w-[850px] text-left text-sm border-collapse">
                    <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Invoice #</th>
                        <th className="px-6 py-4">Tenant Organization</th>
                        <th className="px-6 py-4">Billing Period</th>
                        <th className="px-6 py-4">Due Date</th>
                        <th className="px-6 py-4">Authoritative Total</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right min-w-[130px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {processedInvoices.map((invoice, index) => {
                        const tenant = invoiceTenants.find((sub) => sub.organization_id === invoice.organization_id);
                        const isPaid = invoice.status === 'paid';
                        const isPastDue = invoice.status === 'past_due' || invoice.status === 'uncollectible';
                        const isVoid = invoice.status === 'void';

                        const statusStyle = isPaid
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60'
                          : isPastDue
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60'
                          : isVoid
                          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60';

                        // Due date calculation
                        let dueLabel = '—';
                        if (invoice.due_at) {
                          const dueTime = new Date(invoice.due_at).getTime();
                          const diffDays = Math.round((dueTime - Date.now()) / (1000 * 60 * 60 * 24));
                          if (isPaid) {
                            dueLabel = invoice.paid_at ? `Paid ${new Date(invoice.paid_at).toLocaleDateString()}` : 'Settled';
                          } else if (diffDays < 0) {
                            dueLabel = `Overdue by ${Math.abs(diffDays)}d`;
                          } else if (diffDays === 0) {
                            dueLabel = 'Due today';
                          } else {
                            dueLabel = `Due in ${diffDays}d`;
                          }
                        }

                        return (
                          <tr
                            key={invoice.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                          >
                            {/* Invoice Number & Created */}
                            <td className="px-6 py-4 align-top">
                              <div className="font-bold font-mono text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{invoice.invoice_number}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(invoice.invoice_number);
                                    setActionSuccess(`Copied invoice ${invoice.invoice_number}`);
                                  }}
                                  title="Copy invoice number"
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                Created {new Date(invoice.created_at).toLocaleDateString()}
                              </div>
                            </td>

                            {/* Tenant Organization */}
                            <td className="px-6 py-4 align-top">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {tenant?.organization_name || invoice.organization_id}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded font-bold text-slate-600 dark:text-slate-300">
                                  {tenant?.organization_code || 'ORG'}
                                </span>
                                <span>{invoice.organization_id}</span>
                              </div>
                            </td>

                            {/* Billing Period */}
                            <td className="px-6 py-4 align-top text-xs text-slate-600 dark:text-slate-300">
                              <div>
                                {new Date(invoice.period_start).toLocaleDateString()} – {new Date(invoice.period_end).toLocaleDateString()}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {tenant?.plan?.name || 'SaaS'} Subscription
                              </div>
                            </td>

                            {/* Due Date & Countdown */}
                            <td className="px-6 py-4 align-top text-xs text-slate-600 dark:text-slate-300">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : '—'}
                              </div>
                              <div className={`text-[10px] font-bold mt-0.5 ${
                                isPaid
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isPastDue
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}>
                                {dueLabel}
                              </div>
                            </td>

                            {/* Total Amount */}
                            <td className="px-6 py-4 align-top">
                              <div className="font-bold text-slate-900 dark:text-white font-mono text-base">
                                {invoice.currency} {Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Subtotal {invoice.currency} {Number(invoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 align-top">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${statusStyle}`}>
                                {isPaid && <CheckCircle2 className="w-3 h-3" />}
                                {isPastDue && <AlertTriangle className="w-3 h-3" />}
                                <span>{invoice.status.replace(/_/g, ' ')}</span>
                              </span>
                            </td>

                            {/* Actions Dropdown */}
                            <td className="px-6 py-4 align-top text-right min-w-[130px] relative">
                              {renderInvoiceActionDropdown(invoice, index >= processedInvoices.length - 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Invoices Card List (< 768px) */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {processedInvoices.map((invoice) => {
                    const tenant = invoiceTenants.find((sub) => sub.organization_id === invoice.organization_id);
                    const isPaid = invoice.status === 'paid';
                    const isPastDue = invoice.status === 'past_due' || invoice.status === 'uncollectible';
                    const isVoid = invoice.status === 'void';

                    const statusStyle = isPaid
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60'
                      : isPastDue
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60'
                      : isVoid
                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60';

                    return (
                      <div key={invoice.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold font-mono text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{invoice.invoice_number}</span>
                            </div>
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                              {tenant?.organization_name || invoice.organization_id}
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${statusStyle}`}>
                            {invoice.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Period & Due</span>
                            <span className="text-slate-700 dark:text-slate-300 mt-0.5 block">
                              Due: {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : '—'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Amount</span>
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 block">
                              {invoice.currency} {Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceForDetails(invoice)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Invoice Slip</span>
                          </button>
                          <div>
                            {renderInvoiceActionDropdown(invoice, false)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Authoritative billing records persisted in PostgreSQL cluster. All totals, taxes, and status transitions conform to the platform billing service.
          </p>
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
              const subscriberCount = planSubscriberCounts[plan.code] || 0;

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
                      <div className="flex items-center gap-2">
                        {isPro && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            Most Popular
                          </span>
                        )}
                        <Badge variant={plan.is_active ? 'success' : 'neutral'}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
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
                          {plan.currency} {Number(plan.amount).toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 font-bold ml-1">
                          / {plan.billing_interval}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                        {subscriberCount} tenant organization{subscriberCount === 1 ? '' : 's'} on this tier
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
                          <strong className="font-bold text-slate-900 dark:text-white font-mono">
                            {plan.limits.users ?? 'Unlimited'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-850">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" /> Max Locations
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white font-mono">
                            {plan.limits.locations ?? 'Unlimited'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-850">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Package className="w-3.5 h-3.5 text-slate-400" /> Max Products
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white font-mono">
                            {plan.limits.products ? plan.limits.products.toLocaleString() : 'Unlimited'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <ShoppingBag className="w-3.5 h-3.5 text-slate-400" /> Monthly Orders
                          </span>
                          <strong className="font-bold text-slate-900 dark:text-white font-mono">
                            {plan.limits.monthly_orders ? plan.limits.monthly_orders.toLocaleString() : 'Unlimited'}
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

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Current Plan:</span>
              <strong className="font-bold text-slate-900 dark:text-white uppercase">
                {selectedSub?.plan?.name} ({selectedSub?.plan?.currency} {selectedSub?.plan?.amount}/{selectedSub?.plan?.billing_interval})
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Target Plan:</span>
              <strong className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                {plans.find((p) => p.code === targetPlanCode)?.name} ({plans.find((p) => p.code === targetPlanCode)?.currency} {plans.find((p) => p.code === targetPlanCode)?.amount})
              </strong>
            </div>
          </div>

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
              {[7, 14, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setExtendTrialDays(d)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
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

      {/* MODAL 6: SUBSCRIPTION DOSSIER (Inspect Tenant Subscription) */}
      <Modal
        isOpen={!!dossierSub}
        onClose={() => setDossierSub(null)}
        title={`Subscription Dossier: ${dossierSub?.organization_name || dossierSub?.organization_id}`}
        size="lg"
      >
        {dossierSub && (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Header / Identity Strip */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Organization Identity</div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {dossierSub.organization_name || dossierSub.organization_id}
                </h3>
                <div className="text-xs text-slate-500 font-mono mt-0.5">
                  ID: {dossierSub.organization_id} · Code: {dossierSub.organization_code || 'ORG'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(dossierSub)}
                {getPlanBadge(dossierSub.plan?.code)}
              </div>
            </div>

            {/* Plan & Financial Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Subscription Tier</span>
                <span className="text-base font-bold text-slate-900 dark:text-white block">
                  {dossierSub.plan?.name}
                </span>
                <span className="text-slate-500 block">
                  {dossierSub.plan?.currency} {Number(dossierSub.plan?.amount).toLocaleString()} per {dossierSub.plan?.billing_interval}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Billing Period</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  {new Date(dossierSub.current_period_start).toLocaleDateString()} – {new Date(dossierSub.current_period_end).toLocaleDateString()}
                </span>
                {dossierSub.trial_ends_at && (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold block">
                    Trial expires: {new Date(dossierSub.trial_ends_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* Quota Breakdown */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                Authoritative Quota Consumption
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderCompactQuotaMeter(dossierSub.usage?.users || 0, dossierSub.plan?.limits?.users, 'Active Users')}
                {renderCompactQuotaMeter(dossierSub.usage?.locations || 0, dossierSub.plan?.limits?.locations, 'Store Locations')}
                {renderCompactQuotaMeter(dossierSub.usage?.products || 0, dossierSub.plan?.limits?.products, 'Catalog Products')}
                {renderCompactQuotaMeter(dossierSub.usage?.monthly_orders || 0, dossierSub.plan?.limits?.monthly_orders, 'Monthly Orders')}
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const target = dossierSub;
                  setDossierSub(null);
                  handleOpenChangePlan(target);
                }}
              >
                <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                Change Tier
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const target = dossierSub;
                  setDossierSub(null);
                  handleOpenHistory(target);
                }}
              >
                <History className="w-3.5 h-3.5 mr-1" />
                Audit History
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDossierSub(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* INVOICE MODAL 1: CREATE NEW INVOICE */}
      <Modal
        isOpen={createInvoiceModalOpen}
        onClose={() => setCreateInvoiceModalOpen(false)}
        title="Generate Tenant Billing Invoice"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create an authoritative invoice for a tenant based on their active SaaS plan subscription rate.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Select Tenant Subscription
            </label>
            <Select
              value={invoiceOrganizationId}
              onChange={(e) => setInvoiceOrganizationId(e.target.value)}
              options={[
                { value: '', label: 'Select a tenant…' },
                ...invoiceTenants.map((sub) => ({
                  value: sub.organization_id,
                  label: `${sub.organization_name || sub.organization_id} — ${sub.plan?.name || 'Starter'} (${sub.plan?.currency} ${Number(sub.plan?.amount).toLocaleString()}/${sub.plan?.billing_interval || 'mo'})`,
                })),
              ]}
            />
          </div>

          {/* Pricing Preview Strip */}
          {(() => {
            const selectedTenantSub = invoiceTenants.find((s) => s.organization_id === invoiceOrganizationId);
            if (!selectedTenantSub) return null;
            const plan = selectedTenantSub.plan;
            const currency = plan?.currency || 'SLE';
            const amount = Number(plan?.amount || 0);

            return (
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span>Subscription Plan:</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">{plan?.name || 'Standard'}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span>Billing Interval:</span>
                  <span className="capitalize">{plan?.billing_interval || 'monthly'}</span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-indigo-200/50 dark:border-indigo-900/50">
                  <span className="font-bold text-slate-900 dark:text-white">Authoritative Total:</span>
                  <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                    {currency} {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Payment Due Window
            </label>
            <Select
              value={String(createInvoiceDueDays)}
              onChange={(e) => setCreateInvoiceDueDays(Number(e.target.value))}
              options={[
                { value: '3', label: 'Net 3 Days' },
                { value: '7', label: 'Net 7 Days (Standard)' },
                { value: '14', label: 'Net 14 Days' },
                { value: '30', label: 'Net 30 Days' },
                { value: '60', label: 'Net 60 Days' },
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Invoice Description / Reason
            </label>
            <Input
              type="text"
              value={createInvoiceReason}
              onChange={(e) => setCreateInvoiceReason(e.target.value)}
              placeholder="e.g. Monthly SaaS Subscription Checkout"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="ghost"
              onClick={() => setCreateInvoiceModalOpen(false)}
              disabled={invoiceCreating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => handleCreateInvoice(invoiceOrganizationId, createInvoiceDueDays, createInvoiceReason)}
              disabled={!invoiceOrganizationId || invoiceCreating}
              isLoading={invoiceCreating}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Generate Authoritative Invoice
            </Button>
          </div>
        </div>
      </Modal>

      {/* INVOICE MODAL 2: INVOICE SLIP & PRINT VIEW */}
      <Modal
        isOpen={!!selectedInvoiceForDetails}
        onClose={() => setSelectedInvoiceForDetails(null)}
        title={selectedInvoiceForDetails ? `Invoice Slip ${selectedInvoiceForDetails.invoice_number}` : 'Invoice Slip'}
        size="lg"
      >
        {selectedInvoiceForDetails && (() => {
          const inv = selectedInvoiceForDetails;
          const tenant = invoiceTenants.find((sub) => sub.organization_id === inv.organization_id);
          const isPaid = inv.status === 'paid';
          const isPastDue = inv.status === 'past_due' || inv.status === 'uncollectible';

          return (
            <div className="space-y-6 text-slate-800 dark:text-slate-200">
              {/* Slip Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">SaaS Billing Invoice</span>
                  <h3 className="text-xl font-black font-mono text-slate-900 dark:text-white mt-0.5">
                    {inv.invoice_number}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Issued: {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    isPaid
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : isPastDue
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}>
                    {isPaid && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {isPastDue && <AlertTriangle className="w-3.5 h-3.5" />}
                    <span>{inv.status.replace(/_/g, ' ')}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Slip</span>
                  </button>
                </div>
              </div>

              {/* Bill To & Billing Period */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Billed To (Tenant)</span>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {tenant?.organization_name || inv.organization_id}
                  </div>
                  <div className="text-slate-500 font-mono">
                    Code: {tenant?.organization_code || 'ORG'} · Org ID: {inv.organization_id}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Billing Terms</span>
                  <div className="font-medium text-slate-700 dark:text-slate-300">
                    Period: {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                  </div>
                  <div className="font-medium text-slate-700 dark:text-slate-300">
                    Payment Due: <strong className="text-slate-900 dark:text-white">{inv.due_at ? new Date(inv.due_at).toLocaleDateString() : 'Immediate'}</strong>
                  </div>
                  {inv.paid_at && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Settled on: {new Date(inv.paid_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items Table */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-850 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Line Item / Description</th>
                      <th className="px-4 py-2.5 text-center">Qty</th>
                      <th className="px-4 py-2.5 text-right">Unit Amount</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.isArray(inv.line_items) && inv.line_items.length > 0 ? (
                      inv.line_items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {item.description || 'SaaS Subscription Tier'}
                          </td>
                          <td className="px-4 py-3 text-center">{item.quantity || 1}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.currency || inv.currency} {Number(item.unitAmount || item.amount || inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {item.currency || inv.currency} {Number(item.amount || inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {tenant?.plan?.name || 'SaaS Subscription'}
                        </td>
                        <td className="px-4 py-3 text-center">1</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {inv.currency} {Number(inv.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {inv.currency} {Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end text-xs">
                <div className="w-full sm:w-64 space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {inv.currency} {Number(inv.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Tax (0%):</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {inv.currency} {Number(inv.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white">
                    <span>Total Payable:</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">
                      {inv.currency} {Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(inv.invoice_number);
                    setActionSuccess(`Copied invoice ${inv.invoice_number}`);
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy Invoice #
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInvoiceForDetails(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* INVOICE MODAL 3: STATUS TRANSITION CONFIRMATION */}
      <Modal
        isOpen={!!selectedInvoiceForStatus}
        onClose={() => setSelectedInvoiceForStatus(null)}
        title={selectedInvoiceForStatus ? `Transition Invoice ${selectedInvoiceForStatus.invoice.invoice_number}` : 'Update Invoice Status'}
        size="md"
      >
        {selectedInvoiceForStatus && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Confirm status change for invoice <strong className="text-slate-900 dark:text-white font-mono">{selectedInvoiceForStatus.invoice.invoice_number}</strong> to <strong className="capitalize text-indigo-600 dark:text-indigo-400 font-bold">{selectedInvoiceForStatus.targetStatus.replace(/_/g, ' ')}</strong>.
            </p>

            {selectedInvoiceForStatus.targetStatus === 'paid' && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>This will record settlement of <strong>{selectedInvoiceForStatus.invoice.currency} {selectedInvoiceForStatus.invoice.total}</strong> in the platform billing ledger.</span>
              </div>
            )}

            {selectedInvoiceForStatus.targetStatus === 'void' && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>Voiding this invoice is an irreversible terminal status. The tenant will not be billed for this invoice.</span>
              </div>
            )}

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-500 mb-1">
                Reason / Audit Note (Optional)
              </label>
              <Input
                type="text"
                value={statusChangeReason}
                onChange={(e) => setStatusChangeReason(e.target.value)}
                placeholder="e.g. Bank confirmation wire reference or reconciliation note"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="ghost"
                onClick={() => setSelectedInvoiceForStatus(null)}
                disabled={statusChangeProcessing}
              >
                Cancel
              </Button>
              <Button
                variant={selectedInvoiceForStatus.targetStatus === 'void' ? 'danger' : 'primary'}
                onClick={handleTransitionInvoiceStatus}
                isLoading={statusChangeProcessing}
                disabled={statusChangeProcessing}
              >
                Confirm Status Transition
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
