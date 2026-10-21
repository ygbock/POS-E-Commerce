import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Shield,
  PauseCircle,
  PlayCircle,
  X,
  Eye,
  Pencil,
  Archive,
  ExternalLink,
  ChevronDown,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Activity,
  CheckCircle2,
  Users,
  MapPin,
  Calendar,
  Globe,
  SlidersHorizontal,
  Lock,
  Mail,
  Phone,
  ArrowRight,
  ArrowLeft,
  FileText,
  CreditCard,
  Tag,
  Info,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { Table } from '../ui/Table';
import { authClient } from '../../services/authClient';

type PlanTier = 'starter' | 'professional' | 'enterprise';
type TenantStatus = 'active' | 'suspended' | 'archived';
type TenantStatusFilter = TenantStatus | 'all';
type FormCategoryTab = 'core' | 'business' | 'address' | 'operations';

const PAGE_SIZE = 50;

interface Tenant {
  id: string;
  name: string;
  slug: string;
  code: string;
  status: TenantStatus;
  planTier: PlanTier;
  subscriptionStatus?: string | null;
  createdAt: string;
}

type TenantProfile = Record<string, string>;

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  code: string;
  status: TenantStatus;
  planTier: PlanTier;
  createdAt: string;
  isActive: boolean;
  lifecycleStatus: TenantStatus;
  updatedAt: string;
  profile: TenantProfile;
  userCount: number;
  locationCount: number;
  subscription: { status?: string; planCode?: string } | null;
  discoveryListing: {
    id: string;
    name: string;
    slug: string;
    listingStatus: string;
    verificationStatus: string;
    isDiscoverable: boolean;
  } | null;
}

interface CreateForm {
  name: string;
  slug: string;
  code: string;
  planTier: PlanTier;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  profile: TenantProfile;
}

const PROFILE_FIELDS = [
  ['legalName', 'Legal / registered name'],
  ['businessType', 'Business type'],
  ['industry', 'Industry'],
  ['description', 'Business description'],
  ['registrationNumber', 'Registration number'],
  ['taxId', 'Tax ID'],
  ['businessEmail', 'Business email'],
  ['phone', 'Business phone'],
  ['website', 'Website'],
  ['country', 'Country'],
  ['region', 'Region / state'],
  ['city', 'City'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['postalCode', 'Postal code'],
  ['primaryContactName', 'Primary contact name'],
  ['primaryContactEmail', 'Primary contact email'],
  ['primaryContactPhone', 'Primary contact phone'],
  ['currency', 'Preferred currency'],
  ['timezone', 'Timezone'],
  ['locale', 'Locale'],
  ['businessMode', 'Business mode'],
  ['onboardingOwner', 'Onboarding owner'],
  ['tenantSource', 'Tenant source'],
  ['externalReference', 'External reference'],
  ['internalNotes', 'Internal notes'],
] as const;

// Categorization mapping for profile attributes
const PROFILE_GROUP_MAP: Record<string, 'business' | 'address' | 'operations'> = {
  legalName: 'business',
  businessType: 'business',
  industry: 'business',
  description: 'business',
  registrationNumber: 'business',
  taxId: 'business',
  businessEmail: 'business',
  phone: 'business',
  website: 'business',

  country: 'address',
  region: 'address',
  city: 'address',
  addressLine1: 'address',
  addressLine2: 'address',
  postalCode: 'address',
  currency: 'address',
  timezone: 'address',
  locale: 'address',

  primaryContactName: 'operations',
  primaryContactEmail: 'operations',
  primaryContactPhone: 'operations',
  businessMode: 'operations',
  onboardingOwner: 'operations',
  tenantSource: 'operations',
  externalReference: 'operations',
  internalNotes: 'operations',
};

const initialForm: CreateForm = {
  name: '',
  slug: '',
  code: '',
  planTier: 'starter',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  profile: {},
};

async function platformRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authClient.getAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Platform request failed (${response.status})`);
  return payload;
}

export const TenantManagementView: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusDraft, setStatusDraft] = useState<TenantStatusFilter>('all');
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openActionTenantId, setOpenActionTenantId] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmTenant, setConfirmTenant] = useState<Tenant | null>(null);
  const [archiveTenant, setArchiveTenant] = useState<Tenant | null>(null);
  const [detailTenant, setDetailTenant] = useState<TenantDetail | null>(null);
  const [editingTenant, setEditingTenant] = useState<TenantDetail | null>(null);
  const [detailActiveTab, setDetailActiveTab] = useState<'overview' | 'profile' | 'discovery'>('overview');
  const [formCategoryTab, setFormCategoryTab] = useState<FormCategoryTab>('core');
  const [form, setForm] = useState<CreateForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!openActionTenantId) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tenant-action-container')) {
        setOpenActionTenantId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenActionTenantId(null);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openActionTenantId]);

  // Toast timeout
  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => setSuccessToast(null), 3500);
    return () => clearTimeout(t);
  }, [successToast]);

  // Copied timeout
  useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(t);
  }, [copiedId]);

  const loadTenants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: String(PAGE_SIZE), offset: String(offset) });
      if (searchQuery) params.set('search', searchQuery);
      const payload = await platformRequest(`/api/platform/tenants?${params.toString()}`);
      setTenants(Array.isArray(payload.data) ? payload.data : []);
      setTotal(Number.isFinite(payload.pagination?.total) ? payload.pagination.total : Number(payload.total) || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load tenants.');
    } finally {
      setIsLoading(false);
    }
  }, [offset, searchQuery, statusFilter]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const applyFilters = () => {
    setOffset(0);
    setSearchQuery(searchDraft.trim());
    setStatusFilter(statusDraft);
  };

  const clearFilters = () => {
    setOffset(0);
    setSearchDraft('');
    setSearchQuery('');
    setStatusDraft('all');
    setStatusFilter('all');
    setPlanFilter('all');
  };

  const handleStatusTabClick = (newStatus: TenantStatusFilter) => {
    setStatusDraft(newStatus);
    setStatusFilter(newStatus);
    setOffset(0);
  };

  const copyToClipboard = (text: string, label: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setSuccessToast(`Copied ${label} to clipboard`);
    }
  };

  const createTenant = async () => {
    if (
      !form.name.trim() ||
      !form.slug.trim() ||
      (!editingTenant && (!form.adminName.trim() || !form.adminEmail.trim() || !form.adminPassword))
    ) {
      setError('Complete the organization and initial administrator fields before creating a tenant.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const profile = Object.fromEntries(
        Object.entries(form.profile).filter(([, value]) => typeof value === 'string' && value.trim())
      ) as TenantProfile;

      if (editingTenant) {
        await platformRequest('/api/platform/tenants/' + encodeURIComponent(editingTenant.id), {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, slug: form.slug, profile }),
        });
        setSuccessToast(`Organization "${form.name}" updated successfully.`);
      } else {
        await platformRequest('/api/platform/tenants', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            slug: form.slug,
            code: form.code,
            planTier: form.planTier,
            adminName: form.adminName,
            adminEmail: form.adminEmail,
            adminPassword: form.adminPassword,
            profile }),
        });
        setSuccessToast(`Tenant organization "${form.name}" provisioned successfully.`);
      }
      setForm(initialForm);
      setIsCreateOpen(false);
      setEditingTenant(null);
      if (offset === 0) await loadTenants();
      else setOffset(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setTenantState = async (tenant: Tenant) => {
    if (tenant.status === 'archived') return;
    setIsSubmitting(true);
    setError(null);
    try {
      const action = tenant.status === 'active' ? 'suspend' : 'reactivate';
      await platformRequest(`/api/platform/tenants/${encodeURIComponent(tenant.id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Requested from Tenant Management by platform operator.' }),
      });
      setSuccessToast(
        action === 'suspend'
          ? `Tenant "${tenant.name}" has been suspended.`
          : `Tenant "${tenant.name}" has been reactivated.`
      );
      setConfirmTenant(null);
      await loadTenants();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update tenant status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setField = <K extends keyof CreateForm>(field: K, value: CreateForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const handleNameChange = (nameVal: string) => {
    setForm((current) => {
      const shouldAutoSlug =
        !editingTenant &&
        (!current.slug ||
          current.slug ===
            current.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''));
      const autoSlug = shouldAutoSlug
        ? nameVal
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        : current.slug;

      const shouldAutoCode =
        !editingTenant &&
        (!current.code ||
          current.code ===
            current.name
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, '_')
              .replace(/^_+|_+$/g, ''));
      const autoCode = shouldAutoCode
        ? nameVal
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
        : current.code;

      return {
        ...current,
        name: nameVal,
        slug: autoSlug,
        code: autoCode,
      };
    });
  };

  const openTenantDetails = async (tenant: Tenant) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = await platformRequest('/api/platform/tenants/' + encodeURIComponent(tenant.id));
      setDetailTenant(payload.data as TenantDetail);
      setDetailActiveTab('overview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load tenant details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const editTenant = async (tenant: Tenant) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = await platformRequest('/api/platform/tenants/' + encodeURIComponent(tenant.id));
      const detail = payload.data as TenantDetail;
      if (detail.lifecycleStatus === 'archived') throw new Error('Archived tenants are read-only.');
      setEditingTenant(detail);
      setFormCategoryTab('core');
      setForm({
        ...initialForm,
        name: detail.name,
        slug: detail.slug,
        code: detail.code,
        planTier: (detail.planTier || 'starter') as PlanTier,
        profile: detail.profile || {},
      });
      setIsCreateOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load tenant for editing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const archiveSelectedTenant = async (tenant: Tenant) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await platformRequest('/api/platform/tenants/' + encodeURIComponent(tenant.id) + '/archive', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Archived from Tenant Management by platform operator.' }),
      });
      setSuccessToast(`Tenant "${tenant.name}" has been permanently archived.`);
      setArchiveTenant(null);
      await loadTenants();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to archive tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusClasses: Record<TenantStatus, string> = {
    active: 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    suspended: 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300',
    archived: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400',
  };

  const planTierClasses: Record<PlanTier, string> = {
    starter: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60 dark:border-slate-700',
    professional: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/60',
    enterprise: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/60',
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side filtering by plan tier if selected
  const filteredTenants = planFilter === 'all'
    ? tenants
    : tenants.filter((t) => (t.planTier || '').toLowerCase() === planFilter.toLowerCase());

  // Metrics counts
  const activeCount = tenants.filter((t) => t.status === 'active').length;
  const suspendedCount = tenants.filter((t) => t.status === 'suspended').length;
  const archivedCount = tenants.filter((t) => t.status === 'archived').length;
  const proEntCount = tenants.filter((t) => t.planTier === 'professional' || t.planTier === 'enterprise').length;

  const isFiltering = statusFilter !== 'all' || searchQuery.trim() !== '' || planFilter !== 'all';

  // Count filled fields for each form category
  const countFilledFields = (cat: 'business' | 'address' | 'operations') => {
    return PROFILE_FIELDS.filter(([key]) => PROFILE_GROUP_MAP[key] === cat && Boolean(form.profile[key]?.trim())).length;
  };

  // Password requirement checks
  const isPwdLengthValid = form.adminPassword.length >= 12;
  const isPwdLowerValid = /[a-z]/.test(form.adminPassword);
  const isPwdUpperValid = /[A-Z]/.test(form.adminPassword);
  const isPwdNumberValid = /[0-9]/.test(form.adminPassword);

  // Render Administrative Actions Dropdown
  const renderActionDropdown = (tenant: Tenant, isNearBottom = false) => {
    const isOpen = openActionTenantId === tenant.id;
    const isArchived = tenant.status === 'archived';
    const isActive = tenant.status === 'active';

    return (
      <div className="tenant-action-container relative inline-block text-left">
        <div className="inline-flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void openTenantDetails(tenant)}
            className="h-8 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400"
            title="Inspect full details"
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            View
          </Button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenActionTenantId(isOpen ? null : tenant.id);
            }}
            className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              isOpen
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 shadow-xs'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Administrative actions"
            aria-haspopup="true"
            aria-expanded={isOpen}
          >
            <span>Actions</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute right-0 ${
              isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            } w-56 z-50 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl p-1.5 text-xs divide-y divide-slate-100 dark:divide-slate-800 text-left`}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpenActionTenantId(null);
                  void openTenantDetails(tenant);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Inspect Dossier</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  copyToClipboard(tenant.slug, 'slug', `slug-${tenant.id}`);
                  setOpenActionTenantId(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Copy className="w-4 h-4 text-slate-400" />
                <span>Copy Slug</span>
              </button>
            </div>

            {!isArchived ? (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionTenantId(null);
                    void editTenant(tenant);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4 text-slate-500" />
                  <span>Edit Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenActionTenantId(null);
                    setConfirmTenant(tenant);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                  }`}
                >
                  {isActive ? (
                    <>
                      <PauseCircle className="w-4 h-4 text-amber-600" />
                      <span>Suspend Tenant</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 text-emerald-600" />
                      <span>Reactivate Tenant</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenActionTenantId(null);
                    setArchiveTenant(tenant);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  <Archive className="w-4 h-4 text-rose-600" />
                  <span>Archive Organization</span>
                </button>
              </div>
            ) : (
              <div className="py-2 px-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500 italic">
                Archived (Read-only)
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="ui-page space-y-6 max-w-screen-2xl mx-auto pb-16" aria-labelledby="tenant-management-title">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-2xl dark:bg-white dark:text-slate-900 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Banner / Executive Header */}
      <header className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/60 to-sky-50/60 p-6 shadow-md shadow-indigo-950/5 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="ui-page-header__copy space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Platform tenant lifecycle</span>
            </div>
            <h1 id="tenant-management-title" className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Tenant Management
            </h1>
            <p className="ui-page-description text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Provision tenants and manage active or suspended organizations. Archived tenants are read-only; plan changes are managed in Subscriptions.
            </p>
          </div>

          <div className="ui-page-actions flex items-center gap-2.5 self-start sm:self-auto shrink-0">
            <Button
              variant="outline"
              onClick={loadTenants}
              isLoading={isLoading}
              leftIcon={<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
              className="rounded-xl font-semibold text-xs shadow-xs"
            >
              Refresh
            </Button>
            <Button
              onClick={() => {
                setEditingTenant(null);
                setForm(initialForm);
                setFormCategoryTab('core');
                setIsCreateOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
              className="rounded-xl font-bold text-xs shadow-xs"
            >
              Create Tenant
            </Button>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200 flex items-start gap-3 shadow-xs"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Attention required</p>
            <p className="mt-0.5 font-normal">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total Tenants */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Enrolled
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
              {total}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-slate-500">
              Registered organizations
            </div>
          </div>
        </div>

        {/* Active Organizations */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Tenants
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Operating normally
            </div>
          </div>
        </div>

        {/* Suspended / Review Required */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Suspended / Paused
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <PauseCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
              {suspendedCount}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              Business-plane restricted
            </div>
          </div>
        </div>

        {/* Enterprise & Pro Accounts */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pro & Enterprise
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
              {proEntCount}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
              Advanced tier tenants
            </div>
          </div>
        </div>
      </div>

      {/* Unified Search, Filter & Controls Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
        {/* Row 1: Search, Plan Dropdown, Action buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Search tenants"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by organization name, slug, or tenant code…"
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters();
              }}
              className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft('');
                  setSearchQuery('');
                  setOffset(0);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Plan Tier Filter */}
            <div className="w-40 sm:w-44">
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

            {/* Lifecycle Status Select (Hidden on large, fallback for direct control) */}
            <div className="w-36 sm:w-40 lg:hidden">
              <Select
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value as TenantStatusFilter)}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'suspended', label: 'Suspended' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            </div>

            <Button
              onClick={applyFilters}
              leftIcon={<Search className="h-4 w-4" />}
              className="rounded-xl text-xs font-bold"
            >
              Apply filters
            </Button>

            {isFiltering && (
              <Button
                variant="ghost"
                onClick={clearFilters}
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                className="rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Tactile Segmented Lifecycle Bar + Live Counts */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 inline-flex items-center gap-1 min-w-max">
              {[
                { id: 'all', label: 'All Organizations', count: total },
                { id: 'active', label: 'Active', count: activeCount },
                { id: 'suspended', label: 'Suspended', count: suspendedCount },
                { id: 'archived', label: 'Archived', count: archivedCount },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleStatusTabClick(tab.id as TenantStatusFilter)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                      statusFilter === tab.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium">
            <span aria-live="polite">
              {isLoading
                ? 'Loading tenants…'
                : `Showing ${total === 0 ? 0 : offset + 1}–${Math.min(offset + tenants.length, total)} of ${total} tenant organizations`}
            </span>
            {isFiltering && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-1"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Tenant Data Surface: Desktop Table + Mobile Cards */}
      <div className="rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-sm">
        {/* Desktop & Tablet Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto min-h-[380px] pb-16">
          <Table<Tenant>
            caption="Tenant organizations"
            data={filteredTenants}
            isLoading={isLoading}
            emptyStateMessage="No tenant organizations match these filters."
            getRowKey={(tenant) => tenant.id}
            currentPage={currentPage} totalPages={totalPages}
            onPageChange={(page) => setOffset((page - 1) * PAGE_SIZE)}
            columns={[
              {
                header: 'Tenant Organization',
                accessor: (tenant) => (
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shadow-xs font-black text-sm">
                      {tenant.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white text-sm truncate flex items-center gap-1.5">
                        <span>{tenant.name}</span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>{tenant.slug}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(tenant.slug, 'slug', `slug-${tenant.id}`)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                          title="Copy tenant slug"
                        >
                          {copiedId === `slug-${tenant.id}` ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                header: 'Tenant Code',
                accessor: (tenant) => (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                      {tenant.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(tenant.code, 'tenant code', `code-${tenant.id}`)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                      title="Copy code"
                    >
                      {copiedId === `code-${tenant.id}` ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ),
              },
              {
                header: 'Plan Tier',
                accessor: (tenant) => (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold capitalize border ${
                      planTierClasses[tenant.planTier] || planTierClasses.starter
                    }`}
                  >
                    {tenant.planTier || '—'}
                  </span>
                ),
              },
              {
                header: 'Subscription',
                accessor: (tenant) => {
                  const subStatus = (tenant.subscriptionStatus || 'unknown').toLowerCase();
                  const isSubActive = subStatus === 'active';
                  const isSubTrial = subStatus === 'trialing';
                  const isSubPastDue = subStatus === 'past_due';

                  return (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isSubActive
                            ? 'bg-emerald-500'
                            : isSubTrial
                            ? 'bg-sky-500'
                            : isSubPastDue
                            ? 'bg-rose-500 animate-pulse'
                            : 'bg-slate-400'
                        }`}
                      />
                      <span className="capitalize">{subStatus.replace(/_/g, ' ')}</span>
                    </div>
                  );
                },
              },
              {
                header: 'Lifecycle Status',
                accessor: (tenant) => (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                      statusClasses[tenant.status] || statusClasses.suspended
                    }`}
                  >
                    {tenant.status === 'active' && <CheckCircle2 className="w-3 h-3" />}
                    {tenant.status === 'suspended' && <PauseCircle className="w-3 h-3" />}
                    {tenant.status === 'archived' && <Archive className="w-3 h-3" />}
                    <span>{tenant.status}</span>
                  </span>
                ),
              },
              {
                header: 'Actions',
                className: 'text-right min-w-[170px]',
                accessor: (tenant) => {
                  const idx = filteredTenants.findIndex((t) => t.id === tenant.id);
                  const isNearBottom = idx >= filteredTenants.length - 2;
                  return renderActionDropdown(tenant, isNearBottom);
                },
              },
            ]}
          />
        </div>

        {/* Mobile Cards View (< 768px) */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
              <p className="mt-2 text-xs font-semibold text-slate-500">Loading tenant organizations…</p>
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">No tenants match filters</h3>
              <p className="mt-1 text-xs text-slate-500">Try adjusting your search criteria or clear status filters.</p>
              {isFiltering && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            filteredTenants.map((tenant) => {
              const subStatus = (tenant.subscriptionStatus || 'unknown').toLowerCase();
              return (
                <div key={tenant.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 font-bold text-xs">
                        {tenant.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white text-sm truncate">
                          {tenant.name}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {tenant.slug} · <span className="font-bold">{tenant.code}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize shrink-0 ${
                        statusClasses[tenant.status] || statusClasses.suspended
                      }`}
                    >
                      {tenant.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Plan Tier</span>
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[11px] font-bold capitalize mt-0.5 border ${
                          planTierClasses[tenant.planTier] || planTierClasses.starter
                        }`}
                      >
                        {tenant.planTier}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Subscription</span>
                      <span className="text-slate-700 dark:text-slate-300 font-semibold mt-0.5 block capitalize">
                        {subStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void openTenantDetails(tenant)}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View Details
                    </Button>

                    <div>{renderActionDropdown(tenant, false)}</div>
                  </div>
                </div>
              );
            })
          )}

          {/* Mobile Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setOffset((currentPage - 2) * PAGE_SIZE)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setOffset(currentPage * PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREATE & EDIT TENANT MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => !isSubmitting && setIsCreateOpen(false)}
        title={editingTenant ? `Edit Organization: ${editingTenant.name}` : 'Provision New Tenant Organization'}
        size="lg"
        closeOnEscape={!isSubmitting}
        closeOnBackdropClick={!isSubmitting}
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {formCategoryTab !== 'core' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tabs: FormCategoryTab[] = ['core', 'business', 'address', 'operations'];
                    const idx = tabs.indexOf(formCategoryTab);
                    if (idx > 0) setFormCategoryTab(tabs[idx - 1]);
                  }}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto text-xs"
                >
                  Previous
                </Button>
              )}
              {formCategoryTab !== 'operations' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const tabs: FormCategoryTab[] = ['core', 'business', 'address', 'operations'];
                    const idx = tabs.indexOf(formCategoryTab);
                    if (idx < tabs.length - 1) setFormCategoryTab(tabs[idx + 1]);
                  }}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto text-xs"
                >
                  Next Tab
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button variant="ghost" disabled={isSubmitting} onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                isLoading={isSubmitting}
                disabled={
                  !form.name.trim() ||
                  !form.slug.trim() ||
                  (!editingTenant &&
                    (!form.adminName.trim() ||
                      !form.adminEmail.trim() ||
                      form.adminPassword.length < 12 ||
                      !/[a-z]/.test(form.adminPassword) ||
                      !/[A-Z]/.test(form.adminPassword) ||
                      !/[0-9]/.test(form.adminPassword)))
                }
                onClick={createTenant}
                className="font-bold text-xs shadow-xs"
              >
                {editingTenant ? 'Save Changes' : 'Create Tenant'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="max-h-[74vh] overflow-y-auto pr-1 space-y-5">
          {/* Form Context Banner */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-3">
            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-indigo-950 dark:text-indigo-200">
                {editingTenant ? `Editing ${editingTenant.name}` : 'Tenant Organization Setup'}
              </p>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                {editingTenant
                  ? 'Update business profile attributes, address details, and public URL slug. Tenant code and billing plans are managed via their dedicated platform modules.'
                  : 'Provision an enterprise tenant workspace. Tenant creation does not create or publish a Discovery listing.'}
              </p>
            </div>
          </div>

          {/* Form Category Navigation Tabs */}
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <div className="p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 inline-flex items-center gap-1 min-w-full sm:min-w-max">
              {[
                { id: 'core', label: '1. Core Setup', icon: Layers, filled: Boolean(form.name && form.slug) },
                { id: 'business', label: '2. Business Profile', icon: Globe, count: countFilledFields('business') },
                { id: 'address', label: '3. Location & Regional', icon: MapPin, count: countFilledFields('address') },
                { id: 'operations', label: '4. Operations & Contact', icon: Users, count: countFilledFields('operations') },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = formCategoryTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFormCategoryTab(tab.id as FormCategoryTab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB 1: CORE SETUP */}
          {formCategoryTab === 'core' && (
            <div className="space-y-5">
              {/* Organization Core Identity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Organization Core Identity</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">Required fields</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <Input
                      label="Organization name"
                      value={form.name}
                      onChange={(event) => handleNameChange(event.target.value)}
                      placeholder="e.g. Freetown Modern Pharmacy Ltd"
                      helperText="Official display name for this tenant organization across receipts and administrative views."
                      required
                    />
                  </div>

                  <div>
                    <Input
                      label="Tenant slug (URL identifier)"
                      value={form.slug}
                      onChange={(event) => setField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
                      placeholder="e.g. freetown-pharmacy"
                      helperText="Lowercase letters, numbers, and hyphens only."
                      required
                    />
                    {form.slug && (
                      <p className="mt-1 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <span>Storefront URL:</span>
                        <strong className="underline">aba-cha.com/store/{form.slug}</strong>
                      </p>
                    )}
                  </div>

                  <div>
                    <Input
                      label="Tenant code (Prefix identifier)"
                      value={form.code}
                      onChange={(event) => setField('code', event.target.value.toUpperCase().replace(/[^A-Z0-9_]+/g, ''))}
                      placeholder="e.g. FT_PHARM"
                      disabled={Boolean(editingTenant)}
                      helperText={
                        editingTenant
                          ? 'Tenant code is immutable after provisioning.'
                          : 'Used for inventory SKUs and invoice sequence generation.'
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      {editingTenant ? 'Current Plan Tier (Read-Only)' : 'Initial Plan Tier'}
                    </label>
                    {editingTenant ? (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold capitalize border ${
                              planTierClasses[form.planTier] || planTierClasses.starter
                            }`}
                          >
                            {form.planTier}
                          </span>
                          <span className="text-slate-500">plan tier assigned</span>
                        </div>
                        <span className="text-[11px] text-slate-400 italic">
                          Tier changes are managed securely in Subscriptions.
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          { id: 'starter', label: 'Starter', desc: '1 Location · 5 Users · Core POS' },
                          { id: 'professional', label: 'Professional', desc: '5 Locations · 25 Users · Multi-store' },
                          { id: 'enterprise', label: 'Enterprise', desc: 'Unlimited · Dedicated Limits' },
                        ].map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => setField('planTier', plan.id as PlanTier)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              form.planTier === plan.id
                                ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60 dark:border-indigo-500 shadow-xs'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-slate-900 dark:text-white capitalize">
                                {plan.label}
                              </span>
                              {form.planTier === plan.id && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{plan.desc}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Initial Administrator (Only when creating) */}
              {!editingTenant && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Initial Administrator Account</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      The password is hashed server-side using secure cryptography and is never returned in plaintext.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <Input
                      label="Administrator full name"
                      value={form.adminName}
                      onChange={(event) => setField('adminName', event.target.value)}
                      placeholder="e.g. Sahr Kamara"
                      required
                    />

                    <Input
                      label="Administrator email address"
                      type="email"
                      value={form.adminEmail}
                      onChange={(event) => setField('adminEmail', event.target.value)}
                      placeholder="e.g. skamara@freetownpharmacy.com"
                      required
                    />

                    <div className="sm:col-span-2">
                      <Input
                        label="Temporary administrator password"
                        type="password"
                        value={form.adminPassword}
                        onChange={(event) => setField('adminPassword', event.target.value)}
                        placeholder="Enter secure initial password (minimum 12 characters)"
                        helperText="12–128 characters; include uppercase, lowercase, and a number."
                        required
                      />

                      {/* Password Requirements Checklist */}
                      {form.adminPassword.length > 0 && (
                        <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                            Password Integrity Requirements
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div
                              className={`flex items-center gap-1.5 font-medium ${
                                isPwdLengthValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {isPwdLengthValid ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />
                              )}
                              <span>12+ Characters</span>
                            </div>
                            <div
                              className={`flex items-center gap-1.5 font-medium ${
                                isPwdUpperValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {isPwdUpperValid ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />
                              )}
                              <span>Uppercase Letter</span>
                            </div>
                            <div
                              className={`flex items-center gap-1.5 font-medium ${
                                isPwdLowerValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {isPwdLowerValid ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />
                              )}
                              <span>Lowercase Letter</span>
                            </div>
                            <div
                              className={`flex items-center gap-1.5 font-medium ${
                                isPwdNumberValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {isPwdNumberValid ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />
                              )}
                              <span>Number</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BUSINESS PROFILE */}
          {formCategoryTab === 'business' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Corporate Entity &amp; Official Communications</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Legal registration numbers, tax identifiers, official email, phone, and business description.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {PROFILE_FIELDS.map(([key, label]) => {
                  if (PROFILE_GROUP_MAP[key] !== 'business') return null;
                  const isFullWidth = key === 'description';

                  return (
                    <div key={key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                      <Input
                        label={label}
                        value={form.profile[key] || ''}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            profile: { ...current.profile, [key]: event.target.value },
                          }))
                        }
                        placeholder={`Enter ${label.toLowerCase()}`}
                        type={key.toLowerCase().includes('email') ? 'email' : key === 'website' ? 'url' : 'text'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: LOCATION & REGIONAL */}
          {formCategoryTab === 'address' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600" />
                  <span>Physical Address &amp; Regional Localization</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Store physical address, postal routing, default operating currency, and local timezone.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {PROFILE_FIELDS.map(([key, label]) => {
                  if (PROFILE_GROUP_MAP[key] !== 'address') return null;
                  const isFullWidth = key === 'addressLine1' || key === 'addressLine2';

                  return (
                    <div key={key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                      <Input
                        label={label}
                        value={form.profile[key] || ''}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            profile: { ...current.profile, [key]: event.target.value },
                          }))
                        }
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: OPERATIONS & CONTACTS */}
          {formCategoryTab === 'operations' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span>Operations, Primary Contact &amp; Tracking</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Primary business representative details, onboarding owner, and internal platform reference tracking.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {PROFILE_FIELDS.map(([key, label]) => {
                  if (PROFILE_GROUP_MAP[key] !== 'operations') return null;
                  const isFullWidth = key === 'internalNotes';

                  return (
                    <div key={key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                      <Input
                        label={label}
                        value={form.profile[key] || ''}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            profile: { ...current.profile, [key]: event.target.value },
                          }))
                        }
                        placeholder={`Enter ${label.toLowerCase()}`}
                        type={key.toLowerCase().includes('email') ? 'email' : 'text'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* TENANT DOSSIER / VIEW DETAILS MODAL */}
      <Modal
        isOpen={Boolean(detailTenant)}
        onClose={() => setDetailTenant(null)}
        title={detailTenant ? `Organization Dossier: ${detailTenant.name}` : 'Tenant Details'}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span>Tenant ID:</span>
              <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{detailTenant?.id}</span>
              <button
                type="button"
                onClick={() => detailTenant && copyToClipboard(detailTenant.id, 'tenant ID', `dossier-id-${detailTenant.id}`)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
                title="Copy ID"
              >
                {copiedId === `dossier-id-${detailTenant?.id}` ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {detailTenant && detailTenant.lifecycleStatus !== 'archived' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const t = detailTenant;
                    setDetailTenant(null);
                    void editTenant({
                      id: t.id,
                      name: t.name,
                      slug: t.slug,
                      code: t.code,
                      status: t.status,
                      planTier: t.planTier,
                      createdAt: t.createdAt,
                    });
                  }}
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  className="text-xs"
                >
                  Edit Profile
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setDetailTenant(null)} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        }
      >
        {detailTenant && (
          <div className="max-h-[76vh] space-y-5 overflow-y-auto pr-1">
            {/* Header Identity Strip */}
            <div className="p-4 rounded-3xl bg-gradient-to-r from-slate-50 to-indigo-50/50 dark:from-slate-850 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 shadow-xs">
              <div className="flex items-center gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white font-black text-lg shadow-sm">
                  {detailTenant.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {detailTenant.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{detailTenant.slug}</span>
                    <span>·</span>
                    <span className="font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {detailTenant.code}
                    </span>
                    <span>·</span>
                    <span className="capitalize">{detailTenant.lifecycleStatus}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${
                    statusClasses[detailTenant.lifecycleStatus] || statusClasses.suspended
                  }`}
                >
                  {detailTenant.lifecycleStatus === 'active' && <CheckCircle2 className="w-3 h-3" />}
                  {detailTenant.lifecycleStatus === 'suspended' && <PauseCircle className="w-3 h-3" />}
                  {detailTenant.lifecycleStatus === 'archived' && <Archive className="w-3 h-3" />}
                  <span>{detailTenant.lifecycleStatus}</span>
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${
                    planTierClasses[detailTenant.planTier] || planTierClasses.starter
                  }`}
                >
                  {detailTenant.planTier}
                </span>
              </div>
            </div>

            {/* Modal Navigation Tabs: Overview | Profile Details | Discovery */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setDetailActiveTab('overview')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  detailActiveTab === 'overview'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Overview &amp; Metrics</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailActiveTab('profile')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  detailActiveTab === 'profile'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Business Profile</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailActiveTab('discovery')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  detailActiveTab === 'discovery'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Discovery Integration</span>
              </button>
            </div>

            {/* TAB 1: OVERVIEW & OPERATIONAL METRICS */}
            {detailActiveTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[10px] font-black uppercase tracking-wider">Active Users</span>
                      <Users className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                    <span className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1.5 block">
                      {detailTenant.userCount}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[10px] font-black uppercase tracking-wider">Store Locations</span>
                      <MapPin className="w-3.5 h-3.5 text-sky-500" />
                    </div>
                    <span className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1.5 block">
                      {detailTenant.locationCount}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[10px] font-black uppercase tracking-wider">Plan Tier</span>
                      <Layers className="w-3.5 h-3.5 text-purple-500" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white capitalize mt-2 block">
                      {detailTenant.planTier}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[10px] font-black uppercase tracking-wider">Subscription</span>
                      <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 capitalize mt-2 block">
                      {detailTenant.subscription?.status || 'unknown'}
                    </span>
                  </div>
                </div>

                {/* Primary Representative Card (if exists) */}
                {(detailTenant.profile?.primaryContactName || detailTenant.profile?.businessEmail) && (
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Primary Representative
                      </span>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {detailTenant.profile?.primaryContactName || 'Main Representative'}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {detailTenant.profile?.primaryContactEmail || detailTenant.profile?.businessEmail}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {detailTenant.profile?.businessEmail && (
                        <a
                          href={`mailto:${detailTenant.profile.businessEmail}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-750"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Email Tenant</span>
                        </a>
                      )}
                      {detailTenant.profile?.phone && (
                        <a
                          href={`tel:${detailTenant.profile.phone}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-750"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Operational State Strip */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Platform Access State:</span>
                    <span
                      className={`font-semibold flex items-center gap-1 ${
                        detailTenant.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                      }`}
                    >
                      {detailTenant.isActive ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active &amp; Authenticating</span>
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-3.5 h-3.5" />
                          <span>Inactive / Suspended</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Enrolled Date:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {new Date(detailTenant.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Last Metadata Modification:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {new Date(detailTenant.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: BUSINESS PROFILE DETAILS */}
            {detailActiveTab === 'profile' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Organization profile
                  </h4>
                  <span className="text-[11px] text-slate-400">26 standard profile attributes</span>
                </div>

                {/* 4 Clean Grouped Cards */}
                <div className="space-y-3.5">
                  {/* Category 1: Corporate Identity & Legal */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-indigo-500" />
                      <span>Corporate Identity &amp; Legal Entity</span>
                    </span>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PROFILE_FIELDS.map(([key, label]) => {
                        if (PROFILE_GROUP_MAP[key] !== 'business') return null;
                        const val = detailTenant.profile?.[key];
                        return (
                          <div
                            key={key}
                            className={`p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 ${
                              key === 'description' ? 'sm:col-span-2' : ''
                            }`}
                          >
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {label}
                            </dt>
                            <dd className="mt-0.5 break-words text-xs font-medium text-slate-800 dark:text-slate-200">
                              {val ? (
                                key === 'website' ? (
                                  <a
                                    href={val.startsWith('http') ? val : `https://${val}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>{val}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : key.toLowerCase().includes('email') ? (
                                  <a href={`mailto:${val}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                    {val}
                                  </a>
                                ) : (
                                  val
                                )
                              ) : (
                                <span className="text-slate-400 italic font-normal">—</span>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>

                  {/* Category 2: Physical Location & Localization */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-sky-500" />
                      <span>Physical Address &amp; Regional Localization</span>
                    </span>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PROFILE_FIELDS.map(([key, label]) => {
                        if (PROFILE_GROUP_MAP[key] !== 'address') return null;
                        const val = detailTenant.profile?.[key];
                        return (
                          <div
                            key={key}
                            className={`p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 ${
                              key === 'addressLine1' || key === 'addressLine2' ? 'sm:col-span-2' : ''
                            }`}
                          >
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {label}
                            </dt>
                            <dd className="mt-0.5 break-words text-xs font-medium text-slate-800 dark:text-slate-200">
                              {val || <span className="text-slate-400 italic font-normal">—</span>}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>

                  {/* Category 3: Operations & Internal Tracking */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Users className="w-3 h-3 text-purple-500" />
                      <span>Operations, Representative &amp; Internal Tracking</span>
                    </span>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PROFILE_FIELDS.map(([key, label]) => {
                        if (PROFILE_GROUP_MAP[key] !== 'operations') return null;
                        const val = detailTenant.profile?.[key];
                        return (
                          <div
                            key={key}
                            className={`p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 ${
                              key === 'internalNotes' ? 'sm:col-span-2' : ''
                            }`}
                          >
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {label}
                            </dt>
                            <dd className="mt-0.5 break-words text-xs font-medium text-slate-800 dark:text-slate-200">
                              {val ? (
                                key.toLowerCase().includes('email') ? (
                                  <a href={`mailto:${val}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                    {val}
                                  </a>
                                ) : (
                                  val
                                )
                              ) : (
                                <span className="text-slate-400 italic font-normal">—</span>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: DISCOVERY INTEGRATION */}
            {detailActiveTab === 'discovery' && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Discovery listing
                </h4>

                {detailTenant.discoveryListing ? (
                  <div className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3.5 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="font-bold text-base text-slate-900 dark:text-white">
                          {detailTenant.discoveryListing.name}
                        </h5>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          Public slug: {detailTenant.discoveryListing.slug}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {detailTenant.discoveryListing.listingStatus}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                          {detailTenant.discoveryListing.verificationStatus}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-xs">
                      <p className="text-slate-600 dark:text-slate-400">
                        {detailTenant.discoveryListing.isDiscoverable
                          ? 'Discoverability enabled. Public customers can find this merchant store in local search.'
                          : 'Not currently discoverable in public consumer search.'}
                        {' '}Listing review and publication remain separate from tenant administrative access.
                      </p>
                    </div>

                    <Button
                      className="mt-1"
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.assign('/?tab=discovery-moderation')}
                      leftIcon={<ExternalLink className="h-4 w-4" />}
                    >
                      Open Trust &amp; Moderation
                    </Button>
                  </div>
                ) : (
                  <div className="p-8 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <Globe className="w-9 h-9 text-slate-400 mx-auto" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No linked Discovery listing</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      A listing can be created separately when required through the Trust &amp; Moderation portal.
                    </p>
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.assign('/?tab=discovery-moderation')}
                        leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                        className="text-xs"
                      >
                        Open Trust &amp; Moderation
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ARCHIVE TENANT CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(archiveTenant)}
        onClose={() => !isSubmitting && setArchiveTenant(null)}
        title="Archive tenant organization?"
        size="sm"
        closeOnEscape={!isSubmitting}
        closeOnBackdropClick={!isSubmitting}
        footer={
          <>
            <Button variant="ghost" disabled={isSubmitting} onClick={() => setArchiveTenant(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isSubmitting}
              onClick={() => archiveTenant && void archiveSelectedTenant(archiveTenant)}
              className="font-bold text-xs"
            >
              Archive Tenant
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Permanent Lifecycle Transition:</span>
              <p className="mt-0.5">
                Archiving <strong className="font-mono">{archiveTenant?.name}</strong> deactivates the organization and cancels non-terminal subscriptions.
              </p>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Historical transaction records, audit evidence, and receipts are preserved for legal compliance; normal reactivation is not available once archived.
          </p>
        </div>
      </Modal>

      {/* SUSPEND / REACTIVATE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(confirmTenant)}
        onClose={() => !isSubmitting && setConfirmTenant(null)}
        title={confirmTenant?.status === 'active' ? 'Suspend tenant organization?' : 'Reactivate tenant organization?'}
        size="sm"
        closeOnEscape={!isSubmitting}
        closeOnBackdropClick={!isSubmitting}
        footer={
          <>
            <Button variant="ghost" disabled={isSubmitting} onClick={() => setConfirmTenant(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmTenant?.status === 'active' ? 'danger' : 'primary'}
              isLoading={isSubmitting}
              onClick={() => confirmTenant && setTenantState(confirmTenant)}
              className="font-bold text-xs"
            >
              {confirmTenant?.status === 'active' ? 'Suspend Tenant' : 'Reactivate Tenant'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              confirmTenant?.status === 'active'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {confirmTenant?.status === 'active' ? (
              <PauseCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <PlayCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold">
                {confirmTenant?.status === 'active' ? 'Business-Plane Restriction:' : 'Access Restoration:'}
              </span>
              <p className="mt-0.5">
                {confirmTenant?.status === 'active'
                  ? `Suspending ${confirmTenant.name} blocks tenant authentication and business-plane access.`
                  : `Reactivating ${confirmTenant?.name} restores access if its subscription state permits reactivation.`}
              </p>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {confirmTenant?.status === 'active'
              ? 'Existing merchant sessions will be invalidated immediately. Billing subscriptions remain intact unless cancelled separately in Subscriptions.'
              : 'The organization will regain login capabilities and POS operations immediately.'}
          </p>
        </div>
      </Modal>
    </section>
  );
};
