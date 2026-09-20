import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Flag,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { authClient } from '../../services/authClient';

type Queue = 'verification' | 'claims' | 'reviews' | 'reports';

interface ModerationItem {
  id: string;
  business_id?: string;
  business_name?: string;
  organization_id?: string | null;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

const queueMeta: Record<Queue, { label: string; description: string; icon: React.ReactNode }> = {
  verification: { label: 'Verification', description: 'Business verification applications awaiting review.', icon: <ShieldCheck className="w-4 h-4" /> },
  claims: { label: 'Claims', description: 'Ownership claims for discovery businesses.', icon: <UserCheck className="w-4 h-4" /> },
  reviews: { label: 'Reviews', description: 'Customer reviews awaiting moderation.', icon: <FileCheck2 className="w-4 h-4" /> },
  reports: { label: 'Reports', description: 'Business and service abuse reports.', icon: <Flag className="w-4 h-4" /> },
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
  const [queue, setQueue] = useState<Queue>('verification');
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reportsFilter, setReportsFilter] = useState('');

  const endpoint = useMemo(() => {
    if (queue === 'reports' && reportsFilter) return `/api/platform/discovery/moderation/reports?status=${encodeURIComponent(reportsFilter)}`;
    if (queue === 'reviews') return '/api/platform/discovery/moderation/reviews?status=PENDING';
    return `/api/platform/discovery/moderation/${queue}`;
  }, [queue, reportsFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await platformRequest<ModerationItem[]>(endpoint));
    } catch (err: any) {
      setError(err?.message || 'Unable to load moderation queue.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

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
      const body = queue === 'reports'
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
    const positive = ['APPROVED', 'PUBLISHED', 'RESOLVED'];
    const negative = ['REJECTED', 'HIDDEN', 'DISMISSED'];
    const cls = positive.includes(status)
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
      : negative.includes(status)
        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800'
        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800';
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{status}</span>;
  };

  return (
    <section className="space-y-6" aria-labelledby="platform-discovery-moderation-title">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Platform Trust
            </span>
            <span className="text-xs text-slate-400">Platform-wide moderation</span>
          </div>
          <h1 id="platform-discovery-moderation-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Discovery Trust & Moderation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Review verification, ownership claims, customer reviews, and abuse reports. Decisions are server-authoritative and audited.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh queue
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(queueMeta) as Queue[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setQueue(key)}
            className={`rounded-2xl border p-4 text-left transition-colors ${queue === key
              ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/30'
              : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-indigo-600 dark:text-indigo-400">{queueMeta[key].icon}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">{key === queue ? items.length : '—'}</span>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{queueMeta[key].label}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{queueMeta[key].description}</p>
          </button>
        ))}
      </div>

      {queue === 'reports' && (
        <div className="flex items-center gap-2">
          <label htmlFor="report-status-filter" className="text-xs font-bold text-slate-600 dark:text-slate-300">Report status</label>
          <select
            id="report-status-filter"
            value={reportsFilter}
            onChange={(e) => setReportsFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All open & historical</option>
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{queueMeta[queue].label} queue</h2>
            <span className="text-xs text-slate-400">{items.length} item(s)</span>
          </div>
        </div>

        {loading ? (
          <div role="status" className="p-12 text-center text-sm text-slate-500">
            <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />
            Loading moderation queue…
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Queue is clear</p>
            <p className="mt-1 text-xs text-slate-500">No records match the current filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {String(item.business_name || item.service_name || item.id)}
                      </h3>
                      {statusBadge(item.status)}
                    </div>
                    <p className="mt-1 text-[11px] font-mono text-slate-400">{item.id}</p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Submitted {new Date(item.created_at).toLocaleString()}
                      {item.organization_id ? ` · Organization ${item.organization_id}` : ''}
                    </p>

                    {queue === 'verification' && (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200">
                        {JSON.stringify(item.evidence || {}, null, 2)}
                      </pre>
                    )}
                    {queue === 'claims' && (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200">
                        {JSON.stringify(item.evidence || {}, null, 2)}
                      </pre>
                    )}
                    {queue === 'reviews' && (
                      <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs font-bold">{String(item.title || 'Customer review')}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{String(item.body || '')}</p>
                        <p className="mt-2 text-[11px] text-slate-400">Rating: {String(item.rating || '—')} · Reviewer: {String(item.reviewer_name || 'Customer')}</p>
                      </div>
                    )}
                    {queue === 'reports' && (
                      <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs font-bold">{String(item.reason_code || 'Report')}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{String(item.description || '')}</p>
                        {item.service_name && <p className="mt-2 text-[11px] text-slate-400">Service: {String(item.service_name)}</p>}
                      </div>
                    )}
                  </div>

                  {(queue !== 'reports' || ['PENDING', 'UNDER_REVIEW'].includes(item.status)) && (
                    <div className="w-full max-w-md space-y-2 lg:w-96">
                      <label htmlFor={`reason-${item.id}`} className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Decision note</label>
                      <textarea
                        id={`reason-${item.id}`}
                        value={reason[item.id] || ''}
                        onChange={(e) => setReason((prev) => ({ ...prev, [item.id]: e.target.value.slice(0, 2000) }))}
                        rows={2}
                        placeholder="Record the moderation rationale…"
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                      />
                      <div className="flex flex-wrap gap-2">
                        {queue === 'verification' && (
                          <>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'APPROVED')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />Approve</button>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'REJECTED')} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Reject</button>
                          </>
                        )}
                        {queue === 'claims' && (
                          <>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'APPROVED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve claim</button>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'REJECTED')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reject claim</button>
                          </>
                        )}
                        {queue === 'reviews' && (
                          <>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'PUBLISHED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Publish</button>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'HIDDEN')} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Hide</button>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'REJECTED')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reject</button>
                          </>
                        )}
                        {queue === 'reports' && (
                          <>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'UNDER_REVIEW')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Under review</button>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'RESOLVED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Resolve</button>
                            <button type="button" disabled={busyId===item.id} onClick={() => void decide(item,'DISMISSED')} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Dismiss</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
