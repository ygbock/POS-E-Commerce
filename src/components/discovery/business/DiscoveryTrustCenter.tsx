import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCheck,
  Flag,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness, DiscoveryMerchantTrustCenter } from '../../../types/discovery';
import { VerificationBadge } from '../VerificationBadge';

interface DiscoveryTrustCenterProps {
  business: DiscoveryBusiness;
  onNavigateToVerification?: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const statusLabel = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/(^|\\s)\\S/g, (match) => match.toUpperCase());

export const DiscoveryTrustCenter: React.FC<DiscoveryTrustCenterProps> = ({
  business,
  onNavigateToVerification,
}) => {
  const [data, setData] = useState<DiscoveryMerchantTrustCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await discoveryApi.getMerchantTrustCenter(business.id));
    } catch (err: unknown) {
      setError(
        err instanceof DiscoveryApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to load the merchant trust center.',
      );
    } finally {
      setLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="text-xs font-medium">Loading trust and verification history...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900 dark:text-rose-100">Trust center unavailable</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">{error || 'No trust data was returned.'}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const trust = data.trustCenter;
  const verification = trust.verification;
  const latestApplication = verification.applications[0];
  const hasAction = trust.requiredActions.length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-600">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-wider font-bold">Merchant Trust Center</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Trust & Verification</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Track verification decisions, ownership claims, review moderation, reports affecting this business, and the trust audit timeline.
              Platform decisions are shown as records; merchant actions are clearly separated from them.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <VerificationBadge status={data.verificationStatus} />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-600 dark:text-slate-300"
              aria-label="Refresh trust center"
              title="Refresh trust center"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {hasAction && (
        <section className="rounded-3xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Required actions</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-amber-800 dark:text-amber-200">
                {trust.requiredActions.map((action) => <li key={action}>• {action}</li>)}
              </ul>
              {(data.verificationStatus === 'UNVERIFIED' || data.verificationStatus === 'REJECTED') && onNavigateToVerification && (
                <button
                  type="button"
                  onClick={onNavigateToVerification}
                  className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
                >
                  {data.verificationStatus === 'REJECTED' ? 'Resubmit verification' : 'Start verification'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Verification journey</h3>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Current status</span>
              <VerificationBadge status={verification.status} />
            </div>
            {latestApplication && (
              <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <p>Latest application: <span className="font-semibold text-slate-700 dark:text-slate-200">{statusLabel(latestApplication.status)}</span></p>
                <p>Submitted: {formatDate(latestApplication.created_at)}</p>
                {latestApplication.reviewed_at && <p>Reviewed: {formatDate(latestApplication.reviewed_at)}</p>}
                {latestApplication.review_reason && (
                  <p className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    Platform decision reason: <span className="font-medium text-slate-700 dark:text-slate-200">{latestApplication.review_reason}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {verification.applications.map((application) => (
              <div key={application.id} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{statusLabel(application.status)}</span>
                  <span className="text-[11px] text-slate-400">{formatDate(application.created_at)}</span>
                </div>
                {application.review_reason && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{application.review_reason}</p>}
              </div>
            ))}
            {verification.applications.length === 0 && <p className="text-xs text-slate-400">No verification applications yet.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ownership claims</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Only claim status and decision information is shown here; other claimant identities are not exposed.</p>
          <div className="mt-4 space-y-2">
            {trust.claims.map((claim) => (
              <div key={claim.id} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{statusLabel(claim.status)}</span>
                  <span className="text-[11px] text-slate-400">{formatDate(claim.created_at)}</span>
                </div>
                {claim.submitted_by_current_user && <span className="text-[10px] text-indigo-600 font-semibold">Submitted by you</span>}
                {claim.review_reason && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Decision reason: {claim.review_reason}</p>}
              </div>
            ))}
            {trust.claims.length === 0 && <p className="text-xs text-slate-400">No ownership claim history is available.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Review moderation visibility</h3>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Published', trust.reviews.publishedCount],
            ['Pending', trust.reviews.pendingCount],
            ['Rejected', trust.reviews.rejectedCount],
            ['Hidden', trust.reviews.hiddenCount],
            ['Published rating', trust.reviews.publishedRating.toFixed(2)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="text-lg font-bold text-slate-900 dark:text-white">{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Reports affecting this business</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Reporter identities and submitted descriptions are intentionally omitted.</p>
        <div className="mt-4 space-y-2">
          {trust.reports.map((report) => (
            <div key={report.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{statusLabel(report.reason_code)} · {statusLabel(report.target_type)}</div>
                <div className="text-[11px] text-slate-400 mt-1">Submitted {formatDate(report.created_at)}</div>
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{statusLabel(report.status)}</div>
              {report.resolution_note && <div className="text-[11px] text-slate-500 dark:text-slate-400">{report.resolution_note}</div>}
            </div>
          ))}
          {trust.reports.length === 0 && <p className="text-xs text-slate-400">No reports affecting this business are currently recorded.</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Trust audit timeline</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This is a merchant-facing projection of trust events. Internal actor identities and private moderation metadata are not exposed.</p>
        <div className="mt-5 space-y-0">
          {trust.timeline.map((event, index) => (
            <div key={event.id} className="relative flex gap-4 pb-5">
              {index < trust.timeline.length - 1 && <div className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />}
              <div className="relative mt-1 w-4 h-4 rounded-full border-2 border-indigo-500 bg-white dark:bg-slate-900 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{statusLabel(event.event_type)}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{statusLabel(event.entity_type)} · {formatDate(event.created_at)}</div>
                {(event.from_status || event.to_status) && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {event.from_status ? statusLabel(event.from_status) : 'Initial'} → {event.to_status ? statusLabel(event.to_status) : '—'}
                  </div>
                )}
                {event.reason && <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{event.reason}</p>}
              </div>
            </div>
          ))}
          {trust.timeline.length === 0 && <p className="text-xs text-slate-400">No trust events recorded yet.</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-100">Merchant action vs platform decision</h3>
            <p className="mt-1 text-[11px] text-indigo-800 dark:text-indigo-200 leading-relaxed">
              You control your submitted evidence and resubmissions. Verification, review moderation, report resolution, and trust-status decisions are controlled by authorized platform moderators.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
