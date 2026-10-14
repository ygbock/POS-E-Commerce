import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, Search, ShieldCheck, PauseCircle, PlayCircle, X, Eye, Pencil, Archive, ExternalLink } from 'lucide-react';
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
type TenantProfile = Record<string, string>;
interface TenantDetail { id:string; name:string; slug:string; code:string; status:TenantStatus; planTier:PlanTier; createdAt:string; isActive:boolean; lifecycleStatus:TenantStatus; updatedAt:string; profile:TenantProfile; userCount:number; locationCount:number; subscription:{status?:string;planCode?:string}|null; discoveryListing:{id:string;name:string;slug:string;listingStatus:string;verificationStatus:string;isDiscoverable:boolean}|null; }
interface CreateForm { name: string; slug: string; code: string; planTier: PlanTier; adminName: string; adminEmail: string; adminPassword: string; profile: TenantProfile; }
const PROFILE_FIELDS = [
  ['legalName','Legal / registered name'],['businessType','Business type'],['industry','Industry'],['description','Business description'],
  ['registrationNumber','Registration number'],['taxId','Tax ID'],['businessEmail','Business email'],['phone','Business phone'],
  ['website','Website'],['country','Country'],['region','Region / state'],['city','City'],['addressLine1','Address line 1'],
  ['addressLine2','Address line 2'],['postalCode','Postal code'],['primaryContactName','Primary contact name'],
  ['primaryContactEmail','Primary contact email'],['primaryContactPhone','Primary contact phone'],['currency','Preferred currency'],
  ['timezone','Timezone'],['locale','Locale'],['businessMode','Business mode'],['onboardingOwner','Onboarding owner'],
  ['tenantSource','Tenant source'],['externalReference','External reference'],['internalNotes','Internal notes'],
] as const;
const initialForm: CreateForm = { name: '', slug: '', code: '', planTier: 'starter', adminName: '', adminEmail: '', adminPassword: '', profile: {} };

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
  const [archiveTenant, setArchiveTenant] = useState<Tenant | null>(null);
  const [detailTenant, setDetailTenant] = useState<TenantDetail | null>(null);
  const [editingTenant, setEditingTenant] = useState<TenantDetail | null>(null);
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
    if (!form.name.trim() || !form.slug.trim() || (!editingTenant && (!form.adminName.trim() || !form.adminEmail.trim() || !form.adminPassword))) {
      setError('Complete the organization and initial administrator fields before creating a tenant.'); return;
    }
    setIsSubmitting(true); setError(null);
    try {
      const profile = Object.fromEntries(Object.entries(form.profile).filter(([, value]) => value.trim())) as TenantProfile;
      if (editingTenant) {
        await platformRequest('/api/platform/tenants/' + encodeURIComponent(editingTenant.id), { method: 'PATCH', body: JSON.stringify({ name: form.name, slug: form.slug, profile }) });
      } else {
        await platformRequest('/api/platform/tenants', { method: 'POST', body: JSON.stringify({ name:form.name, slug:form.slug, code:form.code, planTier:form.planTier, adminName:form.adminName, adminEmail:form.adminEmail, adminPassword:form.adminPassword, profile }) });
      }
      setForm(initialForm); setIsCreateOpen(false); setEditingTenant(null);
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
  const openTenantDetails = async (tenant: Tenant) => {
    setIsSubmitting(true); setError(null);
    try { const payload = await platformRequest('/api/platform/tenants/' + encodeURIComponent(tenant.id)); setDetailTenant(payload.data as TenantDetail); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to load tenant details.'); }
    finally { setIsSubmitting(false); }
  };
  const editTenant = async (tenant: Tenant) => {
    setIsSubmitting(true); setError(null);
    try {
      const payload = await platformRequest('/api/platform/tenants/' + encodeURIComponent(tenant.id));
      const detail = payload.data as TenantDetail;
      if (detail.lifecycleStatus === 'archived') throw new Error('Archived tenants are read-only.');
      setEditingTenant(detail);
      setForm({ ...initialForm, name:detail.name, slug:detail.slug, code:detail.code, planTier:(detail.planTier || 'starter') as PlanTier, profile:detail.profile || {} });
      setIsCreateOpen(true);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to load tenant for editing.'); }
    finally { setIsSubmitting(false); }
  };
  const archiveSelectedTenant = async (tenant: Tenant) => {
    setIsSubmitting(true); setError(null);
    try {
      await platformRequest('/api/platform/tenants/' + encodeURIComponent(tenant.id) + '/archive', { method:'POST', body:JSON.stringify({reason:'Archived from Tenant Management by platform operator.'}) });
      setArchiveTenant(null); await loadTenants();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to archive tenant.'); }
    finally { setIsSubmitting(false); }
  };
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
          <Button onClick={() => { setEditingTenant(null); setForm(initialForm); setIsCreateOpen(true); }} leftIcon={<Plus className="h-4 w-4" />}>Create Tenant</Button>
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
            { header: 'Actions', className: 'text-right', accessor: (tenant) => <div className="flex flex-wrap justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => void openTenantDetails(tenant)} leftIcon={<Eye className="h-4 w-4" />}>View</Button>
              {tenant.status !== 'archived' && <><Button variant="ghost" size="sm" onClick={() => void editTenant(tenant)} leftIcon={<Pencil className="h-4 w-4" />}>Edit</Button><Button variant={tenant.status === 'active' ? 'danger' : 'outline'} size="sm" onClick={() => setConfirmTenant(tenant)} leftIcon={tenant.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}>{tenant.status === 'active' ? 'Suspend' : 'Reactivate'}</Button><Button variant="ghost" size="sm" onClick={() => setArchiveTenant(tenant)} leftIcon={<Archive className="h-4 w-4" />}>Archive</Button></>}
              {tenant.status === 'archived' && <span className="self-center text-xs text-slate-500">Read-only</span>}
            </div> },
          ]} />
      </div>
      <Modal isOpen={isCreateOpen} onClose={() => !isSubmitting && setIsCreateOpen(false)} title={editingTenant ? 'Edit tenant organization' : 'Create tenant organization'} size="lg" closeOnEscape={!isSubmitting} closeOnBackdropClick={!isSubmitting}
        footer={<><Button variant="ghost" disabled={isSubmitting} onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button isLoading={isSubmitting} disabled={!form.name.trim() || !form.slug.trim() || (!editingTenant && (!form.adminName.trim() || !form.adminEmail.trim() || form.adminPassword.length < 12 || !/[a-z]/.test(form.adminPassword) || !/[A-Z]/.test(form.adminPassword) || !/[0-9]/.test(form.adminPassword)))} onClick={createTenant}>{editingTenant ? 'Save Changes' : 'Create Tenant'}</Button></>}>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          <div><h3 className="ui-section-title">Organization</h3><p className="ui-section-description">Tenant creation does not create or publish a Discovery listing.</p></div>
          <div className="ui-form-grid ui-form-grid--wide">
            <Input label="Organization name" value={form.name} onChange={(event) => setField('name', event.target.value)} required />
            <Input label="Tenant slug" value={form.slug} onChange={(event) => setField('slug', event.target.value.toLowerCase())} placeholder="acme-retail" required />
            <Input label="Tenant code" value={form.code} onChange={(event) => setField('code', event.target.value.toUpperCase())} placeholder="ACME_RETAIL" />
            <Select label="Initial plan tier" value={form.planTier} onChange={(event) => setField('planTier', event.target.value as PlanTier)} options={[{ value: 'starter', label: 'Starter' }, { value: 'professional', label: 'Professional' }, { value: 'enterprise', label: 'Enterprise' }]} />
          </div>
          <div className="border-t border-slate-200 pt-5 dark:border-slate-800"><h3 className="ui-section-title">Business, registration, contact and address details</h3><p className="ui-section-description">Optional profile fields are saved on the organization, independently of billing and Discovery moderation.</p></div>
          <div className="ui-form-grid ui-form-grid--wide">
            {PROFILE_FIELDS.map(([key, label]) => <Input key={key} label={label} value={form.profile[key] || ''} onChange={(event) => setForm(current => ({...current, profile:{...current.profile,[key]:event.target.value}}))} type={key.toLowerCase().includes('email') ? 'email' : key === 'website' ? 'url' : 'text'} />)}
          </div>
          {!editingTenant && <><div className="border-t border-slate-200 pt-5 dark:border-slate-800"><h3 className="ui-section-title">Initial administrator</h3><p className="ui-section-description">The password is hashed server-side and never returned by the API.</p></div>
          <div className="ui-form-grid ui-form-grid--wide">
            <Input label="Full name" value={form.adminName} onChange={(event) => setField('adminName', event.target.value)} required />
            <Input label="Email" type="email" value={form.adminEmail} onChange={(event) => setField('adminEmail', event.target.value)} required />
            <Input label="Temporary password" type="password" value={form.adminPassword} onChange={(event) => setField('adminPassword', event.target.value)} helperText="12–128 characters; include uppercase, lowercase, and a number." required />
          </div></>}
        </div>
      </Modal>
      <Modal isOpen={Boolean(detailTenant)} onClose={() => setDetailTenant(null)} title="Tenant details" size="lg" footer={<Button variant="outline" onClick={() => setDetailTenant(null)}>Close</Button>}>
        {detailTenant && <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <section><h3 className="ui-section-title">{detailTenant.name}</h3><p className="text-sm text-slate-500">{detailTenant.slug} · {detailTenant.code} · {detailTenant.lifecycleStatus}</p><p className="text-sm">Plan: {detailTenant.planTier} · Subscription: {detailTenant.subscription?.status || 'unknown'}</p><p className="text-sm">Users: {detailTenant.userCount} · Locations: {detailTenant.locationCount}</p></section>
          <section className="border-t pt-4"><h4 className="font-semibold">Organization profile</h4><dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">{PROFILE_FIELDS.map(([key,label]) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-sm">{detailTenant.profile?.[key] || '—'}</dd></div>)}</dl></section>
          <section className="border-t pt-4"><h4 className="font-semibold">Discovery listing</h4>{detailTenant.discoveryListing ? <><p className="text-sm">{detailTenant.discoveryListing.name} · {detailTenant.discoveryListing.listingStatus} · {detailTenant.discoveryListing.verificationStatus}</p><p className="text-xs text-slate-500">{detailTenant.discoveryListing.isDiscoverable ? 'Discoverability enabled' : 'Not currently discoverable'}. Listing review and publication remain separate.</p><Button className="mt-2" variant="outline" onClick={() => window.location.assign('/?tab=discovery-moderation')} leftIcon={<ExternalLink className="h-4 w-4" />}>Open Trust &amp; Moderation</Button></> : <p className="text-sm text-slate-500">No linked Discovery listing. A listing can be created separately when required.</p>}</section>
          <p className="text-xs text-slate-500">Created {new Date(detailTenant.createdAt).toLocaleString()} · Updated {new Date(detailTenant.updatedAt).toLocaleString()}</p>
        </div>}
      </Modal>
      <Modal isOpen={Boolean(archiveTenant)} onClose={() => !isSubmitting && setArchiveTenant(null)} title="Archive tenant?" size="sm" closeOnEscape={!isSubmitting} closeOnBackdropClick={!isSubmitting}
        footer={<><Button variant="ghost" disabled={isSubmitting} onClick={() => setArchiveTenant(null)}>Cancel</Button><Button variant="danger" isLoading={isSubmitting} onClick={() => archiveTenant && void archiveSelectedTenant(archiveTenant)}>Archive Tenant</Button></>}>
        <p>Archive {archiveTenant?.name}? This deactivates the organization and cancels non-terminal subscriptions. Historical records are retained; normal reactivation is not available.</p>
      </Modal>
      <Modal isOpen={Boolean(confirmTenant)} onClose={() => !isSubmitting && setConfirmTenant(null)} title={confirmTenant?.status === 'active' ? 'Suspend tenant?' : 'Reactivate tenant?'} size="sm" closeOnEscape={!isSubmitting} closeOnBackdropClick={!isSubmitting}
        footer={<><Button variant="ghost" disabled={isSubmitting} onClick={() => setConfirmTenant(null)}>Cancel</Button><Button variant={confirmTenant?.status === 'active' ? 'danger' : 'primary'} isLoading={isSubmitting} onClick={() => confirmTenant && setTenantState(confirmTenant)}>{confirmTenant?.status === 'active' ? 'Suspend Tenant' : 'Reactivate Tenant'}</Button></>}>
        <p>{confirmTenant?.status === 'active' ? `Suspending ${confirmTenant.name} blocks tenant authentication and business-plane access.` : `Reactivating ${confirmTenant?.name} restores access if its subscription state permits reactivation.`}</p>
      </Modal>
    </section>
  );
};
