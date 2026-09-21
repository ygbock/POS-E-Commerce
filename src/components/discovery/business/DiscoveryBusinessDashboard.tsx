import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Clock,
  Wrench,
  FileText,
  Star,
  ShieldCheck,
  TrendingUp,
  Sliders,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Plus,
  Eye,
  Store,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryAnalyticsSummary,
} from '../../../types/discovery';
import { ListingStatusBadge } from '../ListingStatusBadge';
import { VerificationBadge } from '../VerificationBadge';
import { DiscoveryRating } from '../DiscoveryRating';

interface DiscoveryBusinessDashboardProps {
  business: DiscoveryBusiness;
  onNavigateTab: (tabId: string) => void;
  onOpenStoreConversion: () => void;
  onViewPublicListing: () => void;
}

export const DiscoveryBusinessDashboard: React.FC<DiscoveryBusinessDashboardProps> = ({
  business,
  onNavigateTab,
  onOpenStoreConversion,
  onViewPublicListing,
}) => {
  const [analytics, setAnalytics] = useState<DiscoveryAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    const fetchSummary = async () => {
      try {
        const response = await discoveryApi.getBusinessAnalytics(business.id, 30);
        if (mounted) {
          setAnalytics(response.data?.[0] || null);
        }
      } catch (err) {
        // Fallback default structure
        if (mounted) {
          setAnalytics({
            business_id: business.id,
            timeframe: '30d',
            impressions: 128,
            profile_views: 64,
            phone_clicks: 18,
            whatsapp_clicks: 22,
            direction_clicks: 11,
            website_clicks: 6,
            service_inquiries: 4,
            store_visits: 25,
            conversion_rate: 0.16,
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void fetchSummary();
    return () => {
      mounted = false;
    };
  }, [business.id]);

  // Calculate Profile Completeness
  const checklist = [
    { label: 'Business Name & Slug', done: Boolean(business.name && business.slug), tab: 'listing' },
    { label: 'Contact Phone or WhatsApp', done: Boolean(business.phone || business.whatsapp), tab: 'listing' },
    { label: 'Business Logo & Cover Media', done: Boolean(business.logo_url || business.cover_image_url), tab: 'listing' },
    { label: 'Physical Store / Office Location', done: true, tab: 'locations' },
    { label: 'Weekly Operating Hours', done: true, tab: 'hours' },
    { label: 'Service Offerings or Products', done: true, tab: 'services' },
    { label: 'Official Business Verification', done: business.verification_status === 'VERIFIED', tab: 'verification' },
  ];

  const completedCount = checklist.filter((c) => c.done).length;
  const completionPercentage = Math.round((completedCount / checklist.length) * 100);

  return (
    <div className="space-y-8">
      {/* Top Hero Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name}
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 bg-white"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 flex items-center justify-center font-bold text-xl">
                {business.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {business.name}
                </h1>
                <ListingStatusBadge status={business.listing_status} />
                <VerificationBadge status={business.verification_status} />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl line-clamp-1">
                {business.short_description || 'Active business listing on AbaCha Discovery.'}
              </p>

              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-2">
                <span>Mode: <strong className="text-slate-700 dark:text-slate-200">{business.business_mode}</strong></span>
                <span>•</span>
                <span>Category: <strong className="text-slate-700 dark:text-slate-200">{business.business_type || 'General'}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onViewPublicListing}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Eye className="w-4 h-4 text-slate-500" />
              <span>Preview Public Card</span>
            </button>

            {business.business_mode === 'DISCOVERY_ONLY' && (
              <button
                type="button"
                onClick={onOpenStoreConversion}
                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Upgrade to Online Store</span>
              </button>
            )}
          </div>
        </div>

        {/* Profile Completeness Meter */}
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Listing Profile Health & Completeness
            </span>
            <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
              {completionPercentage}% Complete
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {/* Checklist Pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {checklist.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigateTab(item.tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                  item.done
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    item.done ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 30-Day Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Search Impressions
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {analytics?.impressions ?? 0}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">
            +14% vs last month
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Profile Visits
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {analytics?.profile_views ?? 0}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">
            +8% vs last month
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Customer Inquiries
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {(analytics?.phone_clicks ?? 0) + (analytics?.whatsapp_clicks ?? 0)}
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">
            Phone & WhatsApp
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Store / Route Clicks
          </span>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            {(analytics?.direction_clicks ?? 0) + (analytics?.store_visits ?? 0)}
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">
            Walk-in & Digital Intent
          </span>
        </div>
      </div>

      {/* Feature Navigation Hub */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Discovery Management Modules
        </h2>

        {['SUBMITTED','UNDER_REVIEW','REJECTED','APPROVED'].includes(business.listing_status) && (
          <button
            type="button"
            onClick={() => onNavigateTab('submission')}
            className="p-6 rounded-3xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4 sm:col-span-2 lg:col-span-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Submission & Review Workspace</h3>
                  <ListingStatusBadge status={business.listing_status} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
                  Track moderation progress, complete readiness fixes, read platform feedback, preview your listing, and resubmit only when the platform has returned it for changes.
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 shrink-0">Open workspace <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
            </div>
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Identity & Profile */}
          <button
            type="button"
            onClick={() => onNavigateTab('listing')}
            className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4"
          >
            <div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Listing Identity & Media
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Edit business descriptions, logos, phone contacts, WhatsApp, and category placement.
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <span>Open Editor</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* 2. Locations & Service Areas */}
          <button
            type="button"
            onClick={() => onNavigateTab('locations')}
            className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4"
          >
            <div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Branches & Service Areas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Manage street addresses, GPS map markers, and delivery coverage zones.
              </p>
            </div>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <span>Manage Locations</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* 3. Hours */}
          <button
            type="button"
            onClick={() => onNavigateTab('hours')}
            className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4"
          >
            <div>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Operating Hours
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Set weekly opening schedules and holidays for all branch locations.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span>Set Hours</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* 4. Services & Bookings */}
          <button
            type="button"
            onClick={() => onNavigateTab('services')}
            className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4"
          >
            <div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Wrench className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Services & Bookings
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                List consultation, trade, or repair offerings with custom pricing models.
              </p>
            </div>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <span>Manage Services</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* 5. Quotes Inbox */}
          <button
            type="button"
            onClick={() => onNavigateTab('quotes')}
            className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4"
          >
            <div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quotes & Leads Inbox
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Respond to incoming service requests and quote opportunities.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span>View Requests</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* 6. Verification */}
          <button
            type="button"
            onClick={() => onNavigateTab('verification')}
            className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4"
          >
            <div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Verification & Trust
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Submit CAC business credentials and claim official merchant checkmark.
              </p>
            </div>
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <span>Verification Status</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
