import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  RefreshCw,
  Settings,
  ShoppingBag,
  Users,
  Wrench,
} from 'lucide-react';
import { authClient } from '../../services/authClient';
import { DiscoveryBusinessContainer } from '../discovery/business/DiscoveryBusinessContainer';

type Business = {
  id: string;
  name: string;
  slug?: string;
  business_mode: string;
  listing_status: string;
  verification_status: string;
  is_discoverable: boolean;
  membership_role: 'OWNER' | 'MANAGER' | 'STAFF' | string;
};

type MerchantOverview = {
  business: Business & { tenant_slug?: string | null };
  discovery: {
    categories: number;
    locations: number;
    activeServices: number;
    activeMembers: number;
    openRequests: number;
    quotedRequests: number;
    openContacts: number;
    pendingReviews: number;
    publishedReviews: number;
    rating: string;
  };
  commerce: {
    products: number;
    variants: number;
    activeProducts: number;
    availableStock: string;
    outOfStockVariants: number;
    orders30d: number;
    openOrders: number;
    grossSales30d: string;
    customers: number;
  } | null;
  readiness: {
    listing: boolean;
    catalog: boolean;
    inventory: boolean;
    storefront: boolean;
  };
};

type OverviewMap = Record<string, MerchantOverview>;

const getAuthHeaders = () => authClient.getAuthHeaders();

const loadOverview = async (businessId: string): Promise<MerchantOverview> => {
  const response = await fetch(`/api/merchant/businesses/${encodeURIComponent(businessId)}/overview`, {
    headers: getAuthHeaders(),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Unable to load business operating summary.');
  }
  return payload.data as MerchantOverview;
};

const readinessItems = (overview?: MerchantOverview) => {
  if (!overview) return [];
  return [
    { key: 'listing', label: 'Discovery listing', done: overview.readiness.listing },
    { key: 'catalog', label: 'Catalog', done: overview.readiness.catalog },
    { key: 'inventory', label: 'Inventory', done: overview.readiness.inventory },
    { key: 'storefront', label: 'Storefront', done: overview.readiness.storefront },
  ];
};

const readinessPercent = (overview?: MerchantOverview) => {
  const items = readinessItems(overview);
  if (!items.length) return 0;
  return Math.round((items.filter((item) => item.done).length / items.length) * 100);
};

const numberValue = (value: string | number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : String(value);
};

export const BusinessOwnerPortal: React.FC = () => {
  const [data, setData] = useState<{ user: any; businesses: Business[] } | null>(null);
  const [overviews, setOverviews] = useState<OverviewMap>({});
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [overviewError, setOverviewError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/merchant/me', { headers: getAuthHeaders() });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || 'Unable to load merchant workspace.');
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load merchant workspace.');
    } finally {
      setLoading(false);
    }
  };

  const loadOverviews = async (businesses: Business[]) => {
    if (!businesses.length) {
      setOverviews({});
      return;
    }

    setOverviewLoading(true);
    setOverviewError('');
    const results = await Promise.allSettled(
      businesses.map(async (business) => [business.id, await loadOverview(business.id)] as const),
    );

    const next: OverviewMap = {};
    let failed = false;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        next[result.value[0]] = result.value[1];
      } else {
        failed = true;
      }
    }

    setOverviews(next);
    if (failed) setOverviewError('Some operating summaries could not be loaded. Retry to refresh them.');
    setOverviewLoading(false);
  };

  useEffect(() => {
    if (!authClient.getToken() && !authClient.getUser()) {
      window.location.assign('/business/signin');
      return;
    }
    void load();
  }, []);

  useEffect(() => {
    if (data?.businesses) void loadOverviews(data.businesses);
  }, [data?.businesses]);

  const businesses = data?.businesses || [];
  const onboardingRequested = new URLSearchParams(window.location.search).get('onboarding') === '1';

  const portfolio = useMemo(() => {
    const summaries = businesses.map((business) => overviews[business.id]).filter(Boolean);
    return {
      orders30d: summaries.reduce((sum, item) => sum + (item.commerce?.orders30d || 0), 0),
      openOrders: summaries.reduce((sum, item) => sum + (item.commerce?.openOrders || 0), 0),
      customers: summaries.reduce((sum, item) => sum + (item.commerce?.customers || 0), 0),
      openRequests: summaries.reduce((sum, item) => sum + item.discovery.openRequests, 0),
      openContacts: summaries.reduce((sum, item) => sum + item.discovery.openContacts, 0),
      outOfStock: summaries.reduce((sum, item) => sum + (item.commerce?.outOfStockVariants || 0), 0),
    };
  }, [businesses, overviews]);

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const specificBusinessId = pathParts.length > 1 && pathParts[0] === 'business' && pathParts[1] !== 'signup' && pathParts[1] !== 'signin' ? pathParts[1] : null;

  if (specificBusinessId) {
    return <DiscoveryBusinessContainer initialBusinessId={specificBusinessId} openOnboarding={onboardingRequested} onNavigateCustomerDiscovery={(path) => window.location.assign(path)} />;
  }

  if (onboardingRequested || businesses.length === 0) {
    return <DiscoveryBusinessContainer openOnboarding={onboardingRequested || businesses.length === 0} onNavigateCustomerDiscovery={(path) => window.location.assign(path)} />;
  }

  const handleRefresh = async () => {
    await load();
  };

  const handleLogout = async () => {
    await authClient.logout();
    window.location.assign('/business/signin');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading your merchant workspace…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 dark:bg-slate-950">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Merchant workspace</h1>
          </div>
          <p className="mt-3 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/50">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AbaCha Merchant</p>
              <h1 className="text-lg font-extrabold">Operating Workspace</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-600 sm:block dark:text-slate-300">{data?.user?.name}</span>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Refresh merchant workspace"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${overviewLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        <section>
          <p className="text-sm font-semibold text-indigo-600">Merchant command center</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Welcome back{data?.user?.name ? `, ${data.user.name.split(' ')[0]}` : ''}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            See what needs attention across your businesses, then jump directly into the operational workspace.
          </p>
        </section>

        {businesses.length > 0 && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Businesses', businesses.length, Building2],
              ['Orders · 30d', portfolio.orders30d, ShoppingBag],
              ['Open orders', portfolio.openOrders, ClipboardList],
              ['Customers', portfolio.customers, Users],
              ['Open requests', portfolio.openRequests, Wrench],
              ['Out of stock', portfolio.outOfStock, Package],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <Icon className="h-4 w-4 text-indigo-600" />
                <p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-black">{numberValue(value as number)}</p>
              </div>
            ))}
          </section>
        )}

        {overviewError && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{overviewError}</span>
          </div>
        )}

        {businesses.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <Building2 className="mx-auto h-10 w-10 text-indigo-600" />
            <h3 className="mt-4 text-lg font-bold">Create your first business</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Your owner account is ready. Create a business to begin Discovery onboarding and, where enabled, Store operations.
            </p>
            <button
              type="button"
              onClick={() => window.location.assign('/business?onboarding=1')}
              className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              Create business
            </button>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">Your businesses</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Operational status, readiness and outstanding work.</p>
              </div>
              <button
                type="button"
                onClick={() => window.location.assign('/business?onboarding=1')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Building2 className="h-4 w-4 text-indigo-600" /> Add business
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {businesses.map((business) => {
                const overview = overviews[business.id];
                const readiness = readinessPercent(overview);
                const items = readinessItems(overview);
                const attention = [
                  ...items.filter((item) => !item.done).map((item) => item.label),
                  ...(overview?.discovery.openRequests ? [`${overview.discovery.openRequests} service request(s) need attention`] : []),
                  ...(overview?.discovery.openContacts ? [`${overview.discovery.openContacts} customer message(s) need attention`] : []),
                  ...(overview?.commerce?.outOfStockVariants ? [`${overview.commerce.outOfStockVariants} variant(s) are out of stock`] : []),
                ].slice(0, 4);

                return (
                  <article key={business.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 shrink-0 text-indigo-600" />
                            <h4 className="truncate text-base font-extrabold">{business.name}</h4>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {business.business_mode === 'DISCOVERY_AND_STORE' ? 'Discovery + Store' : 'Discovery only'}
                            {' · '}
                            {business.membership_role}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {business.listing_status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="mt-5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold">Operational readiness</span>
                          <span className="font-black text-indigo-600">{readiness}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${readiness}%` }} />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {items.map((item) => (
                          <div key={item.key} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] dark:bg-slate-800/60">
                            {item.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
                            <span className="font-semibold">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 divide-x border-b border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                      <div className="p-4">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Orders · 30d</p>
                        <p className="mt-1 text-lg font-black">{numberValue(overview?.commerce?.orders30d || 0)}</p>
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Customers</p>
                        <p className="mt-1 text-lg font-black">{numberValue(overview?.commerce?.customers || 0)}</p>
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Requests</p>
                        <p className="mt-1 text-lg font-black">{numberValue(overview?.discovery.openRequests || 0)}</p>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <Settings className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold">Needs attention</p>
                          {overview ? (
                            attention.length ? (
                              <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                                {attention.map((item) => <li key={item}>• {item}</li>)}
                              </ul>
                            ) : (
                              <p className="mt-2 text-xs text-emerald-600">No outstanding operational alerts.</p>
                            )
                          ) : (
                            <p className="mt-2 text-xs text-slate-400">Loading operating summary…</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => window.location.assign(`/business/${business.id}`)}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                        >
                          Open workspace <ChevronRight className="h-4 w-4" />
                        </button>
                        {business.listing_status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => window.location.assign(`/business/${business.id}?onboarding=1`)}
                            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                          >
                            Continue setup
                          </button>
                        )}
                      </div>

                      {business.business_mode === 'DISCOVERY_AND_STORE' && (
                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quick operations</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              { label: 'Catalog', workspace: 'catalog', icon: Package },
                              { label: 'Inventory', workspace: 'inventory', icon: ClipboardList },
                              { label: 'Orders', workspace: 'orders', icon: ShoppingBag },
                              { label: 'POS', workspace: 'pos', icon: BarChart3 },
                            ].map(({ label, workspace, icon: Icon }) => (
                              <button
                                key={workspace}
                                type="button"
                                onClick={() => window.location.assign(`/?workspace=${workspace}&businessId=${encodeURIComponent(business.id)}`)}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                <Icon className="h-3.5 w-3.5 text-indigo-600" />
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Business administration</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            { label: 'Users', workspace: 'users', icon: Users },
                            { label: 'Locations', workspace: 'locations', icon: MapPin },
                            { label: 'Customers', workspace: 'crm', icon: Users },
                            { label: 'Suppliers', workspace: 'suppliers', icon: Wrench },
                          ].map(({ label, workspace, icon: Icon }) => (
                            <button
                              key={workspace}
                              type="button"
                              onClick={() => window.location.assign(`/?workspace=${workspace}&businessId=${encodeURIComponent(business.id)}`)}
                              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Icon className="h-3.5 w-3.5 text-indigo-600" />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {businesses.length > 0 && (
          <section className="grid gap-4 md:grid-cols-3">
            {[
              { label: 'Catalog & inventory', description: 'Manage products, variants and stock after opening the business workspace.', icon: Package },
              { label: 'Customers & orders', description: 'Move from the overview into customer, order and purchasing operations.', icon: Users },
              { label: 'Discovery & growth', description: 'Manage listings, services, requests, reviews, trust and analytics.', icon: BarChart3 },
            ].map(({ label, description, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <Icon className="h-5 w-5 text-indigo-600" />
                <h4 className="mt-3 text-sm font-bold">{label}</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};
