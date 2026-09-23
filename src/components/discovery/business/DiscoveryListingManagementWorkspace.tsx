import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
  Check,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Layers,
  History,
  Info
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness, DiscoveryListingManagementWorkspace as Workspace } from '../../../types/discovery';
import { ListingStatusBadge } from '../ListingStatusBadge';

interface Props {
  business: DiscoveryBusiness;
  onUpdate: (business: DiscoveryBusiness) => void;
  onNavigateTab: (tabId: string) => void;
  onOpenPreview: () => void;
}

const statusCopy: Record<string, string> = {
  DRAFT: 'Draft — edit listing details to prepare for submission',
  SUBMITTED: 'Submitted — awaiting platform review and intake',
  UNDER_REVIEW: 'Under review — AbaCha compliance team is active',
  APPROVED: 'Approved — listing certified and ready to publish',
  PUBLISHED: 'Published — live and discoverable on AbaCha directory',
  REJECTED: 'Returned — corrections requested by moderation team',
  PAUSED: 'Paused — temporarily hidden from directory by owner',
  SUSPENDED: 'Suspended — locked due to policy or verification requirements',
  ARCHIVED: 'Archived — permanently retired listing',
};

const statusDescriptions: Record<string, string> = {
  DRAFT: 'Your business profile and information is kept private while you configure the details. Complete the readiness check below to submit.',
  SUBMITTED: 'We have received your submission. The platform moderation team will review your content against quality policies shortly.',
  UNDER_REVIEW: 'A dedicated platform moderator is currently reviewing your profile categories, offerings, contact data, and location accuracy.',
  APPROVED: 'Congratulations! Your business listing has successfully passed the security and data-quality guidelines. Click to publish.',
  PUBLISHED: 'Your listing is active and discoverable! Customers can view your services, contact information, and send inquiries.',
  REJECTED: 'The moderation team identified key information that needs verification or adjustment. See instructions below to resubmit.',
};

export const DiscoveryListingManagementWorkspace: React.FC<Props> = ({
  business,
  onUpdate,
  onNavigateTab,
  onOpenPreview,
}) => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resubmitReason, setResubmitReason] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await discoveryApi.getListingManagementWorkspace(business.id));
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load listing management workspace.');
    } finally {
      setLoading(false);
    }
  }, [business.id]);

  useEffect(() => { void load(); }, [load]);

  const latestFeedback = workspace?.feedback?.[0] || null;
  const moderationIssues = (workspace?.issues || []).filter((issue) => issue.status === 'OPEN');
  const latestModerationIssue = moderationIssues[0] || null;
  const hasModerationFeedback = Boolean(latestFeedback || moderationIssues.length > 0);
  const requiredItems = workspace?.readiness.items.filter((item) => item.required) || [];
  const readyCount = requiredItems.filter((item) => item.done).length;
  const readinessPercent = requiredItems.length ? Math.round((readyCount / requiredItems.length) * 100) : 0;

  const canResubmit = business.listing_status === 'REJECTED' && Boolean(workspace?.readiness.ready);
  const canSubmit = business.listing_status === 'DRAFT' && Boolean(workspace?.readiness.ready);

  const actionLabel = useMemo(() => {
    if (business.listing_status === 'REJECTED') return canResubmit ? 'Resubmit for review' : 'Complete required fixes';
    if (business.listing_status === 'DRAFT') return canSubmit ? 'Submit for review' : 'Complete readiness checklist';
    return statusCopy[business.listing_status] || business.listing_status;
  }, [business.listing_status, canResubmit, canSubmit]);

  const lifecycleSteps = [
    { key: 'SUBMITTED', label: 'Submitted', description: 'Listing received and queued for platform check.' },
    { key: 'UNDER_REVIEW', label: 'Under Review', description: 'Platform compliance team is auditing data.' },
    { key: 'APPROVED', label: 'Approved', description: 'Listing approved and certified for publication.' },
    { key: 'PUBLISHED', label: 'Published', description: 'Listing is live on the AbaCha network.' },
  ] as const;

  const lifecycleRank: Record<string, number> = {
    DRAFT: 0,
    SUBMITTED: 1,
    UNDER_REVIEW: 2,
    APPROVED: 3,
    PUBLISHED: 4,
  };

  const currentLifecycleRank = lifecycleRank[business.listing_status] ?? 0;
  const isRejected = business.listing_status === 'REJECTED';
  const isPostSubmission = currentLifecycleRank >= 1;

  type FeedbackAction = {
    key: string;
    title: string;
    detail: string;
    tab: string;
  };

  const issueActions = useMemo<FeedbackAction[]>(() => {
    const labels: Record<string, { title: string; detail: string; tab: string }> = {
      identity: { title: 'Review business identity', detail: 'Check the business name, profile identity, logo and cover information.', tab: 'listing' },
      description: { title: 'Review business description', detail: 'Update the short description or full profile description used in Discovery.', tab: 'listing' },
      contact: { title: 'Review contact information', detail: 'Check phone, WhatsApp, email and website details.', tab: 'listing' },
      category: { title: 'Review business category', detail: 'Confirm the business type and active Discovery category.', tab: 'listing' },
      location: { title: 'Review location details', detail: 'Check the primary address, city, service area and map pin.', tab: 'locations' },
      coordinates: { title: 'Review map coordinates', detail: 'Confirm the primary location has accurate latitude and longitude.', tab: 'locations' },
      offering: { title: 'Review services & offerings', detail: 'Check service details, pricing, booking and quote settings.', tab: 'services' },
      store: { title: 'Review store setup', detail: 'Check the store/catalog information associated with this listing.', tab: 'settings' },
    };
    return moderationIssues.map((issue) => {
      const meta = labels[issue.issue_key] || labels.identity;
      return { key: issue.id, title: meta.title, detail: issue.detail?.trim() || meta.detail, tab: meta.tab };
    });
  }, [workspace?.issues]);

  const feedbackActions = useMemo<FeedbackAction[]>(() => {
    if (moderationIssues.length) return [];
    const reason = latestFeedback?.reason?.trim();
    if (!reason) return [];

    const normalized = reason.toLowerCase();
    const actions: FeedbackAction[] = [];
    const add = (key: string, title: string, detail: string, tab: string) => {
      if (!actions.some((item) => item.key === key)) actions.push({ key, title, detail, tab });
    };
    if (/contact|phone|whatsapp|email|website/.test(normalized)) add('contact', 'Review contact information', 'Check the phone, WhatsApp, email, and website details used for customer contact.', 'listing');
    if (/categor|business type|industry/.test(normalized)) add('category', 'Review business category', 'Confirm the listing uses the correct business type and active Discovery category.', 'listing');
    if (/description|about|profile|identity|name|business name|logo|cover/.test(normalized)) add('profile', 'Review business profile', 'Check the business name, description, and listing identity details.', 'listing');
    if (/location|address|city|district|region|map|coordinate|latitude|longitude|gps/.test(normalized)) add('location', 'Review location details', 'Check the primary address, map pin, city and service-area coordinates.', 'locations');
    if (/service|offering|booking|quote/.test(normalized)) add('offering', 'Review services & offerings', 'Check the service name, description, type, pricing and request/quote setup.', 'services');
    if (/store|product|catalog|inventory/.test(normalized)) add('store', 'Review store setup', 'Check the store/catalog information associated with this listing.', 'settings');
    if (!actions.length) add('submission', 'Review the submission checklist', 'The moderation note is not tied to a known field. Review the full submission workspace before resubmitting.', 'submission');
    return actions;
  }, [latestFeedback?.reason, moderationIssues.length]);

  const submit = async (resubmit = false) => {
    setActionBusy(true);
    setError(null);
    try {
      const updated = resubmit
        ? await discoveryApi.resubmitBusiness(business.id, resubmitReason.trim() || undefined)
        : await discoveryApi.submitBusiness(business.id);
      onUpdate(updated);
      setResubmitReason('');
      setSubmittedNotice(true);
      await load();
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'The listing could not be submitted.');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && !workspace) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 stroke-[1.5]" />
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-400">Syncing platform workspace…</span>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-8 rounded-3xl border border-rose-100 bg-rose-50/50 text-center max-w-2xl mx-auto my-12">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-slate-900">Workspace Unavailable</h3>
        <p className="mt-2 text-xs leading-5 text-slate-600">{error || 'Unable to retrieve listing configuration details.'}</p>
        <button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition">
          <RefreshCw className="w-3.5 h-3.5" /> Retry Sync
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-16">
      {error && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-semibold flex gap-2 items-center">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {submittedNotice && isPostSubmission && !isRejected && (
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm transition">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {business.listing_status === 'SUBMITTED' ? 'Listing successfully submitted' : 'Listing Status Updated'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {business.listing_status === 'SUBMITTED'
                  ? 'Your profile listing is now locked and routing through our compliance and review system. Listings typically complete review within 24–48 hours.'
                  : 'Your discovery listing has progressed to a new stage of the review workflow.'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Editorial Header Section */}
      <section className="border-b border-slate-100 dark:border-slate-800/60 pb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-extrabold text-indigo-600 mb-1.5">Discovery Workspace</div>
            <div className="flex items-center gap-3.5 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">{business.name}</h1>
              <ListingStatusBadge status={business.listing_status} />
            </div>
            
            {/* Clean, Unboxed Metadata (Rule A Compliance) */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold">{business.business_mode === 'DISCOVERY_ONLY' ? 'Discovery Directory Only' : 'Unified Merchant Suite'}</span>
              <span className="text-slate-300 dark:text-slate-700 font-normal" aria-hidden="true">·</span>
              <span className="truncate max-w-[200px]">{workspace.categories.map((cat) => cat.name).join(' · ') || 'Uncategorized'}</span>
              <span className="text-slate-300 dark:text-slate-700 font-normal" aria-hidden="true">·</span>
              <span>Updated {business.updated_at ? new Date(business.updated_at).toLocaleDateString() : '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 transition"
            >
              <Eye className="w-4 h-4 stroke-[1.5]" />
              <span>Preview Card</span>
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 transition disabled:opacity-50"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 stroke-[1.5] ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* High-legibility metrics (Replaced card-in-card with subtle vertical-border grid) */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800/40">
          <div className="border-l-2 border-indigo-500 pl-4 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Status State</span>
            <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-1">{business.listing_status}</div>
          </div>
          <div className="border-l-2 border-indigo-500/50 pl-4 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Profile Readiness</span>
            <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">{readinessPercent}% Complete</div>
          </div>
          <div className="border-l-2 border-indigo-500/30 pl-4 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Business Verification</span>
            <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-1">{workspace.verification.status}</div>
          </div>
          <div className="border-l-2 border-indigo-500/10 pl-4 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Open Audits</span>
            <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-1">{moderationIssues.length} corrections</div>
          </div>
        </div>
      </section>

      {/* Main Column Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Primary Column: Config and Status Details */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Moderation Diagnostics Board (Rule C compliance - Editorial callout) */}
          {hasModerationFeedback && (
            <section className="rounded-3xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/10 p-6 shadow-sm">
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-rose-100 dark:bg-rose-950/60 rounded-2xl text-rose-700 dark:text-rose-300 shrink-0">
                  <ShieldAlert className="w-6 h-6 stroke-[1.5]" />
                </div>
                <div className="space-y-4 flex-1">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">Moderation Review Corrections Required</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Our system audit returned adjustments that must be verified before listing publication.
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-950 p-4 rounded-2xl relative shadow-2sm">
                    <span className="absolute right-4 top-3 text-[10px] font-mono text-slate-400">
                      {new Date(latestFeedback?.created_at || latestModerationIssue?.event_created_at || latestModerationIssue?.created_at || Date.now()).toLocaleDateString()}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 block mb-1">AUDITOR INSTRUCTIONS:</span>
                    <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {latestFeedback?.reason || 'Details incomplete. Please verify location details and ensure complete descriptions are provided before submitting for approval.'}
                    </p>
                  </div>

                  {moderationIssues.length > 0 ? (
                    <div className="space-y-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-400">Required Changes Checklist ({moderationIssues.length})</span>
                      <div className="grid gap-2">
                        {issueActions.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={() => onNavigateTab(action.tab)}
                            className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-rose-100/60 bg-white/60 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900/80 p-4 text-left transition hover:border-rose-400/50 shadow-2sm"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900 dark:text-slate-200 group-hover:text-indigo-600 transition">{action.title}</span>
                              <span className="mt-1 block text-xs leading-normal text-slate-500 dark:text-slate-400">{action.detail}</span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-400">Direct Actions</span>
                      <div className="grid gap-2">
                        {feedbackActions.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={() => onNavigateTab(action.tab)}
                            className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-rose-100/60 bg-white/60 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900/80 p-4 text-left transition hover:border-rose-400/50 shadow-2sm"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900 dark:text-slate-200 group-hover:text-indigo-600 transition">{action.title}</span>
                              <span className="mt-1 block text-xs leading-normal text-slate-500 dark:text-slate-400">{action.detail}</span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Checklist Area */}
          <section className="rounded-3xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800/40">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500 stroke-[1.5]" />
                  <span>Profile Completion Checklist</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Required configurations required to submit your listing for platform moderation.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-28 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${readinessPercent}%` }} />
                </div>
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 tabular-nums">
                  {readyCount}/{requiredItems.length}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {requiredItems.map((item) => {
                const map: Record<string, string> = {
                  identity: 'listing',
                  description: 'listing',
                  contact: 'listing',
                  category: 'listing',
                  location: 'locations',
                  coordinates: 'locations',
                  offering: 'services',
                };
                const path = map[item.key];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 dark:border-slate-800/40 p-4 bg-slate-50/50 dark:bg-slate-800/10 hover:border-slate-200 dark:hover:border-slate-700/60 transition"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {item.done ? (
                        <div className="p-1 bg-emerald-100 dark:bg-emerald-950/60 rounded-full text-emerald-700 dark:text-emerald-400 shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="p-1 bg-slate-200 dark:bg-slate-800 rounded-full text-slate-400 shrink-0">
                          <div className="w-3.5 h-3.5 rounded-full" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className={`block text-xs font-bold leading-normal truncate ${item.done ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {item.label}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5 truncate">{item.detail || 'Required listing property'}</span>
                      </div>
                    </div>
                    {!item.done && path && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab(path)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[10px] font-extrabold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:bg-indigo-950 transition shrink-0"
                      >
                        Setup
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Publications Roadmap Section */}
          {isPostSubmission && (
            <section className="rounded-3xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
              <div className="pb-5 border-b border-slate-100 dark:border-slate-800/40">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock3 className="w-5 h-5 text-indigo-500 stroke-[1.5]" />
                  <span>Publication Journey Roadmap</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Lifecycle roadmap tracking of your listing path on the discovery directory.</p>
              </div>

              {/* Status explanation */}
              <div className="mt-5 p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/40 dark:border-indigo-950 flex gap-3.5 items-start">
                <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{statusCopy[business.listing_status]}</span>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {statusDescriptions[business.listing_status] || 'Your listing moves through review phases before it becomes available to general customers.'}
                  </p>
                </div>
              </div>

              {/* Grid timeline of lifecycle */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                {lifecycleSteps.map((step, index) => {
                  const stepRank = index + 1;
                  const isComplete = currentLifecycleRank >= stepRank;
                  const isCurrent = currentLifecycleRank === stepRank;
                  const event = [...(workspace.lifecycle || [])].reverse().find((item) => item.to_status === step.key);

                  return (
                    <div
                      key={step.key}
                      className={`relative rounded-2xl border p-4.5 transition h-full flex flex-col justify-between ${
                        isCurrent
                          ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10 ring-1 ring-indigo-500'
                          : isComplete
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20'
                            : 'border-slate-100 dark:border-slate-800/30 bg-slate-50/10 dark:bg-slate-800/5 opacity-50'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isCurrent ? 'text-indigo-600' : isComplete ? 'text-slate-500' : 'text-slate-400'}`}>
                            Stage 0{stepRank}
                          </span>
                          {isComplete ? (
                            <div className="p-0.5 bg-emerald-100 dark:bg-emerald-950 rounded-full text-emerald-700 dark:text-emerald-400 shrink-0">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          ) : isCurrent ? (
                            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse" />
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800" />
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">{step.label}</h4>
                        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{step.description}</p>
                      </div>

                      {event && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/40 text-[9px] font-mono text-slate-400 flex items-center justify-between">
                          <span>Updated:</span>
                          <span className="tabular-nums">{new Date(event.created_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>

        {/* Right Sidebar Column: Verification & Chronological Logs */}
        <div className="space-y-8">
          
          {/* Verification Center Trust Panel */}
          <section className="rounded-3xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/40">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-indigo-600">
                <ShieldCheck className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Compliance & Security</h3>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Business Verification</h4>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Official entity verification certifies your business legality with the AbaCha regulatory and payment networks. This is separate from directory listing moderation.
              </p>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Status Level:</span>
                <span className="text-xs font-extrabold tracking-wide px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-3sm text-indigo-700 dark:text-indigo-400 uppercase">
                  {workspace.verification.status}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('verification')}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-2 transition"
              >
                <span>Open Verification Center</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>

          {/* Audit History Log */}
          <section className="rounded-3xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800/40 mb-5">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Activity Journal</h3>
            </div>

            <div className="flow-root">
              <ul className="-mb-8">
                {workspace.lifecycle.slice(0, 6).map((event, eventIdx) => (
                  <li key={event.id}>
                    <div className="relative pb-8">
                      {eventIdx !== workspace.lifecycle.slice(0, 6).length - 1 ? (
                        <span className="absolute top-4 left-2.5 -ml-px h-full w-0.5 bg-slate-100 dark:bg-slate-800" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[8px] font-extrabold text-slate-500">
                            {eventIdx + 1}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                            <span className="font-mono text-[10px]">
                              {event.from_status || 'INIT'} → {event.to_status}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal tabular-nums font-mono">
                              {new Date(event.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">
                            "{event.reason || 'Workflow state modification'}"
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

        </div>

      </div>

      {/* Modern Live Storefront Preview Modal Overlay */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Listing Preview">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4.5 border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
              <div>
                <span className="text-[9px] uppercase tracking-widest font-black text-indigo-600 block mb-0.5">Directory Preview</span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{business.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Close Preview
              </button>
            </div>

            {/* Cover Banner Mockup */}
            {business.cover_image_url ? (
              <img src={business.cover_image_url} alt="" className="w-full h-56 object-cover" />
            ) : (
              <div className="w-full h-32 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/50" />
            )}

            {/* Profile split details */}
            <div className="p-6 md:p-8 space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-start gap-6 pb-6 border-b border-slate-100 dark:border-slate-800/40">
                {business.logo_url ? (
                  <img src={business.logo_url} alt="" className="w-20 h-20 rounded-2xl object-cover border border-slate-200/60 bg-white shrink-0 shadow-sm" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-xl shrink-0 border border-indigo-100">
                    {business.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">{business.name}</h4>
                    <ListingStatusBadge status={business.listing_status} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{business.short_description || 'No summary description provided.'}</p>
                  
                  {/* Clean unboxed tags */}
                  <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {workspace.categories.map((cat) => cat.name).join(' · ') || 'Uncategorized Category'}
                  </div>
                </div>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Description info */}
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Business Biography</h5>
                    <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {business.description || 'No extended description details provided yet.'}
                    </p>
                  </div>
                </div>

                {/* Logistics Info Card */}
                <div className="space-y-4 bg-slate-50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                  <div>
                    <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Primary Location</h5>
                    <div className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {workspace.locations.find((l) => l.is_primary)?.city || workspace.locations.find((l) => l.is_primary)?.address_line_1 || 'No physical coordinate address registered.'}
                    </div>
                  </div>
                  <div>
                    <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Authorized Contacts</h5>
                    <div className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {business.phone || business.whatsapp || business.email || 'No active contact configurations.'}
                    </div>
                  </div>
                </div>

              </div>

              {/* Warn note */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900/60 p-4 text-xs text-indigo-800 dark:text-indigo-400 leading-relaxed">
                This is an internal preview modeling exactly how the business listing renders to search customers. It will only be visible in the directory once status is <strong>PUBLISHED</strong>.
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Modern, Floating Sticky Glassmorphism Actions Panel (Rule I Cap Compliant) */}
      {(canSubmit || canResubmit) && (
        <section className="sticky bottom-4 z-20 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/95 backdrop-blur p-5.5 shadow-2xl transition-all duration-300">
          
          {canResubmit && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">Corrections Log Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea
                value={resubmitReason}
                onChange={(e) => setResubmitReason(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Briefly explain what corrections you have carried out..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 p-3 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">{actionLabel}</div>
              <div className="text-xs text-slate-500 mt-1">
                {canResubmit
                  ? 'All corrections have been made. Ready to submit to compliance audit.'
                  : 'Great job! Your profile meets all readiness conditions and is ready for platform intake.'}
              </div>
            </div>
            <button
              type="button"
              disabled={actionBusy || (!canSubmit && !canResubmit)}
              onClick={() => void submit(canResubmit)}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-lg hover:shadow-indigo-500/20 active:translate-y-px disabled:opacity-50"
            >
              {actionBusy ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              <span>{canResubmit ? 'Resubmit Certification' : 'Submit for Review'}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

