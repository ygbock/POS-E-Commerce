import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryAnalyticsSummary,
  DiscoveryBusiness,
  DiscoveryListingManagementWorkspace,
} from '../../../types/discovery';
import { ListingStatusBadge } from '../ListingStatusBadge';
import { VerificationBadge } from '../VerificationBadge';

interface DiscoveryBusinessDashboardProps {
  business: DiscoveryBusiness;
  onNavigateTab: (tabId: string) => void;
  onOpenStoreConversion: () => void;
  onViewPublicListing: () => void;
}

const readinessTabs: Record<string, string> = {
  identity: 'listing',
  description: 'listing',
  primary_contact: 'listing',
  category: 'listing',
  primary_location: 'locations',
  offering: 'services',
};

export const DiscoveryBusinessDashboard: React.FC<DiscoveryBusinessDashboardProps> = ({
  business,
  onNavigateTab,
  onOpenStoreConversion,
  onViewPublicListing,
}) => {
  const [analytics, setAnalytics] = useState<DiscoveryAnalyticsSummary | null>(null);
  const [workspace, setWorkspace] = useState<DiscoveryListingManagementWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [analyticsResponse, managementWorkspace] = await Promise.all([
          discoveryApi.getBusinessAnalytics(business.id, 30),
          discoveryApi.getListingManagementWorkspace(business.id),
        ]);

        if (!mounted) return;
        setAnalytics(analyticsResponse.data?.[0] || null);
        setWorkspace(managementWorkspace);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setAnalytics(null);
        setWorkspace(null);
        setError(
          err instanceof DiscoveryApiError
            ? err.message
            : 'Unable to load the latest business dashboard data.',
        );
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [business.id]);

  const readinessItems = workspace?.readiness.items || [];
  const completedCount = readinessItems.filter((item) => item.done).length;
  const completionPercentage = readinessItems.length
    ? Math.round((completedCount / readinessItems.length) * 100)
    : 0;

  const nextIncomplete = readinessItems.find((item) => item.required && !item.done);
  const nextActionTab = nextIncomplete ? (readinessTabs[nextIncomplete.key] || 'submission') : 'submission';
  const nextActionLabel = nextIncomplete
    ? `Complete ${nextIncomplete.label}`
    : business.listing_status === 'REJECTED'
      ? 'Review requested changes'
      : business.listing_status === 'DRAFT'
        ? 'Submit listing for review'
        : 'Review listing status';

  const modules = [
    {
      label: 'Listing Identity & Media',
      description: 'Business description, contacts, logo, cover media and categories.',
      icon: Building2,
      tab: 'listing',
    },
    {
      label: 'Branches & Service Areas',
      description: 'Addresses, GPS coordinates, branches and coverage areas.',
      icon: MapPin,
      tab: 'locations',
    },
    {
      label: 'Services & Bookings',
      description: 'Publish services and configure request, booking or quote options.',
      icon: Wrench,
      tab: 'services',
    },
    {
      label: 'Quotes & Leads',
      description: 'Respond to customer service requests and quote opportunities.',
      icon: FileText,
      tab: 'quotes',
    },
    {
      label: 'Verification & Trust',
      description: 'Manage business verification and trust information.',
      icon: ShieldCheck,
      tab: 'verification',
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row">
          <div className="flex items-start gap-4">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name}
                className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-cover dark:border-slate-700"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-xl font-bold text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/60">
                {business.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {business.name}
                </h1>
                <ListingStatusBadge status={business.listing_status} />
                <VerificationBadge status={business.verification_status} />
              </div>
              <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
                {business.short_description || 'Manage your AbaCha Discovery presence.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Mode: <strong>{business.business_mode === 'DISCOVERY_AND_STORE' ? 'Discovery + Store' : 'Discovery only'}</strong>
                </span>
                <span>
                  Category: <strong>{business.business_type || 'Not specified'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onViewPublicListing}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            {business.business_mode === 'DISCOVERY_ONLY' && (
              <button
                type="button"
                onClick={onOpenStoreConversion}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Sparkles className="h-4 w-4" />
                Upgrade to Store
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Listing readiness
            </span>
            <span className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
              {workspace ? `${completionPercentage}%` : '—'}
            </span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {readinessItems.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.detail || undefined}
                onClick={() => onNavigateTab(readinessTabs[item.key] || 'submission')}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  item.done
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${item.done ? 'text-emerald-600' : 'text-slate-400'}`} />
                {item.label}
              </button>
            ))}
          </div>

          {workspace && !workspace.readiness.ready && (
            <div className="mt-4 flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20 sm:flex-row sm:items-center">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Complete all required readiness items before submitting this listing for review.
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('submission')}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-200"
              >
                Open submission checklist <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-900 dark:bg-indigo-950/30">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm dark:bg-slate-900">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Next action</p>
              <h2 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{nextActionLabel}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {nextIncomplete?.detail || (business.listing_status === 'PUBLISHED'
                  ? 'Your listing is live. Keep your profile, services and customer activity up to date.'
                  : 'Use the guided workspace to move the listing to its next lifecycle stage.')}
              </p>
              <button type="button" onClick={() => onNavigateTab(nextActionTab)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700">
                Continue setup <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick actions</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ['Add service', 'services', Wrench],
              ['Add location', 'locations', MapPin],
              ['View requests', 'quotes', FileText],
              ['Edit listing', 'listing', Building2],
            ].map(([label, tab, Icon]) => (
              <button key={String(tab)} type="button" onClick={() => onNavigateTab(String(tab))}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Icon className="h-4 w-4 text-indigo-600" /> {String(label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Dashboard data unavailable.</strong> {error}
          </div>
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Discovery performance</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Real activity recorded during the last 30 days.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ['Search impressions', analytics?.impressions ?? 0],
            ['Profile visits', analytics?.profile_views ?? 0],
            ['Customer inquiries', (analytics?.phone_clicks ?? 0) + (analytics?.whatsapp_clicks ?? 0)],
            ['Store / route clicks', (analytics?.direction_clicks ?? 0) + (analytics?.store_visits ?? 0)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
              <div className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</div>
              <span className="mt-1 block text-[10px] text-slate-400">Last 30 days</span>
            </div>
          ))}
        </div>
      </section>

      {workspace?.lifecycle?.length ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent activity</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest listing lifecycle changes.</p>
            </div>
            <Clock3 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-3">
            {workspace.lifecycle.slice(0, 4).map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{event.to_status.replace(/_/g, ' ')}</p>
                  {event.reason && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{event.reason}</p>}
                </div>
                <time className="shrink-0 text-[10px] text-slate-400">{new Date(event.created_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Discovery management</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ label, description, icon: Icon, tab }) => (
            <button
              key={tab}
              type="button"
              onClick={() => onNavigateTab(tab)}
              className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{label}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                Manage <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
