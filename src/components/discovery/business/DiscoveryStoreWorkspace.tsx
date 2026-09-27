import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Package, Boxes, ShoppingBag, Settings2, RefreshCw, AlertCircle, Store } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness } from '../../../types/discovery';

interface Props {
  business: DiscoveryBusiness;
}

type StoreReadiness = Awaited<ReturnType<typeof discoveryApi.getStoreReadiness>>;

export const DiscoveryStoreWorkspace: React.FC<Props> = ({ business }) => {
  const [data, setData] = useState<StoreReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await discoveryApi.getStoreReadiness(business.id));
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load store setup status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [business.id]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
        <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Checking store setup…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-8 dark:border-rose-900 dark:bg-slate-900">
        <AlertCircle className="h-6 w-6 text-rose-500" />
        <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Store setup unavailable</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error || 'Unable to determine store readiness.'}</p>
        <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Retry
        </button>
      </div>
    );
  }

  const storePath = data.tenantSlug ? '/store/' + encodeURIComponent(data.tenantSlug) : null;
  const workspace = (tab: string) => '/?workspace=' + encodeURIComponent(tab) + '&businessId=' + encodeURIComponent(business.id);

  const actions = [
    { key: 'catalog', label: 'Manage Catalog', description: data.counts.products + ' products · ' + data.counts.variants + ' variants', icon: Package, path: workspace('catalog') },
    { key: 'inventory', label: 'Manage Inventory', description: 'Stock, movements and transfers', icon: Boxes, path: workspace('inventory') },
    { key: 'orders', label: 'Manage Orders', description: 'Storefront and POS fulfillment', icon: ShoppingBag, path: workspace('orders') },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm dark:border-emerald-900 dark:from-emerald-950/30 dark:to-slate-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <Store className="h-4 w-4" /> Store workspace
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{data.storeName || business.name}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {data.tenantSlug ? 'Public storefront: /store/' + data.tenantSlug : 'Storefront slug is not configured yet.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {storePath && (
              <button type="button" onClick={() => window.location.assign(storePath)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                Open Storefront <ExternalLink className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Currency', data.currency.code + ' (' + data.currency.symbol + ')'],
          ['Products', String(data.counts.products)],
          ['Variants', String(data.counts.variants)],
          ['Locations', String(data.locations.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Store setup</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Server-verified configuration and onboarding status.</p>
          </div>
          <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (data.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
            {data.ready ? 'Ready for catalog setup' : 'Setup required'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {data.steps.map((step) => (
            <div key={step.key} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              {step.complete ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{step.label}</p>
                <p className="text-xs text-slate-400">{step.complete ? 'Configured' : step.required ? 'Required' : 'Not configured yet'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.key} type="button" onClick={() => window.location.assign(action.path)} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700">
              <Icon className="h-7 w-7 text-indigo-600" />
              <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{action.label}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{action.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">Open workspace →</span>
            </button>
          );
        })}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-0.5 h-5 w-5 text-slate-500" />
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Commerce configuration</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Online checkout is {data.onlineCheckoutEnabled ? 'enabled' : 'disabled'}, and the inventory ledger is {data.inventoryLedgerEnabled ? 'enabled' : 'disabled'}.
              Store configuration remains tenant-scoped and is read from the server.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
