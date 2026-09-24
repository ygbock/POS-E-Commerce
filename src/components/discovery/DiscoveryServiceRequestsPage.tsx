import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Clock3, FileText, Loader2, XCircle, AlertCircle, CalendarClock, Sparkles, Trophy, Ban } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import type { DiscoveryServiceRequest } from '../../types/discovery';

export interface DiscoveryServiceRequestsPageProps {
  onBack?: () => void;
  onOpenRequest?: (id: string) => void;
}

const statusMeta: Record<DiscoveryServiceRequest['status'], { label: string; icon: React.ReactNode; className: string }> = {
  OPEN: { label: 'Open', icon: <Clock3 className="w-4 h-4" />, className: 'text-blue-700 bg-blue-50 border-blue-200' },
  MATCHED: { label: 'Matched', icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  QUOTED: { label: 'Quotes received', icon: <FileText className="w-4 h-4" />, className: 'text-amber-700 bg-amber-50 border-amber-200' },
  ACCEPTED: { label: 'Quote accepted', icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CANCELLED: { label: 'Cancelled', icon: <XCircle className="w-4 h-4" />, className: 'text-slate-600 bg-slate-100 border-slate-200' },
  CLOSED: { label: 'Closed', icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-slate-600 bg-slate-100 border-slate-200' },
};

export const DiscoveryServiceRequestsPage: React.FC<DiscoveryServiceRequestsPageProps> = ({ onBack, onOpenRequest }) => {
  const [requests, setRequests] = useState<DiscoveryServiceRequest[]>([]);
  const [selected, setSelected] = useState<DiscoveryServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await discoveryApi.getMyServiceRequests());
    } catch (err: unknown) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load your service requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const open = async (id: string) => {
    if (onOpenRequest) { onOpenRequest(id); return; }
    setDetailLoading(true);
    setError('');
    try { setSelected(await discoveryApi.getServiceRequest(id)); }
    catch (err: unknown) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load this request.'); }
    finally { setDetailLoading(false); }
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this service request? Providers will no longer be expected to respond.')) return;
    try { await discoveryApi.cancelServiceRequest(id, 'Cancelled by customer.'); await load(); if (selected?.id === id) setSelected(null); }
    catch (err: unknown) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to cancel the request.'); }
  };

  if (loading) return <main className="max-w-5xl mx-auto px-4 py-16 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-indigo-600" /><p className="mt-3 text-sm text-slate-500">Loading your requests…</p></main>;

  return <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft className="w-4 h-4" />Back to discovery</button>
      <div className="mt-8 flex items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-widest text-indigo-600">AbaCha Discovery</p><h1 className="mt-1 text-3xl font-black">My service requests</h1><p className="mt-2 text-sm text-slate-500">Track requests, review provider quotes, and manage your service engagements.</p></div>
        <span className="text-xs font-bold text-slate-500">{requests.length} request{requests.length===1?'':'s'}</span>
      </div>
      {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
      <div className="mt-6 space-y-3">
        {requests.length===0 ? <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><FileText className="w-10 h-10 mx-auto text-slate-300" /><h2 className="mt-3 font-black">No service requests yet</h2><p className="mt-1 text-sm text-slate-500">Post a request when you need a local provider to quote for a job.</p></section> :
        requests.map(req => {
          const meta=statusMeta[req.status];
          return <article key={req.id} className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.className}`}>{meta.icon}{meta.label}</span>{req.city && <span className="text-xs text-slate-500">{req.city}</span>}</div><h2 className="mt-3 font-bold text-slate-900 line-clamp-2">{req.description}</h2><div className="mt-2 text-xs text-slate-500">Updated {req.updated_at ? new Date(req.updated_at).toLocaleString() : 'recently'}</div></div>
              <button type="button" onClick={() => void open(req.id)} className="shrink-0 inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50">View details <ChevronRight className="w-4 h-4" /></button>
            </div>
            {(req.status==='OPEN'||req.status==='MATCHED'||req.status==='QUOTED') && <button type="button" onClick={() => void cancel(req.id)} className="mt-4 text-xs font-semibold text-rose-600 hover:underline">Cancel request</button>}
          </article>;
        })}
      </div>

      {selected && <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 flex items-center justify-center">
        <section role="dialog" aria-modal="true" aria-labelledby="request-detail-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-slate-400 font-black">Request</p><h2 id="request-detail-title" className="mt-1 text-xl font-black">{selected.description}</h2></div><button type="button" aria-label="Close" onClick={() => setSelected(null)} className="text-slate-400">×</button></div>
          <div className="mt-5 flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusMeta[selected.status].className}`}>{statusMeta[selected.status].icon}{statusMeta[selected.status].label}</span></div>
          <div className="mt-6">
            {selected.quotes?.length ? (
              <>
                {selected.status === 'QUOTED' && (
                  <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                      <div>
                        <p className="text-sm font-black text-indigo-950">Compare your quotes</p>
                        <p className="mt-1 text-xs leading-5 text-indigo-800">Review price, estimated duration, provider message, and quote validity before accepting.</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {selected.quotes.map((q) => {
                    const expiresAt = q.valid_until ? new Date(q.valid_until) : null;
                    const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
                    const isSubmitted = q.status === 'SUBMITTED' && !isExpired;
                    const isAccepted = q.status === 'ACCEPTED';
                    const amount = Number(q.amount);
                    const duration = q.estimated_duration_minutes;
                    return (
                      <article key={q.id} className={`rounded-2xl border p-4 sm:p-5 ${isAccepted ? 'border-emerald-300 bg-emerald-50/50' : isExpired || q.status === 'EXPIRED' ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black">{q.business_name || 'Provider'}</h3>
                              {isAccepted && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700"><Trophy className="h-3 w-3" />Accepted</span>}
                              {isExpired && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-600"><Ban className="h-3 w-3" />Expired</span>}
                              {!isAccepted && !isExpired && q.status === 'DECLINED' && <span className="text-[10px] font-black text-slate-500">Declined</span>}
                            </div>
                            {q.service_name && <p className="mt-1 text-xs font-semibold text-slate-500">{q.service_name}</p>}
                            <p className="mt-2 text-sm text-slate-700">{q.message || 'No additional message.'}</p>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div className="text-xl font-black text-emerald-700">{q.currency} {Number.isFinite(amount) ? amount.toLocaleString() : q.amount}</div>
                            {duration != null && <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{duration} min estimated</div>}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                          {q.valid_until && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5"><CalendarClock className="h-3.5 w-3.5" />Valid until {expiresAt?.toLocaleDateString()}</span>}
                          {q.created_at && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5">Submitted {new Date(q.created_at).toLocaleDateString()}</span>}
                        </div>
                        {isSubmitted && selected.status === 'QUOTED' && (
                          <button type="button" disabled={acceptingQuoteId !== null} onClick={async () => {
                            setAcceptingQuoteId(q.id); setError('');
                            try {
                              await discoveryApi.acceptServiceQuote(selected.id, q.id);
                              setSelected(await discoveryApi.getServiceRequest(selected.id));
                              await load();
                            } catch (err: unknown) {
                              setError(err instanceof DiscoveryApiError ? err.message : 'Unable to accept quote.');
                            } finally { setAcceptingQuoteId(null); }
                          }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-60">
                            {acceptingQuoteId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Accept this quote
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <FileText className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-2 text-sm font-bold">No quotes have been received yet.</p>
                <p className="mt-1 text-xs text-slate-500">Matched providers can respond as they review your request.</p>
              </div>
            )}
          </div>
          {detailLoading && <div className="mt-4 text-xs text-slate-500">Refreshing…</div>}
        </section>
      </div>}
    </div>
  </main>;
};
