import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Clock3, FileText, Loader2, XCircle, AlertCircle } from 'lucide-react';
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
          <div className="mt-6 space-y-3">{selected.quotes?.length ? selected.quotes.map(q => <div key={q.id} className="rounded-2xl border p-4"><div className="flex justify-between gap-4"><div><div className="font-black">{q.business_name || 'Provider'}</div><div className="text-xs text-slate-500 mt-1">{q.message || 'No additional message.'}</div></div><div className="font-black text-emerald-700 whitespace-nowrap">{q.currency} {q.amount}</div></div>{q.valid_until && <div className="mt-2 text-[11px] text-slate-500">Valid until {new Date(q.valid_until).toLocaleDateString()}</div>}{q.status==='SUBMITTED' && selected.status==='QUOTED' && <button type="button" onClick={async()=>{try{await discoveryApi.acceptServiceQuote(selected.id,q.id);setSelected(await discoveryApi.getServiceRequest(selected.id));await load();}catch(err:unknown){setError(err instanceof DiscoveryApiError?err.message:'Unable to accept quote.');}}} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Accept quote</button>}</div>) : <p className="text-sm text-slate-500">No quotes have been received yet.</p>}</div>
          {detailLoading && <div className="mt-4 text-xs text-slate-500">Refreshing…</div>}
        </section>
      </div>}
    </div>
  </main>;
};
