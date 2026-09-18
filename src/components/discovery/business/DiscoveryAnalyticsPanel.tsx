import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Eye,
  MousePointer,
  Phone,
  Navigation,
  ExternalLink,
  MessageSquare,
  FileText,
  Calendar,
  Sparkles,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryAnalyticsSummary,
} from '../../../types/discovery';

interface DiscoveryAnalyticsPanelProps {
  business: DiscoveryBusiness;
}

export const DiscoveryAnalyticsPanel: React.FC<DiscoveryAnalyticsPanelProps> = ({
  business,
}) => {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [analytics, setAnalytics] = useState<DiscoveryAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true); setError(null);
    try {
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      const response = await discoveryApi.getBusinessAnalytics(business.id, days);
      setAnalytics(response.data);
    } catch (err: unknown) {
      setAnalytics(null);
      setError(err instanceof DiscoveryApiError ? err.message : 'Failed to load analytics.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void fetchAnalytics();
  }, [business.id, timeframe]);

  const cards = [
    {
      title: 'Discovery Impressions',
      value: analytics?.impressions ?? 0,
      icon: Eye,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      description: 'Times your business appeared in discovery search results',
    },
    {
      title: 'Profile Page Views',
      value: analytics?.profile_views ?? 0,
      icon: MousePointer,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      description: 'Direct visits to your business discovery overview',
    },
    {
      title: 'Phone & WhatsApp Leads',
      value: (analytics?.phone_clicks ?? 0) + (analytics?.whatsapp_clicks ?? 0),
      icon: Phone,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      description: 'High-intent calls and instant messaging inquiries',
    },
    {
      title: 'Turn-by-Turn Directions',
      value: analytics?.direction_clicks ?? 0,
      icon: Navigation,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      description: 'Navigation requests to your physical storefront',
    },
    {
      title: 'Service Quote Requests',
      value: analytics?.service_inquiries ?? 0,
      icon: FileText,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      description: 'Custom job and pricing quote submissions',
    },
    {
      title: 'Online Store Visits',
      value: analytics?.store_visits ?? 0,
      icon: ExternalLink,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      description: 'Transitions to digital checkout and cart',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Timeframe Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Discovery Reach & Engagement Analytics
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Track customer demand, foot-traffic intent, and lead conversion across your local presence.
            </p>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {(['7d', '30d', '90d'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  timeframe === tf
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tf === '7d' ? 'Last 7 Days' : tf === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {cards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    {card.title}
                  </span>
                  <div className={`p-2 rounded-xl ${card.bg} ${card.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                    {loading ? '...' : card.value.toLocaleString()}
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {card.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Engagement Funnel Insight */}
      <div className="p-6 rounded-3xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Conversion Performance
          </span>
          <p className="text-xs text-indigo-950 dark:text-indigo-200">
            Around <span className="font-bold font-mono">{((analytics?.conversion_rate ?? 0) * 100).toFixed(1)}%</span> of customers who view your listing proceed to place a phone inquiry, direction request, or service quote.
          </p>
        </div>
      </div>
    </div>
  );
};
