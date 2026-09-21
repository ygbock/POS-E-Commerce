import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, XCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import type { DiscoveryBusinessClaim } from '../../types/discovery';

interface Props {
  onBack?: () => void;
}

const statusMeta = {
  PENDING: { label: 'Pending review', Icon: Clock3, className: 'text-amber-700 bg-amber-50 border-amber-200' },
  APPROVED: { label: 'Approved', Icon: CheckCircle2, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  REJECTED: { label: 'Rejected', Icon: XCircle, className: 'text-red-700 bg-red-50 border-red-200' },
} as const;

export const DiscoveryMyClaimsPage: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<DiscoveryBusinessClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      setItems(await discoveryApi.getMyClaims());
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load your ownership claims.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700" aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">My business claims</h1>
            <p className="text-sm text-slate-500">Track ownership claims you submitted to AbaCha.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-900 p-4 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Claim status shows the current platform decision. Approval confirms the claim workflow decision; it does not by itself verify every business detail.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading your claims…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
          You have not submitted any ownership claims yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((claim) => {
            const meta = statusMeta[claim.status];
            const StatusIcon = meta.Icon;
            return (
              <article key={claim.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">{claim.business_name || 'Business listing'}</h2>
                    <p className="text-xs text-slate-500 mt-1">Submitted {new Date(claim.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>
                    <StatusIcon className="w-3.5 h-3.5" /> {meta.label}
                  </span>
                </div>
                {claim.status !== 'PENDING' && claim.reviewed_at && (
                  <p className="mt-3 text-xs text-slate-500">Reviewed {new Date(claim.reviewed_at).toLocaleString()}</p>
                )}
                {claim.review_reason && (
                  <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Platform decision note</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{claim.review_reason}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
