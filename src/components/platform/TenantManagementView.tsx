import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, Search, ShieldCheck, PauseCircle, PlayCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { Table } from '../ui/Table';
import { authClient } from '../../services/authClient';

type PlanTier = 'starter' | 'professional' | 'enterprise';
type TenantStatus = 'active' | 'suspended' | 'archived';
type TenantStatusFilter = TenantStatus | 'all';
const PAGE_SIZE = 50;
interface Tenant { id: string; name: string; slug: string; code: string; status: TenantStatus; planTier: PlanTier; subscriptionStatus?: string | null; createdAt: string; }
interface CreateForm { name: string; slug: string; code: string; planTier: PlanTier; adminName: string; adminEmail: string; adminPassword: string; }
const initialForm: CreateForm = { name: '', slug: '', code: '', planTier: 'starter', adminName: '', adminEmail: '', adminPassword: '' };

async function platformRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...authClient.getAuthHeaders(), ...(options.headers || {}) } });
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmTenant, setConfirmTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<CreateForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTenants = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: String(PAGE_SIZE), offset: String(offset) });
      if (searchQuery) params.set('search', searchQuery);
      const payload = await platformRequest(`/api/platform/tenants?${params.toString()}`);
      setTenants(Array.isArray(payload.data) ? payload.data : []);
      setTotal(Number.isFinite(payload.pagination?.total) ? payload.pagination.total : Number(payload.total) || 0);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to load tenants.'); }
    finally { setIsLoading(false); }
  }, [offset, searchQuery, statusFilter]);
  useEffect(() => { void loadTenants(); }, [loadTenants]);

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
  };

  const createTenant = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.adminName.trim() || !form.adminEmail.trim() || !form.adminPassword) {
      setError('Complete the organization and initial administrator fields before creating a tenant.'); return;
    }
    setIsSubmitting(true); setError(null);
    try {
      await platformRequest('/api/platform/tenants', { method: 'POST', body: JSON.stringify(form) });
      setForm(initialForm); setIsCreateOpen(false);
      if (offset === 0) await loadTenants();
      else setOffset(0);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to create tenant.'); }
    finally { setIsSubmitting(false); }
  };

  const setTenantState = async (tenant: Tenant) => {
    if (tenant.status === 'archived') return;
    setIsSubmitting(true); setError(null);
    try {
      const action = tenant.status === 'active' ? 'suspend' : 'reactivate';
      await platformRequest(`/api/platform/tenants/${encodeURIComponent(tenant.id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Requested from Tenant Management by platform operator.' }),
      });
      setConfirmTenant(null); await loadTenants();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to update tenant status.'); }
    finally { setIsSubmitting(false); }
  };

  const setField = <K extends keyof CreateForm>(field: K, value: CreateForm[K]) => setForm((current) => ({ ...current, [field]: value }));
  const statusClasses: Record<TenantStatus, string> = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400',
    suspended: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
    archived: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  };
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="ui-page space-y-6" aria-labelledby="tenant-management-title">
      <header className="ui-page-header">
        <div className="ui-page-header__copy">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Platform tenant lifecycle</div>
          <h1 id="tenant-management-title" className="ui-page-title">Tenant Management</h1>
          <p className="ui-page-description">Provision tenants and manage active or suspended organizations. Archived tenants are read-only; plan changes are managed in Subscriptions.</p>
        </div>
        <div className="ui-page-actions">
          <Button variant="outline" onClick={loadTenants} isLoading={isLoading} leftIcon={<RefreshCw className="h-4 w-4" />}>Refresh</Button>
          <Button onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Create Tenant</Button>
        </div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      <div className="ui-surface space-y-4 p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <Input label="Search tenants" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name, slug, or tenant code" onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }} />
          <Select label="Lifecycle status" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as TenantStatusFilter)} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'archived', label: 'Archived' }]} />
          <Button onClick={applyFilters} leftIcon={<Search className="h-4 w-4" />}>Apply filters</Button>
          <Button variant="ghost" onClick={clearFilters} leftIcon={<X className="h-4 w-4" />}>Clear</Button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">{isLoading ? 'Loading tenants…' : `Showing ${total === 0 ? 0 : offset + 1}–${Math.min(offset + tenants.length, total)} of ${total} tenant organizations`}</p>
      </div>
      <div className="ui-surface overflow-hidden">
        <Table<Tenant> caption="Tenant organizations" data={tenants} isLoading={isLoading}
          emptyStateMessage="No tenant organizations match these filters."
          getRowKey={(tenant) => tenant.id}
          currentPage={currentPage} totalPages={totalPages}
          onPageChange={(page) => setOffset((page - 1) * PAGE_SIZE)}
          columns={[
            { header: 'Tenant', accessor: (tenant) => <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Building2 className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0"><div className="font-semibold text-slate-900 dark:text-slate-100">{tenant.name}</div><div className="font-mono text-[11px] text-slate-500">{tenant.slug}</div></div></div> },
            { header: 'Code', accessor: (tenant) => <span className="font-mono text-xs">{tenant.code}</span> },
            { header: 'Plan', accessor: (tenant) => <span className="capitalize">{tenant.planTier || '—'}</span> },
            { header: 'Subscription', accessor: (tenant) => <span className="capitalize">{(tenant.subscriptionStatus || 'unknown').replace(/_/g, ' ')}</span> },
            { header: 'Status', accessor: (tenant) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${statusClasses[tenant.status] || statusClasses.suspended}`}>{tenant.status}</span> },
            { header: 'Actions', className: 'text-right', accessor: (tenant) => tenant.status === 'archived' ? <span className="text-xs text-slate-500">Read-only</span> : <Button variant={tenant.status === 'active' ? 'danger' : 'outline'} size="sm" onClick={() => setConfirmTenant(tenant)} leftIcon={tenant.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}>{tenant.status === 'active' ? 'Suspend' : 'Reactivate'}</Button> },
          ]} />
      </div>
      <Modal isOpen={isCreateOpen} onClose={() => !isSubmitting && setIsCreateOpen(false)} title="Create tenant organization" size="lg" closeOnEscape={!isSubmitting} closeOnBackdropClick={!isSubmitting}
        footer={<><Button variant="ghost" disabled={isSubmitting} onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button isLoading={isSubmitting} disabled={!form.name.trim() || !form.slug.trim() || !form.adminName.trim() || !form.adminEmail.trim() || form.adminPassword.length < 12 || !/[a-z]/.test(form.adminPassword) || !/[A-Z]/.test(form.adminPassword) || !/[0-9]/.test(form.adminPassword)} onClick={createTenant}>Create Tenant</Button></>}>
        <div className="space-y-6">
          <div><h3 className="ui-section-title">Organization</h3><p className="ui-section-description">The slug becomes the stable tenant URL identifier.</p></div>
          <div className="ui-form-grid ui-form-grid--wide">
            <Input label="Organization name" value={form.name} onChange={(event) => setField('name', event.target.value)} required />
            <Input label="Tenant slug" value={form.slug} onChange={(event) => setField('slug', event.target.value.toLowerCase())} placeholder="acme-retail" required />
            <Input label="Tenant code" value={form.code} onChange={(event) => setField('code', event.target.value.toUpperCase())} placeholder="ACME_RETAIL" />
            <Select label="Initial plan tier" value={form.planTier} onChange={(event) => setField('planTier', event.target.value as PlanTier)} options={[{ value: 'starter', label: 'Starter' }, { value: 'professional', label: 'Professional' }, { value: 'enterprise', label: 'Enterprise' }]} />
          </div>
          <div className="border-t border-slate-200 pt-5 dark:border-slate-800"><h3 className="ui-section-title">Initial administrator</h3><p className="ui-section-description">The password is hashed server-side and never returned by the API.</p></div>
          <div className="ui-form-grid ui-form-grid--wide">
            <Input label="Full name" value={form.adminName} onChange={(event) => setField('adminName', event.target.value)} required />
            <Input label="Email" type="email" value={form.adminEmail} onChange={(event) => setField('adminEmail', event.target.value)} required />
            <Input label="Temporary password" type="password" value={form.adminPassword} onChange={(event) => setField('adminPassword', event.target.value)} helperText="12–128 characters; include uppercase, lowercase, and a number." required />
          </div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(confirmTenant)} onClose={() => !isSubmitting && setConfirmTenant(null)} title={confirmTenant?.status === 'active' ? 'Suspend tenant?' : 'Reactivate tenant?'} size="sm" closeOnEscape={!isSubmitting} closeOnBackdropClick={!isSubmitting}
        footer={<><Button variant="ghost" disabled={isSubmitting} onClick={() => setConfirmTenant(null)}>Cancel</Button><Button variant={confirmTenant?.status === 'active' ? 'danger' : 'primary'} isLoading={isSubmitting} onClick={() => confirmTenant && setTenantState(confirmTenant)}>{confirmTenant?.status === 'active' ? 'Suspend Tenant' : 'Reactivate Tenant'}</Button></>}>
        <p>{confirmTenant?.status === 'active' ? `Suspending ${confirmTenant.name} blocks tenant authentication and business-plane access.` : `Reactivating ${confirmTenant?.name} restores access if its subscription state permits reactivation.`}</p>
      </Modal>
    </section>
  );
};
