import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, ShieldCheck, PauseCircle, PlayCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { Table } from '../ui/Table';
import { authClient } from '../../services/authClient';

type PlanTier = 'starter' | 'professional' | 'enterprise';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  code: string;
  status: 'active' | 'suspended';
  plan: PlanTier;
  createdAt: string;
}

interface CreateForm {
  name: string;
  slug: string;
  code: string;
  planTier: PlanTier;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

const initialForm: CreateForm = {
  name: '',
  slug: '',
  code: '',
  planTier: 'starter',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
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
  if (!response.ok) {
    throw new Error(payload.error?.message || `Platform request failed (${response.status})`);
  }
  return payload;
}

export const TenantManagementView: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmTenant, setConfirmTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<CreateForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTenants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await platformRequest('/api/platform/tenants');
      setTenants(payload.data || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load tenants.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const createTenant = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await platformRequest('/api/platform/tenants', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(initialForm);
      setIsCreateOpen(false);
      await loadTenants();
    } catch (err: any) {
      setError(err.message || 'Unable to create tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setTenantState = async (tenant: Tenant) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await platformRequest(`/api/platform/tenants/${encodeURIComponent(tenant.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: tenant.status !== 'active' }),
      });
      setConfirmTenant(null);
      await loadTenants();
    } catch (err: any) {
      setError(err.message || 'Unable to update tenant status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setField = <K extends keyof CreateForm>(field: K, value: CreateForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="ui-page space-y-6" aria-labelledby="tenant-management-title">
      <header className="ui-page-header">
        <div className="ui-page-header__copy">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Platform tenant lifecycle
          </div>
          <h1 id="tenant-management-title" className="ui-page-title">Tenant Management</h1>
          <p className="ui-page-description">
            Provision, activate, suspend, and change the plan tier of tenant organizations.
          </p>
        </div>
        <div className="ui-page-actions">
          <Button variant="outline" onClick={loadTenants} isLoading={isLoading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Create Tenant
          </Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="ui-surface overflow-hidden">
        <Table
          caption="Tenant organizations"
          data={tenants}
          isLoading={isLoading}
          emptyStateMessage="No tenant organizations have been provisioned."
          getRowKey={(tenant) => tenant.id}
          columns={[
            {
              header: 'Tenant',
              accessor: (tenant) => (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{tenant.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{tenant.slug}</div>
                  </div>
                </div>
              ),
            },
            { header: 'Code', accessor: (tenant) => <span className="font-mono text-xs">{tenant.code}</span> },
            { header: 'Plan', accessor: (tenant) => <span className="capitalize">{tenant.plan}</span> },
            {
              header: 'Status',
              accessor: (tenant) => (
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${tenant.status === 'active'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                  {tenant.status}
                </span>
              ),
            },
            {
              header: 'Actions',
              className: 'text-right',
              accessor: (tenant) => (
                <Button
                  variant={tenant.status === 'active' ? 'danger' : 'outline'}
                  size="sm"
                  onClick={() => setConfirmTenant(tenant)}
                  leftIcon={tenant.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                >
                  {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                </Button>
              ),
            },
          ]}
        />
      </div>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => !isSubmitting && setIsCreateOpen(false)}
        title="Create tenant organization"
        size="lg"
        closeOnEscape={!isSubmitting}
        closeOnBackdropClick={!isSubmitting}
        footer={
          <>
            <Button variant="ghost" disabled={isSubmitting} onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button isLoading={isSubmitting} onClick={createTenant}>Create Tenant</Button>
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="ui-section-title">Organization</h3>
            <p className="ui-section-description">The slug becomes the stable tenant URL identifier.</p>
          </div>
          <div className="ui-form-grid ui-form-grid--wide">
            <Input label="Organization name" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
            <Input label="Tenant slug" value={form.slug} onChange={(e) => setField('slug', e.target.value.toLowerCase())} placeholder="acme-retail" required />
            <Input label="Tenant code" value={form.code} onChange={(e) => setField('code', e.target.value.toUpperCase())} placeholder="ACME_RETAIL" />
            <Select label="Plan tier" value={form.planTier} onChange={(e) => setField('planTier', e.target.value as PlanTier)} options={[
              { value: 'starter', label: 'Starter' },
              { value: 'professional', label: 'Professional' },
              { value: 'enterprise', label: 'Enterprise' },
            ]} />
          </div>

          <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
            <h3 className="ui-section-title">Initial administrator</h3>
            <p className="ui-section-description">The password is hashed server-side and never returned by the API.</p>
          </div>
          <div className="ui-form-grid ui-form-grid--wide">
            <Input label="Full name" value={form.adminName} onChange={(e) => setField('adminName', e.target.value)} required />
            <Input label="Email" type="email" value={form.adminEmail} onChange={(e) => setField('adminEmail', e.target.value)} required />
            <Input label="Temporary password" type="password" value={form.adminPassword} onChange={(e) => setField('adminPassword', e.target.value)} helperText="Minimum 12 characters with upper, lower, and numeric characters." required />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(confirmTenant)}
        onClose={() => !isSubmitting && setConfirmTenant(null)}
        title={confirmTenant?.status === 'active' ? 'Suspend tenant?' : 'Activate tenant?'}
        size="sm"
        closeOnEscape={!isSubmitting}
        closeOnBackdropClick={!isSubmitting}
        footer={
          <>
            <Button variant="ghost" disabled={isSubmitting} onClick={() => setConfirmTenant(null)}>Cancel</Button>
            <Button
              variant={confirmTenant?.status === 'active' ? 'danger' : 'primary'}
              isLoading={isSubmitting}
              onClick={() => confirmTenant && setTenantState(confirmTenant)}
            >
              {confirmTenant?.status === 'active' ? 'Suspend Tenant' : 'Activate Tenant'}
            </Button>
          </>
        }
      >
        <p>
          {confirmTenant?.status === 'active'
            ? `Suspending ${confirmTenant.name} immediately blocks tenant authentication and business-plane access.`
            : `Activating ${confirmTenant?.name} restores tenant authentication and business-plane access.`}
        </p>
      </Modal>
    </section>
  );
};
