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
  DRAFT: 'Draft — not submitted',
  SUBMITTED: 'Submitted — awaiting moderation intake',
  UNDER_REVIEW: 'Under review by the platform',
  APPROVED: 'Approved — awaiting publication',
  PUBLISHED: 'Published and discoverable',
  REJECTED: 'Changes required before resubmission',
  PAUSED: 'Paused by the merchant',
  SUSPENDED: 'Suspended by the platform',
  ARCHIVED: 'Archived',
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
    { key: 'SUBMITTED', label: 'Submitted', description: 'Your listing has been received and is awaiting moderation intake.' },
    { key: 'UNDER_REVIEW', label: 'Under review', description: 'AbaCha is checking the listing and supporting information.' },
    { key: 'APPROVED', label: 'Approved', description: 'The listing has passed moderation and is ready for publication.' },
    { key: 'PUBLISHED', label: 'Published', description: 'The listing is publicly discoverable on AbaCha.' },
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

  const feedbackActions = useMemo<FeedbackAction[]>(() => {
    const reason = latestFeedback?.reason?.trim();
    if (!reason) return [];

    const normalized = reason.toLowerCase();
    const actions: FeedbackAction[] = [];
    const add = (key: string, title: string, detail: string, tab: string) => {
      if (!actions.some((item) => item.key === key)) actions.push({ key, title, detail, tab });
    };

    if (/contact|phone|whatsapp|email|website/.test(normalized)) {
      add('contact', 'Review contact information', 'Check the phone, WhatsApp, email, and website details used for customer contact.', 'listing');
    }
    if (/categor|business type|industry/.test(normalized)) {
      add('category', 'Review business category', 'Confirm the listing uses the correct business type and active Discovery category.', 'listing');
    }
    if (/description|about|profile|identity|name|business name|logo|cover/.test(normalized)) {
      add('profile', 'Review business profile', 'Check the business name, description, and listing identity details.', 'listing');
    }
    if (/location|address|city|district|region|map|coordinate|latitude|longitude|gps/.test(normalized)) {
      add('location', 'Review location details', 'Check the primary address, map pin, city and service-area coordinates.', 'locations');
    }
    if (/service|offering|booking|quote/.test(normalized)) {
      add('offering', 'Review services & offerings', 'Check the service name, description, type, pricing and request/quote setup.', 'services');
    }
    if (/store|product|catalog|inventory/.test(normalized)) {
      add('store', 'Review store setup', 'Check the store/catalog information associated with this listing.', 'settings');
    }

    if (!actions.length) {
      add('submission', 'Review the submission checklist', 'The moderation note is not tied to a known field. Review the full submission workspace before resubmitting.', 'submission');
    }

    return actions;
  }, [latestFeedback?.reason]);


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
    return <div className="min-h-[320px] flex items-center justify-center gap-3 text-xs text-slate-500"><RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />Loading submission workspace…</div>;
  }

  if (!workspace) {
    return <div className="p-6 rounded-3xl border border-rose-200 bg-rose-50 text-sm text-rose-700">{error || 'Listing management data is unavailable.'}<button onClick={() => void load()} className="ml-3 underline font-bold">Retry</button></div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

      {submittedNotice && isPostSubmission && !isRejected && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-extrabold text-emerald-900 dark:text-emerald-200">
                {business.listing_status === 'SUBMITTED' ? 'Listing submitted successfully' : 'Listing updated'}
              </h3>
              <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-100/80">
                {business.listing_status === 'SUBMITTED'
                  ? 'Your listing is now in the moderation workflow. It is not publicly discoverable until AbaCha approves and publishes it.'
                  : 'Your listing has moved forward in the moderation workflow.'}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Listing Submission & Review</h2>
              <ListingStatusBadge status={business.listing_status} />
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{statusCopy[business.listing_status] || 'Listing lifecycle status'}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => setShowPreview(true)} className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-2">
              <Eye className="w-4 h-4" /> Preview listing
            </button>
            <button type="button" onClick={() => void load()} className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-2" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            ['Current status', business.listing_status],
            ['Readiness', `${readinessPercent}%`],
            ['Verification', workspace.verification.status],
            ['Last update', business.updated_at ? new Date(business.updated_at).toLocaleString() : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
              <div className="mt-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white">Readiness checklist</h3>
            <p className="text-xs text-slate-500 mt-1">The server uses the same required checks before allowing moderation submission.</p>
          </div>
          <span className="text-sm font-black text-indigo-600">{readyCount}/{requiredItems.length}</span>
        </div>
        <div className="mt-5 space-y-2">
          {requiredItems.map((item) => (
            <button key={item.key} type="button" onClick={() => {
              const map: Record<string,string> = { identity: 'listing', description: 'listing', contact: 'listing', category: 'listing', location: 'locations', coordinates: 'locations', offering: 'services' };
              if (!item.done && map[item.key]) onNavigateTab(map[item.key]);
            }} className="w-full text-left flex items-center justify-between gap-4 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 hover:border-indigo-300 transition-colors">
              <span className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {item.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-rose-500" />}
                {item.label}
              </span>
              {!item.done && <span className="text-[10px] font-bold uppercase text-indigo-600">Fix</span>}
            </button>
          ))}
        </div>
      </section>

      {latestFeedback && (
        <section className="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 p-6">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-rose-700 dark:text-rose-300 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-extrabold text-rose-900 dark:text-rose-200">Changes requested by moderation</h3>
                  <p className="mt-2 text-sm leading-6 text-rose-900/80 dark:text-rose-100/80 whitespace-pre-wrap">{latestFeedback.reason}</p>
                  <p className="mt-2 text-[11px] text-rose-700 dark:text-rose-300">Returned on {new Date(latestFeedback.created_at).toLocaleString()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('submission')}
                  className="shrink-0 rounded-xl border border-rose-200 bg-white/70 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-white dark:border-rose-800 dark:bg-slate-900/50 dark:text-rose-200"
                >
                  Review checklist
                </button>
              </div>

              <div className="mt-5">
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">Suggested fixes</div>
                <div className="mt-2 grid gap-2">
                  {feedbackActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => onNavigateTab(action.tab)}
                      className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-rose-200/80 bg-white/70 p-4 text-left transition hover:border-rose-400 hover:bg-white dark:border-rose-900/70 dark:bg-slate-900/40 dark:hover:bg-slate-900"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold text-slate-900 dark:text-white">{action.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{action.detail}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-rose-600 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-rose-700/80 dark:text-rose-300/80">
                  These are guided destinations based on the moderation note. After making the correction, return here to re-check readiness and resubmit.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {isPostSubmission && (
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 dark:text-white">Submission & publication status</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your listing moves through moderation before it becomes visible to customers.</p>
            </div>
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{statusCopy[business.listing_status]}</span>
          </div>

          {isRejected ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-rose-900 dark:text-rose-200">
                <XCircle className="h-5 w-5" /> Changes required
              </div>
              <p className="mt-1 text-xs leading-5 text-rose-800 dark:text-rose-100/80">The listing is not public. Review the moderation feedback below, make the requested corrections, and resubmit.</p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
              {lifecycleSteps.map((step, index) => {
                const stepRank = index + 1;
                const complete = currentLifecycleRank >= stepRank;
                const current = currentLifecycleRank === stepRank;
                const event = [...(workspace.lifecycle || [])].reverse().find((item) => item.to_status === step.key);
                return (
                  <div key={step.key} className="relative">
                    <div className={`rounded-2xl border p-4 h-full ${complete ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'}`}>
                      <div className="flex items-center gap-2">
                        {complete ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">{step.label}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{step.description}</p>
                      {current && <span className="mt-2 inline-block rounded-full bg-indigo-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">Current</span>}
                      {event && <div className="mt-2 text-[10px] text-slate-400">{new Date(event.created_at).toLocaleString()}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">What happens next?</div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {business.listing_status === 'SUBMITTED'
                ? 'AbaCha will take the submission into moderation. You can continue editing where permitted, but it will remain private until approved and published.'
                : business.listing_status === 'UNDER_REVIEW'
                  ? 'A moderator is reviewing the listing. If changes are required, you will receive moderation feedback and a resubmission path.'
                  : business.listing_status === 'APPROVED'
                    ? 'The listing has passed moderation. It will become customer-visible when the publication step is completed.'
                    : 'The listing is live in Discovery. Keep your business profile, locations and offerings up to date.'}
            </p>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Clock3 className="w-5 h-5 text-indigo-600" />
          <h3 className="font-extrabold text-slate-900 dark:text-white">Submission timeline</h3>
        </div>
        <div className="mt-5 space-y-3">
          {workspace.lifecycle.slice(0, 8).map((event) => (
            <div key={event.id} className="flex gap-3 items-start">
              <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{event.from_status || 'Created'} → {event.to_status}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{event.reason || 'Lifecycle update'} · {new Date(event.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600" /><h3 className="font-extrabold text-slate-900 dark:text-white">Verification</h3></div>
        <p className="text-xs text-slate-500 mt-1">Listing moderation and business verification are separate workflows.</p>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4">
          <span className="text-sm font-bold">{workspace.verification.status}</span>
          <button type="button" onClick={() => onNavigateTab('verification')} className="text-xs font-bold text-indigo-600">Open verification center →</button>
        </div>
      </section>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 sm:p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Listing preview">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">Owner preview</div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{business.name}</h3>
              </div>
              <button type="button" onClick={() => setShowPreview(false)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">Close</button>
            </div>
            {business.cover_image_url && <img src={business.cover_image_url} alt="" className="w-full h-48 object-cover" />}
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-4">
                {business.logo_url ? <img src={business.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-200" /> : <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">{business.name.slice(0,2).toUpperCase()}</div>}
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><h4 className="text-xl font-black text-slate-900 dark:text-white">{business.name}</h4><ListingStatusBadge status={business.listing_status} /></div>
                  <p className="mt-1 text-sm text-slate-500">{business.short_description || 'No short description added yet.'}</p>
                  <div className="mt-2 text-xs text-slate-500">{workspace.categories.map((cat) => cat.name).join(' · ') || 'No categories'}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">About</h5>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{business.description || 'No full description added yet.'}</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4"><div className="text-[10px] uppercase font-bold text-slate-400">Contact</div><div className="mt-1 text-sm font-semibold">{business.phone || business.whatsapp || business.email || 'No contact added'}</div></div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4"><div className="text-[10px] uppercase font-bold text-slate-400">Location</div><div className="mt-1 text-sm font-semibold">{workspace.locations.find((l) => l.is_primary)?.city || workspace.locations.find((l) => l.is_primary)?.address_line_1 || 'No primary location'}</div></div>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-900 p-4 text-xs text-indigo-800 dark:text-indigo-200">
                This is a merchant-side preview. The listing is not publicly visible until it reaches <strong>PUBLISHED</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {(canSubmit || canResubmit) && (
        <section className="sticky bottom-4 z-10 rounded-3xl border border-indigo-200 dark:border-indigo-900 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-5 shadow-xl">
          {canResubmit && (
            <div className="mb-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Resubmission note <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea value={resubmitReason} onChange={(e) => setResubmitReason(e.target.value)} maxLength={1000} rows={2} placeholder="Briefly describe what you corrected…" className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-transparent p-3 text-sm" />
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">{actionLabel}</div>
              <div className="text-xs text-slate-500 mt-1">{canResubmit ? 'Only rejected listings can be resubmitted. New changes must pass readiness checks first.' : 'Submission will move the listing into the moderation workflow.'}</div>
            </div>
            <button type="button" disabled={actionBusy || (!canSubmit && !canResubmit)} onClick={() => void submit(canResubmit)} className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-2">
              {actionBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {canResubmit ? 'Resubmit for review' : 'Submit for review'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
