import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Filter,
  Flag,
  Globe,
  HelpCircle,
  History,
  Info,
  Layers,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { authClient } from '../../services/authClient';

interface ListingQueueMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

type Queue = 'listings' | 'verification' | 'claims' | 'reviews' | 'reports' | 'history' | 'search';

interface SearchRankingConfig {
  id: string;
  text_match_weight: number;
  exact_match_weight: number;
  prefix_match_weight: number;
  verified_weight: number;
  rating_weight: number;
  review_count_weight: number;
  fuzzy_match_weight: number;
  distance_penalty_weight: number;
  availability_weight: number;
  is_active: boolean;
  updated_by_user_id?: string | null;
  updated_at?: string | null;
}

interface SearchAnalytics {
  windowDays: number;
  summary: {
    searches?: number;
    zero_result_searches?: number;
    unique_queries?: number;
    impressions?: number;
    result_engagements?: number;
  };
  popularQueries: Array<{ query_hash: string; searches: number; zero_results: number }>;
  queryPrivacy: string;
}

interface ModerationItem {
  id: string;
  business_id?: string;
  business_name?: string;
  service_name?: string;
  organization_id?: string | null;
  status: string;
  listing_status?: string;
  created_at: string;
  claimant_user_id?: string;
  [key: string]: unknown;
}

interface QueueSummary {
  listings: Record<string, number>;
  verification: Record<string, number>;
  claims: Record<string, number>;
  reviews: Record<string, number>;
  reports: Record<string, number>;
}

const queueMeta: Record<Queue, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  listings: {
    label: 'Listings',
    description: 'Business listings awaiting platform moderation and publication decisions.',
    icon: <ShieldCheck className="w-4 h-4" />,
    color: 'text-indigo-600 dark:text-indigo-400',
  },
  verification: {
    label: 'Verification',
    description: 'Official legal business verification applications.',
    icon: <ShieldCheck className="w-4 h-4" />,
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  claims: {
    label: 'Claims',
    description: 'Ownership claims for unowned or contested discovery listings.',
    icon: <UserCheck className="w-4 h-4" />,
    color: 'text-blue-600 dark:text-blue-400',
  },
  reviews: {
    label: 'Reviews',
    description: 'Customer reviews awaiting content policy moderation.',
    icon: <FileCheck2 className="w-4 h-4" />,
    color: 'text-amber-600 dark:text-amber-400',
  },
  reports: {
    label: 'Reports',
    description: 'Business and service abuse, scam, or inaccuracy reports.',
    icon: <Flag className="w-4 h-4" />,
    color: 'text-rose-600 dark:text-rose-400',
  },
  history: {
    label: 'History',
    description: 'Immutable moderation audit log and state transition timeline.',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-slate-600 dark:text-slate-400',
  },
  search: {
    label: 'Search',
    description: 'Search quality analytics and platform ranking controls.',
    icon: <BarChart3 className="w-4 h-4" />,
    color: 'text-purple-600 dark:text-purple-400',
  },
};

async function platformRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authClient.getAuthHeaders(),
      ...(options?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new Error(body.error?.message || `Request failed with status ${response.status}`);
  }
  return body.data as T;
}

export const PlatformDiscoveryModerationView: React.FC = () => {
  const [queue, setQueue] = useState<Queue>('listings');
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [selectedListing, setSelectedListing] = useState<ModerationItem | null>(null);
  const [listingDetail, setListingDetail] = useState<any>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingIssues, setListingIssues] = useState<Record<string, string>>({});
  const [modalTab, setModalTab] = useState<'profile' | 'location' | 'services' | 'readiness' | 'history'>('profile');
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({});

  // Filter states
  const [reportsFilter, setReportsFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('PENDING');
  const [claimsFilter, setClaimsFilter] = useState('PENDING');
  const [reviewsFilter, setReviewsFilter] = useState('PENDING');
  const [historyEntityType, setHistoryEntityType] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // Listing filters
  const [listingStatusFilter, setListingStatusFilter] = useState('SUBMITTED');
  const [listingSearch, setListingSearch] = useState('');
  const [listingModeFilter, setListingModeFilter] = useState('');
  const [listingVerificationFilter, setListingVerificationFilter] = useState('');
  const [listingIssuesFilter, setListingIssuesFilter] = useState('');
  const [listingPage, setListingPage] = useState(1);
  const [listingPageSize, setListingPageSize] = useState(25);
  const [listingMeta, setListingMeta] = useState<ListingQueueMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  // Search analytics & ranking
  const [searchAnalytics, setSearchAnalytics] = useState<SearchAnalytics | null>(null);
  const [searchRanking, setSearchRanking] = useState<SearchRankingConfig | null>(null);
  const [searchDays, setSearchDays] = useState(30);
  const [searchSaving, setSearchSaving] = useState(false);
  const [searchDirty, setSearchDirty] = useState(false);

  // Listing creation dialog
  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [createListingName, setCreateListingName] = useState('');
  const [createListingBusy, setCreateListingBusy] = useState(false);

  // Load summary metrics across queues
  const loadSummary = useCallback(async () => {
    try {
      const data = await platformRequest<QueueSummary>('/api/platform/discovery/moderation/summary');
      setSummary(data);
    } catch {
      // Non-critical metric endpoint
    }
  }, []);

  const endpoint = useMemo(() => {
    if (queue === 'listings') {
      return `/api/platform/discovery/moderation/listings?status=${encodeURIComponent(
        listingStatusFilter
      )}&page=${listingPage}&pageSize=${listingPageSize}&search=${encodeURIComponent(
        listingSearch
      )}&mode=${encodeURIComponent(listingModeFilter)}&verification=${encodeURIComponent(
        listingVerificationFilter
      )}&hasIssues=${encodeURIComponent(listingIssuesFilter)}`;
    }
    if (queue === 'reports') {
      return `/api/platform/discovery/moderation/reports${reportsFilter ? `?status=${encodeURIComponent(reportsFilter)}` : ''}`;
    }
    if (queue === 'verification') {
      return `/api/platform/discovery/moderation/verification${verificationFilter ? `?status=${encodeURIComponent(verificationFilter)}` : ''}`;
    }
    if (queue === 'claims') {
      return `/api/platform/discovery/moderation/claims${claimsFilter ? `?status=${encodeURIComponent(claimsFilter)}` : ''}`;
    }
    if (queue === 'reviews') {
      return `/api/platform/discovery/moderation/reviews?status=${encodeURIComponent(reviewsFilter)}`;
    }
    if (queue === 'search') {
      return `/api/platform/discovery/search-analytics?days=${searchDays}`;
    }
    if (queue === 'history') {
      const q = new URLSearchParams({ limit: '100' });
      if (historyEntityType) q.set('entityType', historyEntityType);
      if (historySearch) q.set('search', historySearch);
      return `/api/platform/discovery/moderation/history?${q.toString()}`;
    }
    return `/api/platform/discovery/moderation/${queue}`;
  }, [
    queue,
    reportsFilter,
    verificationFilter,
    claimsFilter,
    reviewsFilter,
    historyEntityType,
    historySearch,
    listingStatusFilter,
    listingPage,
    listingPageSize,
    listingSearch,
    listingModeFilter,
    listingVerificationFilter,
    listingIssuesFilter,
    searchDays,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (queue === 'listings') {
        const response = await fetch(endpoint, {
          headers: { 'Content-Type': 'application/json', ...authClient.getAuthHeaders() },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(body.error?.message || `Request failed with status ${response.status}`);
        }
        setItems(body.data as ModerationItem[]);
        setListingMeta(
          body.meta || {
            page: listingPage,
            pageSize: listingPageSize,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          }
        );
      } else if (queue === 'search') {
        const analytics = await platformRequest<SearchAnalytics>(endpoint);
        setSearchAnalytics(analytics);
        setSearchRanking(await platformRequest<SearchRankingConfig>('/api/platform/discovery/search-ranking'));
        setSearchDirty(false);
        setItems([]);
      } else {
        setItems(await platformRequest<ModerationItem[]>(endpoint));
      }
      void loadSummary();
    } catch (err: any) {
      setError(err?.message || 'Unable to load moderation queue.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, listingPage, listingPageSize, queue, loadSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPlatformListing = async () => {
    const name = createListingName.trim();
    if (name.length < 2 || name.length > 255) {
      setError('Business name must be between 2 and 255 characters.');
      return;
    }
    setCreateListingBusy(true);
    setError(null);
    try {
      await platformRequest<ModerationItem>('/api/platform/discovery/moderation/listings', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setCreateListingName('');
      setCreateListingOpen(false);
      setListingStatusFilter('DRAFT');
      setListingPage(1);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Unable to create Discovery listing.');
    } finally {
      setCreateListingBusy(false);
    }
  };

  const openListing = async (item: ModerationItem) => {
    setSelectedListing(item);
    setListingDetail(null);
    setListingIssues({});
    setModalTab('profile');
    setListingLoading(true);
    try {
      setListingDetail(
        await platformRequest<any>(`/api/platform/discovery/moderation/listings/${encodeURIComponent(item.id)}`)
      );
    } catch (err: any) {
      setError(err?.message || 'Unable to load listing details.');
    } finally {
      setListingLoading(false);
    }
  };

  const decideListing = async (status: string) => {
    if (!selectedListing) return;
    const selectedIssues = Object.entries(listingIssues)
      .filter(([, detail]) => detail !== undefined)
      .map(([key, detail]) => ({ key, detail }));
    const note = reason[selectedListing.id]?.trim() || '';
    if (status === 'REJECTED' && !note && selectedIssues.length === 0) {
      setError('Select at least one issue or provide an overall rejection note.');
      return;
    }
    setBusyId(selectedListing.id);
    try {
      await platformRequest(
        `/api/platform/discovery/moderation/listings/${encodeURIComponent(selectedListing.id)}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({ status, reason: note || undefined, issues: selectedIssues }),
        }
      );
      setSelectedListing(null);
      setListingDetail(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Unable to apply listing decision.');
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (item: ModerationItem, status: string) => {
    const currentReason = reason[item.id]?.trim() || '';
    if (!currentReason && (status === 'REJECTED' || status === 'HIDDEN' || status === 'DISMISSED')) {
      setError('A reason is required when rejecting, hiding, or dismissing an item.');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      const path = `/api/platform/discovery/moderation/${queue}/${encodeURIComponent(item.id)}/decision`;
      const body =
        queue === 'reports'
          ? { status, note: currentReason || undefined }
          : { status, reason: currentReason || undefined };
      await platformRequest(path, { method: 'POST', body: JSON.stringify(body) });
      setReason((prev) => ({ ...prev, [item.id]: '' }));
      await load();
    } catch (err: any) {
      setError(err?.message || 'Unable to apply moderation decision.');
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (status: string) => {
    const positive = ['APPROVED', 'PUBLISHED', 'RESOLVED', 'VERIFIED'];
    const negative = ['REJECTED', 'HIDDEN', 'DISMISSED', 'SUSPENDED'];
    const neutral = ['DRAFT', 'PAUSED', 'ARCHIVED', 'UNVERIFIED'];
    const cls = positive.includes(status)
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
      : negative.includes(status)
      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
      : neutral.includes(status)
      ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800';
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${cls}`}
      >
        {status}
      </span>
    );
  };

  const getPendingCountForQueue = (key: Queue): number => {
    if (!summary) return 0;
    if (key === 'listings') {
      return (summary.listings.submitted || 0) + (summary.listings.under_review || 0);
    }
    if (key === 'verification') {
      return summary.verification.pending || 0;
    }
    if (key === 'claims') {
      return summary.claims.pending || 0;
    }
    if (key === 'reviews') {
      return summary.reviews.pending || 0;
    }
    if (key === 'reports') {
      return (summary.reports.pending || 0) + (summary.reports.under_review || 0);
    }
    return 0;
  };

  // Preset reason templates for faster moderation
  const applyPresetReason = (itemId: string, text: string) => {
    setReason((prev) => ({
      ...prev,
      [itemId]: prev[itemId] ? `${prev[itemId]} — ${text}` : text,
    }));
  };

  // Structured Evidence Renderer for Verification and Claims
  const renderStructuredEvidence = (evidence: unknown, itemId: string) => {
    if (!evidence || typeof evidence !== 'object') {
      return <p className="text-xs text-slate-400 italic">No evidence document payload provided.</p>;
    }
    const ev = evidence as Record<string, unknown>;
    const keys = Object.keys(ev);
    if (keys.length === 0) {
      return <p className="text-xs text-slate-400 italic">Empty evidence record.</p>;
    }

    const isExpanded = Boolean(expandedJson[itemId]);

    return (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {keys.map((k) => {
            const val = ev[k];
            const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—');
            const isUrl = typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
            return (
              <div
                key={k}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {k.replace(/_/g, ' ')}
                </div>
                {isUrl ? (
                  <a
                    href={val as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400 truncate max-w-full"
                  >
                    View Document <ArrowRight className="w-3 h-3" />
                  </a>
                ) : (
                  <div className="mt-0.5 text-xs font-medium text-slate-800 dark:text-slate-200 break-words">
                    {strVal}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setExpandedJson((prev) => ({ ...prev, [itemId]: !prev[itemId] }))}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 inline-flex items-center gap-1"
          >
            {isExpanded ? 'Hide Raw JSON' : 'Inspect Raw Technical JSON'}
          </button>
        </div>
        {isExpanded && (
          <pre className="max-h-52 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200 font-mono">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-6" aria-labelledby="platform-discovery-moderation-title">
      {/* Top Banner / Header */}
      <header className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50 to-indigo-50/30 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Platform Trust & Safety
              </span>
              <span className="text-xs font-semibold text-slate-400">
                Server-Authoritative Moderation Engine
              </span>
            </div>
            <h1
              id="platform-discovery-moderation-title"
              className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl"
            >
              Discovery Trust & Moderation
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Centrally inspect, verify, and enforce quality across Sierra Leone directory listings, business ownership claims, customer reviews, and abuse reports. Decisions write to an immutable trust event ledger.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {queue === 'listings' && (
              <button
                type="button"
                onClick={() => {
                  setCreateListingOpen(true);
                  setError(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
              >
                <Plus className="h-4 w-4" />
                Create listing
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 active:scale-95 transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh queue
            </button>
          </div>
        </div>
      </header>

      {/* Queue Selection Cards with Real KPI Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {(Object.keys(queueMeta) as Queue[]).map((key) => {
          const isSelected = queue === key;
          const meta = queueMeta[key];
          const pendingCount = getPendingCountForQueue(key);
          const hasPending = pendingCount > 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setQueue(key);
                setError(null);
              }}
              className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-200 ${
                isSelected
                  ? 'border-indigo-600 bg-white shadow-md ring-2 ring-indigo-600/20 dark:border-indigo-500 dark:bg-slate-900'
                  : 'border-slate-200 bg-white/70 hover:border-indigo-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 ${meta.color}`}>
                  {meta.icon}
                </span>
                {key !== 'history' && key !== 'search' && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                      hasPending
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    }`}
                  >
                    {hasPending ? `${pendingCount} pending` : 'Clear'}
                  </span>
                )}
                {key === 'history' && (
                  <span className="text-[10px] font-mono text-slate-400">Ledger</span>
                )}
                {key === 'search' && (
                  <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">Weights</span>
                )}
              </div>
              <div className="mt-3">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">{meta.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {meta.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* LISTINGS QUEUE FILTER BAR */}
      {queue === 'listings' && (
        <div className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Listing Moderation Filter Matrix
              </h2>
            </div>
            {/* Quick Filter Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Quick:</span>
              <button
                type="button"
                onClick={() => {
                  setListingStatusFilter('SUBMITTED');
                  setListingPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  listingStatusFilter === 'SUBMITTED'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Submitted
              </button>
              <button
                type="button"
                onClick={() => {
                  setListingStatusFilter('UNDER_REVIEW');
                  setListingPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  listingStatusFilter === 'UNDER_REVIEW'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Under Review
              </button>
              <button
                type="button"
                onClick={() => {
                  setListingStatusFilter('REJECTED');
                  setListingIssuesFilter('true');
                  setListingPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  listingStatusFilter === 'REJECTED'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Has Issues
              </button>
              <button
                type="button"
                onClick={() => {
                  setListingStatusFilter('PUBLISHED');
                  setListingPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  listingStatusFilter === 'PUBLISHED'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Published
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="listing-search" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Search Query
              </label>
              <div className="relative mt-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  id="listing-search"
                  value={listingSearch}
                  onChange={(e) => {
                    setListingSearch(e.target.value);
                    setListingPage(1);
                  }}
                  placeholder="Business name, slug, or type…"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label htmlFor="listing-status-filter" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Listing Status
              </label>
              <select
                id="listing-status-filter"
                value={listingStatusFilter}
                onChange={(e) => {
                  setListingStatusFilter(e.target.value);
                  setListingPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under review</option>
                <option value="REJECTED">Rejected</option>
                <option value="APPROVED">Approved</option>
                <option value="PUBLISHED">Published</option>
                <option value="PAUSED">Paused</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <div>
              <label htmlFor="listing-mode-filter" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Business Mode
              </label>
              <select
                id="listing-mode-filter"
                value={listingModeFilter}
                onChange={(e) => {
                  setListingModeFilter(e.target.value);
                  setListingPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All modes</option>
                <option value="DISCOVERY_ONLY">Discovery only</option>
                <option value="DISCOVERY_AND_STORE">Discovery + store</option>
              </select>
            </div>

            <div>
              <label htmlFor="listing-verification-filter" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Verification
              </label>
              <select
                id="listing-verification-filter"
                value={listingVerificationFilter}
                onChange={(e) => {
                  setListingVerificationFilter(e.target.value);
                  setListingPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
                <option value="UNVERIFIED">Unverified</option>
              </select>
            </div>

            <div>
              <label htmlFor="listing-issues-filter" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Moderation Issues
              </label>
              <select
                id="listing-issues-filter"
                value={listingIssuesFilter}
                onChange={(e) => {
                  setListingIssuesFilter(e.target.value);
                  setListingPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All</option>
                <option value="true">Has open issues</option>
                <option value="false">No open issues</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {listingMeta.total === 0
                  ? 'No listings match filter'
                  : `Showing ${
                      (listingMeta.page - 1) * listingMeta.pageSize + 1
                    }–${Math.min(listingMeta.page * listingMeta.pageSize, listingMeta.total)} of ${
                      listingMeta.total
                    }`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setListingSearch('');
                  setListingModeFilter('');
                  setListingVerificationFilter('');
                  setListingIssuesFilter('');
                  setListingPage(1);
                }}
                className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reset filters
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={listingPageSize}
                onChange={(e) => {
                  setListingPageSize(Number(e.target.value));
                  setListingPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 font-bold"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <button
                type="button"
                disabled={!listingMeta.hasPreviousPage || loading}
                onClick={() => setListingPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Previous
              </button>
              <span className="min-w-[70px] text-center font-bold">
                Page {listingMeta.page} / {Math.max(1, listingMeta.totalPages)}
              </span>
              <button
                type="button"
                disabled={!listingMeta.hasNextPage || loading}
                onClick={() => setListingPage((p) => p + 1)}
                className="rounded-lg border px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VERIFICATION QUEUE FILTER BAR */}
      {queue === 'verification' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <label htmlFor="verification-status-filter" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Application status:
            </label>
            <select
              id="verification-status-filter"
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="PENDING">Pending Review (Action Required)</option>
              <option value="APPROVED">Approved Applications</option>
              <option value="REJECTED">Rejected Applications</option>
              <option value="ALL">All Applications</option>
            </select>
          </div>
          <span className="text-xs text-slate-400">
            Authenticates official legal registrations with regulatory & trade authorities.
          </span>
        </div>
      )}

      {/* CLAIMS QUEUE FILTER BAR */}
      {queue === 'claims' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900 dark:text-blue-200">
                <span className="font-black uppercase tracking-wider">Legal Ownership Policy:</span>{' '}
                Platform-created Discovery listings start unowned. Approving an ownership claim transfers full active{' '}
                <strong className="underline">OWNER</strong> role to the claimant user. Only approve after verifying valid registration, lease, or business evidence.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label htmlFor="claims-status-filter" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Claim status:
            </label>
            <select
              id="claims-status-filter"
              value={claimsFilter}
              onChange={(e) => setClaimsFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="PENDING">Pending Claims (Action Required)</option>
              <option value="APPROVED">Approved Claims</option>
              <option value="REJECTED">Rejected Claims</option>
              <option value="ALL">All Claims</option>
            </select>
          </div>
        </div>
      )}

      {/* REVIEWS QUEUE FILTER BAR */}
      {queue === 'reviews' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <label htmlFor="reviews-status-filter" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Review moderation status:
            </label>
            <select
              id="reviews-status-filter"
              value={reviewsFilter}
              onChange={(e) => setReviewsFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="PENDING">Pending Review (Action Required)</option>
              <option value="PUBLISHED">Published Reviews</option>
              <option value="HIDDEN">Hidden Reviews</option>
              <option value="REJECTED">Rejected Reviews</option>
              <option value="ALL">All Reviews</option>
            </select>
          </div>
          <span className="text-xs text-slate-400">
            Enforces Community Guidelines against harassment, spam, and paid promotional abuse.
          </span>
        </div>
      )}

      {/* REPORTS QUEUE FILTER BAR */}
      {queue === 'reports' && (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <label htmlFor="report-status-filter" className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Report status:
          </label>
          <select
            id="report-status-filter"
            value={reportsFilter}
            onChange={(e) => setReportsFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All open & historical</option>
            <option value="PENDING">Pending (Unassigned)</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>
      )}

      {/* HISTORY QUEUE FILTER BAR */}
      {queue === 'history' && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <label htmlFor="history-entity-filter" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Entity Type:
            </label>
            <select
              id="history-entity-filter"
              value={historyEntityType}
              onChange={(e) => setHistoryEntityType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Entities</option>
              <option value="BUSINESS">Business Listings</option>
              <option value="VERIFICATION">Verification</option>
              <option value="CLAIM">Ownership Claims</option>
              <option value="REVIEW">Customer Reviews</option>
              <option value="REPORT">Reports</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search by Business ID, Actor ID, or reason keyword…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {/* ERROR ALERT */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-bold">Moderation Error</p>
            <p className="mt-0.5 text-xs">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SEARCH QUALITY & RANKING TAB */}
      {queue === 'search' && searchAnalytics && searchRanking && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Searches', searchAnalytics.summary.searches ?? 0, 'Total customer queries'],
              ['Zero-result', searchAnalytics.summary.zero_result_searches ?? 0, 'Missing match searches'],
              ['Unique queries', searchAnalytics.summary.unique_queries ?? 0, 'Distinct search terms'],
              ['Impressions', searchAnalytics.summary.impressions ?? 0, 'Listings surfaced in feed'],
              ['Engagements', searchAnalytics.summary.result_engagements ?? 0, 'Clicks and inquiries'],
            ].map(([label, value, hint]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
                <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{String(value)}</div>
                <div className="mt-1 text-[10px] text-slate-400">{hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Search quality analytics</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Query values are strictly anonymized via SHA-256 hashes to safeguard customer privacy.
                  </p>
                </div>
                <select
                  value={searchDays}
                  onChange={(e) => setSearchDays(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-[1fr_90px_90px] border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                  <span>Query hash</span>
                  <span className="text-right">Searches</span>
                  <span className="text-right">Zero-result</span>
                </div>
                {searchAnalytics.popularQueries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">No search events in this window.</div>
                ) : (
                  searchAnalytics.popularQueries.map((row) => (
                    <div
                      key={row.query_hash}
                      className="grid grid-cols-[1fr_90px_90px] border-b border-slate-100 px-4 py-2.5 text-xs last:border-b-0 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                    >
                      <span className="truncate font-mono text-[11px] text-slate-600 dark:text-slate-400" title={row.query_hash}>
                        {row.query_hash}
                      </span>
                      <span className="text-right font-bold">{row.searches}</span>
                      <span className="text-right font-bold text-amber-600 dark:text-amber-400">{row.zero_results}</span>
                    </div>
                  ))
                )}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">{searchAnalytics.queryPrivacy}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Discovery ranking controls</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Fine-tune the scoring weights used by the Postgres ranking algorithm.
                  </p>
                </div>
                <span
                  className={
                    searchRanking.is_active
                      ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }
                >
                  {searchRanking.is_active ? 'Active' : 'Fallback active'}
                </span>
              </div>

              {/* Ranking Presets */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchRanking((prev) =>
                      prev
                        ? {
                            ...prev,
                            text_match_weight: 1.0,
                            exact_match_weight: 3.0,
                            prefix_match_weight: 1.5,
                            verified_weight: 1.2,
                            rating_weight: 1.0,
                            review_count_weight: 0.5,
                            fuzzy_match_weight: 0.8,
                            distance_penalty_weight: 0.5,
                            availability_weight: 0.5,
                          }
                        : prev
                    );
                    setSearchDirty(true);
                  }}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Balanced
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchRanking((prev) =>
                      prev
                        ? {
                            ...prev,
                            text_match_weight: 1.0,
                            exact_match_weight: 3.0,
                            prefix_match_weight: 1.5,
                            verified_weight: 2.5,
                            rating_weight: 2.0,
                            review_count_weight: 1.5,
                            fuzzy_match_weight: 0.5,
                            distance_penalty_weight: 0.3,
                            availability_weight: 0.8,
                          }
                        : prev
                    );
                    setSearchDirty(true);
                  }}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Trust-Heavy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchRanking((prev) =>
                      prev
                        ? {
                            ...prev,
                            text_match_weight: 1.0,
                            exact_match_weight: 3.0,
                            prefix_match_weight: 1.5,
                            verified_weight: 1.0,
                            rating_weight: 0.8,
                            review_count_weight: 0.3,
                            fuzzy_match_weight: 0.5,
                            distance_penalty_weight: 2.0,
                            availability_weight: 1.5,
                          }
                        : prev
                    );
                    setSearchDirty(true);
                  }}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Proximity-First
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['text_match_weight', 'Text match'],
                    ['exact_match_weight', 'Exact match'],
                    ['prefix_match_weight', 'Prefix match'],
                    ['verified_weight', 'Verified bonus'],
                    ['rating_weight', 'Rating weight'],
                    ['review_count_weight', 'Review count'],
                    ['fuzzy_match_weight', 'Fuzzy match'],
                    ['distance_penalty_weight', 'Distance penalty'],
                    ['availability_weight', 'Availability bonus'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
                      <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {searchRanking[key]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={searchRanking[key]}
                        onChange={(e) => {
                          setSearchRanking((prev) => (prev ? { ...prev, [key]: Number(e.target.value) } : prev));
                          setSearchDirty(true);
                        }}
                        className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg dark:bg-slate-700"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={searchRanking[key]}
                        onChange={(e) => {
                          setSearchRanking((prev) => (prev ? { ...prev, [key]: Number(e.target.value) } : prev));
                          setSearchDirty(true);
                        }}
                        className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 font-mono text-right"
                      />
                    </div>
                  </label>
                ))}
              </div>

              <label className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={searchRanking.is_active}
                  onChange={(e) => {
                    setSearchRanking((prev) => (prev ? { ...prev, is_active: e.target.checked } : prev));
                    setSearchDirty(true);
                  }}
                  className="rounded accent-indigo-600"
                />
                Apply custom weights to live discovery search queries
              </label>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">
                  {searchRanking.updated_at
                    ? `Updated ${new Date(searchRanking.updated_at).toLocaleString()}`
                    : 'Default weights'}
                </span>
                <button
                  type="button"
                  disabled={!searchDirty || searchSaving}
                  onClick={async () => {
                    if (!searchRanking) return;
                    setSearchSaving(true);
                    setError(null);
                    try {
                      const {
                        id: _id,
                        updated_by_user_id: _actor,
                        updated_at: _updated,
                        ...updates
                      } = searchRanking;
                      const saved = await platformRequest<SearchRankingConfig>(
                        '/api/platform/discovery/search-ranking',
                        { method: 'PATCH', body: JSON.stringify(updates) }
                      );
                      setSearchRanking(saved);
                      setSearchDirty(false);
                    } catch (err: any) {
                      setError(err?.message || 'Unable to save ranking configuration.');
                    } finally {
                      setSearchSaving(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {searchSaving ? 'Saving…' : 'Save ranking controls'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN DATA TABLE / ITEM LIST (for listings, verification, claims, reviews, reports, history) */}
      {queue !== 'search' && (
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-5 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                {queueMeta[queue].icon}
              </span>
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white capitalize">
                  {queueMeta[queue].label} Queue
                </h2>
                <p className="text-[11px] text-slate-500">
                  {queue === 'listings'
                    ? `${listingMeta.total} record(s) matching current criteria`
                    : `${items.length} item(s) in this view`}
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div role="status" className="p-16 text-center text-sm text-slate-500">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" />
              Loading {queueMeta[queue].label} moderation records…
            </div>
          ) : items.length === 0 ? (
            <div className="p-16 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 text-base font-black text-slate-800 dark:text-slate-200">Queue is Clear</p>
              <p className="mt-1 text-xs text-slate-500">No records match the current filter or status.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const currentStatus = String(
                  queue === 'listings'
                    ? item.listing_status || item.status || 'UNKNOWN'
                    : item.status || 'UNKNOWN'
                );

                return (
                  <article key={item.id} className="p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        {/* Title & Badges */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            {String(item.business_name || item.name || item.service_name || item.id)}
                          </h3>
                          {statusBadge(currentStatus)}
                          {item.verification_status && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-400">
                              <ShieldCheck className="w-3 h-3 text-indigo-500" />
                              {String(item.verification_status)}
                            </span>
                          )}
                          {item.business_mode && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              {String(item.business_mode).replace('_', ' ')}
                            </span>
                          )}
                          {Number(item.open_issue_count || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                              <AlertTriangle className="w-3 h-3" />
                              {Number(item.open_issue_count)} open issue(s)
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <span className="font-mono">ID: {item.id}</span>
                          <span>•</span>
                          <span>Created {new Date(item.created_at).toLocaleString()}</span>
                          {item.organization_id && (
                            <>
                              <span>•</span>
                              <span>Org: {String(item.organization_id)}</span>
                            </>
                          )}
                        </div>

                        {/* LISTINGS QUEUE SPECIFIC ACTIONS */}
                        {queue === 'listings' && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openListing(item)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Open listing review
                            </button>
                            <span className="text-[11px] text-slate-500">
                              Inspect profile, locations, offerings, and issue diagnostics.
                            </span>
                          </div>
                        )}

                        {/* VERIFICATION QUEUE CONTENT */}
                        {queue === 'verification' && (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                              Application Verification Dossier
                            </div>
                            {renderStructuredEvidence(item.evidence, item.id)}
                          </div>
                        )}

                        {/* CLAIMS QUEUE CONTENT */}
                        {queue === 'claims' && (
                          <div className="mt-3 space-y-3 rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-bold text-blue-950 dark:text-blue-200">
                                Claimant Information
                              </div>
                              <span className="text-[11px] font-mono text-blue-700 dark:text-blue-300 font-bold">
                                User: {String(item.claimant_user_id || 'Unknown')}
                              </span>
                            </div>
                            {renderStructuredEvidence(item.evidence, item.id)}
                          </div>
                        )}

                        {/* REVIEWS QUEUE CONTENT */}
                        {queue === 'reviews' && (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-2">
                              <div className="flex text-amber-500">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-3.5 h-3.5 ${
                                      star <= Number(item.rating || 0)
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-slate-300 dark:text-slate-700'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {String(item.title || 'Customer Review')}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                              {String(item.body || 'No review comments provided.')}
                            </p>
                            <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
                              <span>Author: {String(item.reviewer_name || 'Customer')}</span>
                              <span>•</span>
                              <span>Rating: {String(item.rating || '—')} / 5</span>
                            </div>
                          </div>
                        )}

                        {/* REPORTS QUEUE CONTENT */}
                        {queue === 'reports' && (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                <Flag className="w-3 h-3" />
                                {String(item.reason_code || 'REPORT')}
                              </span>
                              {item.service_name && (
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                  Service: {String(item.service_name)}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-800 dark:text-slate-200">
                              {String(item.description || 'No detailed description submitted.')}
                            </p>
                            {item.resolution_note && (
                              <div className="mt-2 rounded-xl bg-white/70 p-2 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                                <span className="font-bold">Resolution Note:</span> {String(item.resolution_note)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* HISTORY QUEUE CONTENT */}
                        {queue === 'history' && (
                          <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{String(item.event_type)}:</span>
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] dark:bg-slate-800">
                                {String(item.from_status || 'INIT')}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] dark:bg-slate-800">
                                {String(item.to_status || '—')}
                              </span>
                            </div>
                            {item.reason && (
                              <p className="mt-1 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                                <span className="font-bold">Rationale:</span> {String(item.reason)}
                              </p>
                            )}
                            <div className="text-[10px] text-slate-400">
                              Actor: <span className="font-mono">{String(item.actor_user_id || 'system')}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* DECISION ACTION SIDEBAR FOR VERIFICATION, CLAIMS, REVIEWS, REPORTS */}
                      {queue !== 'listings' && queue !== 'history' && (
                        <div className="w-full lg:w-80 space-y-2.5 bg-slate-50/70 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                          <label
                            htmlFor={`reason-${item.id}`}
                            className="text-[11px] font-black uppercase tracking-wider text-slate-500 block"
                          >
                            Decision Rationale
                          </label>

                          {/* Quick presets for common moderation actions */}
                          <div className="flex flex-wrap gap-1">
                            {queue === 'verification' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => applyPresetReason(item.id, 'Official business registration verified')}
                                  className="text-[10px] rounded bg-white px-1.5 py-0.5 border text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Verified match
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyPresetReason(item.id, 'Document illegible or cropped')}
                                  className="text-[10px] rounded bg-white px-1.5 py-0.5 border text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Illegible doc
                                </button>
                              </>
                            )}
                            {queue === 'claims' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => applyPresetReason(item.id, 'Claimant business authority confirmed')}
                                  className="text-[10px] rounded bg-white px-1.5 py-0.5 border text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Authority confirmed
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyPresetReason(item.id, 'Insufficient proof of business ownership')}
                                  className="text-[10px] rounded bg-white px-1.5 py-0.5 border text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Insufficient proof
                                </button>
                              </>
                            )}
                            {queue === 'reviews' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => applyPresetReason(item.id, 'Genuine customer review approved')}
                                  className="text-[10px] rounded bg-white px-1.5 py-0.5 border text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Policy compliant
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyPresetReason(item.id, 'Violates harassment / spam guidelines')}
                                  className="text-[10px] rounded bg-white px-1.5 py-0.5 border text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Policy violation
                                </button>
                              </>
                            )}
                          </div>

                          <textarea
                            id={`reason-${item.id}`}
                            value={reason[item.id] || ''}
                            onChange={(e) =>
                              setReason((prev) => ({ ...prev, [item.id]: e.target.value.slice(0, 2000) }))
                            }
                            rows={2}
                            placeholder="Enter the moderation decision rationale…"
                            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 font-medium"
                          />

                          <div className="flex flex-wrap gap-2 pt-1">
                            {queue === 'verification' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'APPROVED')}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'REJECTED')}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              </>
                            )}

                            {queue === 'claims' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'APPROVED')}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve claim
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'REJECTED')}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject claim
                                </button>
                              </>
                            )}

                            {queue === 'reviews' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'PUBLISHED')}
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Publish
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'HIDDEN')}
                                  className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                                >
                                  Hide
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'REJECTED')}
                                  className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {queue === 'reports' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'UNDER_REVIEW')}
                                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  Reviewing
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'RESOLVED')}
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Resolve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => void decide(item, 'DISMISSED')}
                                  className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE LISTING DIALOG */}
      {createListingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-discovery-listing-title"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                  Platform-created listing
                </div>
                <h2
                  id="create-discovery-listing-title"
                  className="mt-1 text-lg font-black text-slate-900 dark:text-white"
                >
                  Create Discovery listing
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  The listing starts as DRAFT, Discovery-only, and unowned. Ownership is established only after an eligible business-owner claim is approved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!createListingBusy) setCreateListingOpen(false);
                }}
                className="rounded-xl border p-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label
              htmlFor="platform-create-listing-name"
              className="mt-5 block text-[11px] font-bold uppercase tracking-wide text-slate-500"
            >
              Business name
            </label>
            <input
              id="platform-create-listing-name"
              autoFocus
              value={createListingName}
              onChange={(e) => setCreateListingName(e.target.value.slice(0, 255))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void createPlatformListing();
                }
              }}
              placeholder="e.g. Sierra Leone Commercial Union"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 font-medium"
              disabled={createListingBusy}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={createListingBusy}
                onClick={() => setCreateListingOpen(false)}
                className="rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createListingBusy || createListingName.trim().length < 2}
                onClick={() => void createPlatformListing()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                {createListingBusy ? 'Creating…' : 'Create draft listing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED LISTING MODERATION WORKSPACE MODAL */}
      {selectedListing && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 p-3 sm:p-6 flex items-center justify-center backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Listing moderation review"
        >
          <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 shrink-0">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                      Listing Moderation Inspector
                    </span>
                    {statusBadge(
                      String(selectedListing.listing_status || selectedListing.status || 'UNKNOWN')
                    )}
                  </div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedListing.business_name || selectedListing.name || selectedListing.id}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="rounded-xl border p-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 dark:border-slate-800 dark:bg-slate-900/50 shrink-0">
              {[
                { id: 'profile', label: 'Business Profile', icon: <Building2 className="w-3.5 h-3.5" /> },
                { id: 'location', label: 'Location & Map', icon: <MapPin className="w-3.5 h-3.5" /> },
                { id: 'services', label: 'Services & Offerings', icon: <Tag className="w-3.5 h-3.5" /> },
                { id: 'readiness', label: 'Readiness & Policy', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                { id: 'history', label: 'Lifecycle Audit', icon: <History className="w-3.5 h-3.5" /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-3 text-xs font-extrabold border-b-2 transition-all ${
                    modalTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {listingLoading || !listingDetail ? (
                <div className="p-16 text-center text-sm text-slate-500">
                  <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" />
                  Loading comprehensive listing verification detail…
                </div>
              ) : (
                <>
                  {/* Summary Metric Ribbon */}
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      ['Status', listingDetail.business.listing_status],
                      ['Mode', listingDetail.business.business_mode],
                      ['Verification', listingDetail.business.verification_status],
                      ['Readiness', listingDetail.readiness?.ready ? 'Ready for Publication' : 'Incomplete'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                        <div className="text-[10px] uppercase font-bold text-slate-400">{label}</div>
                        <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* TAB: PROFILE */}
                  {modalTab === 'profile' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border p-5 dark:border-slate-800 space-y-4">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-600" />
                          Profile Information
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Business Name</div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white">{listingDetail.business.name}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">URL Slug</div>
                            <div className="text-xs font-mono text-slate-600 dark:text-slate-400">{listingDetail.business.slug || '—'}</div>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Short Description</div>
                            <div className="text-xs text-slate-700 dark:text-slate-300">{listingDetail.business.short_description || 'None provided.'}</div>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Full Description</div>
                            <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{listingDetail.business.description || 'None provided.'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Contact Channels</div>
                            <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 space-y-1">
                              {listingDetail.business.phone && <div>Phone: {listingDetail.business.phone}</div>}
                              {listingDetail.business.email && <div>Email: {listingDetail.business.email}</div>}
                              {listingDetail.business.whatsapp && <div>WhatsApp: {listingDetail.business.whatsapp}</div>}
                              {!listingDetail.business.phone && !listingDetail.business.email && !listingDetail.business.whatsapp && <div>No direct contacts provided.</div>}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Categories</div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {(listingDetail.categories || []).map((cat: any) => (
                                <span key={cat.id || cat.name} className="rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-bold">
                                  {cat.name}
                                </span>
                              ))}
                              {(!listingDetail.categories || listingDetail.categories.length === 0) && (
                                <span className="text-xs text-slate-400 italic">No categories assigned.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: LOCATION */}
                  {modalTab === 'location' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border p-5 dark:border-slate-800">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-600" />
                          Geographic Presence & Addresses
                        </h3>
                        <div className="mt-4 space-y-3">
                          {(listingDetail.locations || []).map((loc: any) => (
                            <div key={loc.id} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  {loc.name || 'Location'}{' '}
                                  {loc.is_primary && (
                                    <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-black uppercase">
                                      Primary
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">{loc.location_type || 'STOREFRONT'}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                {loc.address_line_1 || 'No street address'}, {loc.city || 'No city'}, {loc.district || 'No district'}, {loc.region || 'Sierra Leone'}
                              </p>
                              <div className="mt-2 text-[11px] font-mono text-slate-500">
                                Coordinates: {loc.latitude ?? '—'}, {loc.longitude ?? '—'}{' '}
                                {loc.latitude && loc.longitude ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">✓ Plotted</span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">⚠ Missing GPS</span>
                                )}
                              </div>
                            </div>
                          ))}
                          {(!listingDetail.locations || listingDetail.locations.length === 0) && (
                            <p className="text-xs text-slate-400 italic">No physical or service locations defined.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: SERVICES */}
                  {modalTab === 'services' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border p-5 dark:border-slate-800">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <Tag className="w-4 h-4 text-purple-600" />
                          Services & Offerings ({listingDetail.services?.length || 0})
                        </h3>
                        <div className="mt-4 space-y-3">
                          {(listingDetail.services || []).map((srv: any) => (
                            <div key={srv.id} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">{srv.name}</span>
                                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                  {srv.price_from ? `${srv.currency || 'NLE'} ${srv.price_from}${srv.price_to ? ` - ${srv.price_to}` : ''}` : 'Inquire for pricing'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{srv.description || 'No service description.'}</p>
                              <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                                <span>Type: {srv.service_type}</span>
                                {srv.duration_minutes && <span>• Duration: {srv.duration_minutes} min</span>}
                                {srv.booking_mode && <span>• Booking: {srv.booking_mode}</span>}
                              </div>
                            </div>
                          ))}
                          {(!listingDetail.services || listingDetail.services.length === 0) && (
                            <p className="text-xs text-slate-400 italic">No services or service offerings listed yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: READINESS */}
                  {modalTab === 'readiness' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border p-5 dark:border-slate-800">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Publication Readiness Checks</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          These authoritative checks determine whether this listing satisfies directory quality thresholds.
                        </p>
                        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                          {(listingDetail.readiness?.items || []).map((x: any) => (
                            <div
                              key={x.key}
                              className={`flex items-center gap-2.5 rounded-xl p-3 text-xs font-bold border ${
                                x.done
                                  ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-300'
                                  : 'border-rose-200 bg-rose-50/60 text-rose-800 dark:border-rose-950 dark:bg-rose-950/20 dark:text-rose-300'
                              }`}
                            >
                              {x.done ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                              )}
                              <span>{x.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: LIFECYCLE HISTORY */}
                  {modalTab === 'history' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border p-5 dark:border-slate-800">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Lifecycle Transition Log</h3>
                        <div className="mt-4 space-y-3">
                          {(listingDetail.lifecycle || []).map((ev: any) => (
                            <div key={ev.id} className="rounded-xl border border-slate-100 p-3 text-xs dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
                              <div className="flex items-center justify-between">
                                <span className="font-bold">
                                  {ev.from_status || 'INIT'} → {ev.to_status}
                                </span>
                                <span className="text-[10px] text-slate-400">{new Date(ev.created_at).toLocaleString()}</span>
                              </div>
                              {ev.reason && (
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 italic">"{ev.reason}"</p>
                              )}
                              <div className="mt-1 text-[10px] font-mono text-slate-400">Actor: {ev.actor_user_id}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STRUCTURED REJECTION ISSUES BUILDER */}
                  <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-5 dark:border-rose-900/60 dark:bg-rose-950/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-rose-900 dark:text-rose-200 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          Structured Moderation Issues (Correction Guidance)
                        </h3>
                        <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">
                          Select the exact policy areas requiring corrections before this listing can be approved.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                      {[
                        ['identity', 'Business Name / Legal Identity'],
                        ['description', 'Description & Accuracy'],
                        ['contact', 'Customer Contact Channels'],
                        ['category', 'Category Assignment'],
                        ['location', 'Physical Address & Location'],
                        ['coordinates', 'GPS Coordinates Precision'],
                        ['offering', 'Services & Product Offerings'],
                        ['store', 'Storefront Integration'],
                      ].map(([key, label]) => {
                        const isChecked = Object.prototype.hasOwnProperty.call(listingIssues, key);
                        return (
                          <div
                            key={key}
                            className={`rounded-2xl border p-3.5 transition-all ${
                              isChecked
                                ? 'border-rose-300 bg-white dark:border-rose-800 dark:bg-slate-900 shadow-sm'
                                : 'border-rose-200/60 bg-white/60 dark:border-rose-950 dark:bg-slate-900/40'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) =>
                                  setListingIssues((prev) => {
                                    const next = { ...prev };
                                    if (e.target.checked) next[key] = '';
                                    else delete next[key];
                                    return next;
                                  })
                                }
                                className="accent-rose-600 rounded"
                              />
                              <span>{label}</span>
                            </label>
                            {isChecked && (
                              <input
                                value={listingIssues[key]}
                                onChange={(e) =>
                                  setListingIssues((prev) => ({
                                    ...prev,
                                    [key]: e.target.value.slice(0, 1000),
                                  }))
                                }
                                placeholder="Specific instructions for this correction…"
                                className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-1.5 text-xs dark:border-rose-900 dark:bg-slate-950 outline-none focus:border-rose-500"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <label
                      htmlFor={`decision-note-${selectedListing.id}`}
                      className="mt-4 block text-[11px] font-black uppercase tracking-wider text-rose-900 dark:text-rose-200"
                    >
                      Overall Moderation Rationale & Merchant Instructions
                    </label>
                    <textarea
                      id={`decision-note-${selectedListing.id}`}
                      value={reason[selectedListing.id] || ''}
                      onChange={(e) =>
                        setReason((prev) => ({
                          ...prev,
                          [selectedListing.id]: e.target.value.slice(0, 4000),
                        }))
                      }
                      rows={3}
                      placeholder="Explain the review conclusion or specific requirements for approval…"
                      className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs dark:border-rose-900 dark:bg-slate-950 outline-none focus:border-rose-500 font-medium"
                    />
                  </div>

                  {/* MODAL DECISION CONTROLS */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <span className="text-xs text-slate-400">
                      Decisions are recorded authoritatively in the platform audit log.
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {(selectedListing.listing_status || selectedListing.status) === 'SUBMITTED' && (
                        <button
                          type="button"
                          disabled={busyId === selectedListing.id}
                          onClick={() => void decideListing('UNDER_REVIEW')}
                          className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Start review
                        </button>
                      )}

                      {(selectedListing.listing_status || selectedListing.status) === 'UNDER_REVIEW' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === selectedListing.id}
                            onClick={() => void decideListing('APPROVED')}
                            className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === selectedListing.id}
                            onClick={() => void decideListing('REJECTED')}
                            className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Reject & request changes
                          </button>
                        </>
                      )}

                      {(selectedListing.listing_status || selectedListing.status) === 'APPROVED' && (
                        <button
                          type="button"
                          disabled={busyId === selectedListing.id}
                          onClick={() => void decideListing('PUBLISHED')}
                          className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Publish listing
                        </button>
                      )}

                      {(selectedListing.listing_status || selectedListing.status) === 'PUBLISHED' && (
                        <button
                          type="button"
                          disabled={busyId === selectedListing.id}
                          onClick={() => void decideListing('SUSPENDED')}
                          className="rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                        >
                          Suspend listing
                        </button>
                      )}

                      {['REJECTED', 'SUSPENDED', 'PAUSED'].includes(
                        String(selectedListing.listing_status || selectedListing.status)
                      ) && (
                        <button
                          type="button"
                          disabled={busyId === selectedListing.id}
                          onClick={() => void decideListing('UNDER_REVIEW')}
                          className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          Reopen for review
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
