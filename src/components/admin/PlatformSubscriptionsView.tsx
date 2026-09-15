import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Shield,
  Zap,
  Building2,
  Users,
  MapPin,
  Package,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PauseCircle,
  RotateCcw,
  Plus,
  Edit2,
  History,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Check,
  X,
  Lock,
} from 'lucide-react';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  billing_interval: string;
  max_users: number;
  max_locations: number;
  max_products: number;
  max_monthly_orders: number;
  max_monthly_pos_transactions: number;
  max_storage_bytes: number;
  features: Record<string, boolean>;
  is_active: boolean;
  version: number;
}

interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: 'active' | 'trial' | 'suspended' | 'cancelled' | 'expired' | 'past_due';
  payment_status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionHistory {
  id: string;
  organization_id: string;
  subscription_id: string;
  previous_status: string | null;
  new_status: string;
  action: string;
  reason: string | null;
  performed_by: string;
  performed_by_role: string;
  created_at: string;
}

export const PlatformSubscriptionsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans'>('tenants');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal States
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [actionModalType, setActionModalType] = useState<'assign' | 'trial' | 'suspend' | 'cancel' | 'restore' | 'history' | null>(null);
  const [subHistory, setSubHistory] = useState<SubscriptionHistory[]>([]);

  // Action Form Inputs
  const [targetPlanCode, setTargetPlanCode] = useState('');
  const [trialDaysInput, setTrialDaysInput] = useState(14);
  const [actionReason, setActionReason] = useState('');

  // Edit/Create Plan State
  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const getAuthToken = () => {
    return localStorage.getItem('abacha_auth_token') || '';
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/platform/plans?includeInactive=true', {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setPlans(data.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch plans:', err);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/platform/subscriptions', {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setSubscriptions(data.data);
      } else {
        setError(data.error?.message || 'Failed to load platform subscriptions');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    fetchSubscriptions();
  }, []);

  const handleFetchHistory = async (orgId: string) => {
    try {
      const res = await fetch(`/api/platform/subscriptions/${orgId}/history`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setSubHistory(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const handleExecuteSubAction = async () => {
    if (!selectedSub || !actionModalType) return;
    setError(null);
    setSuccessMsg(null);

    const orgId = selectedSub.organization_id;
    let endpoint = `/api/platform/subscriptions/${orgId}/${actionModalType}`;
    let body: any = { reason: actionReason };

    if (actionModalType === 'assign') {
      body.planCode = targetPlanCode;
    } else if (actionModalType === 'trial') {
      body.trialDays = trialDaysInput;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Successfully executed ${actionModalType} operation for tenant.`);
        setActionModalType(null);
        setSelectedSub(null);
        setActionReason('');
        fetchSubscriptions();
      } else {
        setError(data.error?.message || `Failed to execute ${actionModalType}`);
      }
    } catch (err: any) {
      setError(err.message || 'Error executing request');
    }
  };

  const handleSavePlan = async () => {
    if (!editingPlan || !editingPlan.code || !editingPlan.name) return;
    setError(null);
    setSuccessMsg(null);

    const isEdit = Boolean(editingPlan.id);
    const endpoint = isEdit ? `/api/platform/plans/${editingPlan.id}` : '/api/platform/plans';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(editingPlan),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Plan '${editingPlan.name}' successfully ${isEdit ? 'updated' : 'created'}.`);
        setShowPlanModal(false);
        setEditingPlan(null);
        fetchPlans();
      } else {
        setError(data.error?.message || 'Failed to save plan');
      }
    } catch (err: any) {
      setError(err.message || 'Error saving plan');
    }
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.organization_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.plan_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Active
          </span>
        );
      case 'trial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Clock className="w-3.5 h-3.5" /> Trial
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <PauseCircle className="w-3.5 h-3.5" /> Suspended
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm mb-1">
            <Shield className="w-4 h-4" /> Super Admin Platform Capability
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Plans & Subscription Governance</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage multi-tenant subscription tiers, quotas, feature flags, and transactional operations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchPlans();
              fetchSubscriptions();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {activeTab === 'plans' && (
            <button
              onClick={() => {
                setEditingPlan({
                  code: '',
                  name: '',
                  description: '',
                  price_monthly: 0,
                  price_yearly: 0,
                  billing_interval: 'monthly',
                  max_users: 5,
                  max_locations: 1,
                  max_products: 500,
                  max_monthly_orders: 1000,
                  max_monthly_pos_transactions: 1000,
                  features: {
                    multi_location: false,
                    advanced_reports: false,
                    pos_offline: false,
                    custom_domain: false,
                  },
                  is_active: true,
                });
                setShowPlanModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Create New Plan
            </button>
          )}
        </div>
      </div>

      {/* Alert Banners */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-8">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`pb-4 font-semibold text-sm flex items-center gap-2 border-b-2 transition ${
            activeTab === 'tenants'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" /> Tenant Subscriptions ({subscriptions.length})
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-4 font-semibold text-sm flex items-center gap-2 border-b-2 transition ${
            activeTab === 'plans'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" /> Plan Catalog ({plans.length})
        </button>
      </div>

      {/* TAB 1: TENANT SUBSCRIPTIONS */}
      {activeTab === 'tenants' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Tenant ID or Plan Code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase border-b border-slate-200">
                  <th className="p-4">Organization ID</th>
                  <th className="p-4">Plan</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Trial / Period End</th>
                  <th className="p-4">Updated</th>
                  <th className="p-4 text-right">Super Admin Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
                {filteredSubscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/50">
                    <td className="p-4 font-mono text-xs font-bold text-indigo-900">{sub.organization_id}</td>
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">{sub.plan_name || sub.plan_code}</span>
                      <span className="block text-xs text-slate-400 font-mono">{sub.plan_code}</span>
                    </td>
                    <td className="p-4">{getStatusBadge(sub.status)}</td>
                    <td className="p-4 text-xs text-slate-600">
                      {sub.status === 'trial' && sub.trial_ends_at ? (
                        <span>
                          Trial ends:{' '}
                          <span className="font-semibold">{new Date(sub.trial_ends_at).toLocaleDateString()}</span>
                        </span>
                      ) : sub.current_period_end ? (
                        <span>
                          Renews:{' '}
                          <span className="font-semibold">
                            {new Date(sub.current_period_end).toLocaleDateString()}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-500">{new Date(sub.updated_at).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setSelectedSub(sub);
                            setTargetPlanCode(sub.plan_code);
                            setActionModalType('assign');
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-indigo-600 transition"
                          title="Assign Plan"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSub(sub);
                            setActionModalType('trial');
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-blue-600 transition"
                          title="Extend Trial"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                        {sub.status !== 'suspended' && (
                          <button
                            onClick={() => {
                              setSelectedSub(sub);
                              setActionModalType('suspend');
                            }}
                            className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 transition"
                            title="Suspend Subscription"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </button>
                        )}
                        {sub.status === 'suspended' && (
                          <button
                            onClick={() => {
                              setSelectedSub(sub);
                              setActionModalType('suspend'); // or reactivate endpoint
                              handleExecuteSubAction();
                            }}
                            className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition"
                            title="Reactivate Subscription"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {sub.status !== 'cancelled' && (
                          <button
                            onClick={() => {
                              setSelectedSub(sub);
                              setActionModalType('cancel');
                            }}
                            className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition"
                            title="Cancel Subscription"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {sub.status === 'cancelled' && (
                          <button
                            onClick={() => {
                              setSelectedSub(sub);
                              setActionModalType('restore');
                            }}
                            className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition"
                            title="Restore Subscription"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedSub(sub);
                            setActionModalType('history');
                            handleFetchHistory(sub.organization_id);
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition"
                          title="Subscription History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PLANS CATALOG */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl border p-6 shadow-sm flex flex-col justify-between space-y-6 ${
                plan.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-indigo-600 px-2.5 py-1 bg-indigo-50 rounded-md">
                    {plan.code}
                  </span>
                  <span className="text-xs text-slate-400">v{plan.version}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="text-slate-500 text-sm mt-1">{plan.description}</p>

                <div className="my-4 pt-4 border-t border-slate-100 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">
                    ${((plan.price_monthly || 0) / 100).toFixed(2)}
                  </span>
                  <span className="text-slate-500 text-sm">/ mo</span>
                </div>

                {/* Quotas */}
                <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max Users:</span>
                    <span className="font-semibold">{plan.max_users}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max Locations:</span>
                    <span className="font-semibold">{plan.max_locations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max Products:</span>
                    <span className="font-semibold">{plan.max_products}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max Orders / mo:</span>
                    <span className="font-semibold">{plan.max_monthly_orders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max POS Tx / mo:</span>
                    <span className="font-semibold">{plan.max_monthly_pos_transactions}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {plan.is_active ? 'Active Plan' : 'Inactive Plan'}
                </span>
                <button
                  onClick={() => {
                    setEditingPlan(plan);
                    setShowPlanModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Parameters
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: SUB OPERATION (ASSIGN / TRIAL / SUSPEND / CANCEL / RESTORE) */}
      {actionModalType && actionModalType !== 'history' && selectedSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-slate-900 capitalize">Super Admin: {actionModalType} Subscription</h3>
              <button onClick={() => setActionModalType(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-slate-600">
              Organization ID:{' '}
              <span className="font-mono font-bold text-indigo-900">{selectedSub.organization_id}</span>
            </div>

            {actionModalType === 'assign' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Target Plan</label>
                <select
                  value={targetPlanCode}
                  onChange={(e) => setTargetPlanCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {actionModalType === 'trial' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Extend Trial Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  value={trialDaysInput}
                  onChange={(e) => setTrialDaysInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Operation Reason / Justification</label>
              <textarea
                rows={3}
                placeholder="Enter justification for audit log..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setActionModalType(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSubAction}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm capitalize"
              >
                Confirm {actionModalType}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUBSCRIPTION HISTORY */}
      {actionModalType === 'history' && selectedSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Subscription History Logs</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedSub.organization_id}</p>
              </div>
              <button onClick={() => setActionModalType(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {subHistory.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">No historical records found for this tenant.</p>
              ) : (
                subHistory.map((h) => (
                  <div key={h.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                    <div className="flex justify-between items-center font-semibold text-slate-800">
                      <span className="font-mono text-indigo-700">{h.action}</span>
                      <span className="text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-slate-600">
                      Status: <span className="font-semibold">{h.previous_status || 'none'}</span> →{' '}
                      <span className="font-semibold text-emerald-700">{h.new_status}</span>
                    </div>
                    {h.reason && <div className="text-slate-500 italic">"{h.reason}"</div>}
                    <div className="text-slate-400 text-[10px]">
                      By: {h.performed_by} ({h.performed_by_role})
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT PLAN */}
      {showPlanModal && editingPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-slate-900">{editingPlan.id ? 'Edit Plan Parameters' : 'Create New Plan'}</h3>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Plan Code</label>
                <input
                  type="text"
                  disabled={Boolean(editingPlan.id)}
                  value={editingPlan.code || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Plan Name</label>
                <input
                  type="text"
                  value={editingPlan.name || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <input
                  type="text"
                  value={editingPlan.description || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Monthly Price (Cents)</label>
                <input
                  type="number"
                  value={editingPlan.price_monthly || 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, price_monthly: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Yearly Price (Cents)</label>
                <input
                  type="number"
                  value={editingPlan.price_yearly || 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, price_yearly: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Max Users</label>
                <input
                  type="number"
                  value={editingPlan.max_users || 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_users: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Max Locations</label>
                <input
                  type="number"
                  value={editingPlan.max_locations || 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_locations: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Max Products</label>
                <input
                  type="number"
                  value={editingPlan.max_products || 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_products: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Max Monthly Orders</label>
                <input
                  type="number"
                  value={editingPlan.max_monthly_orders || 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_monthly_orders: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowPlanModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlan}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm"
              >
                Save Plan Definition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
