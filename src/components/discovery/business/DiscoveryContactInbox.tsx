import React, { useEffect, useState } from 'react';
import { Mail, Phone, RefreshCw, CheckCircle2, MessageSquare, X } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness, DiscoveryContactInquiry } from '../../../types/discovery';

interface Props {
  business: DiscoveryBusiness;
}

const STATUS_OPTIONS: Array<DiscoveryContactInquiry['status'] | 'ALL'> = ['ALL', 'OPEN', 'READ', 'RESPONDED', 'CLOSED'];

export const DiscoveryContactInbox: React.FC<Props> = ({ business }) => {
  const [items, setItems] = useState<DiscoveryContactInquiry[]>([]);
  const [status, setStatus] = useState<DiscoveryContactInquiry['status'] | 'ALL'>('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<DiscoveryContactInquiry | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await discoveryApi.getBusinessContactInquiries(business.id, status === 'ALL' ? undefined : status);
      setItems(data);
    } catch (err: unknown) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load contact inquiries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [business.id, status]);

  const update = async (next: 'READ' | 'RESPONDED' | 'CLOSED') => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const updated = await discoveryApi.updateContactInquiry(business.id, selected.id, next, note);
      setSelected(updated);
      setItems((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update inquiry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Contact Inbox</h2>
          <p className="mt-1 text-xs text-slate-500">Customer inquiries submitted from your public Discovery profile.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((option) => (
          <button key={option} type="button" onClick={() => setStatus(option)} className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${status === option ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {option === 'ALL' ? 'All' : option}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 text-xs text-rose-700 dark:text-rose-300">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading inquiries…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
          <MessageSquare className="w-8 h-8 mx-auto text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">No inquiries in this queue.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => { setSelected(item); setNote(item.merchant_note || ''); }} className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{item.subject || 'Customer inquiry'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{item.customer_name}</p>
                </div>
                <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">{item.status}</span>
              </div>
              <p className="mt-3 text-xs text-slate-500 line-clamp-2">{item.message}</p>
              <p className="mt-3 text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="contact-inquiry-title">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 id="contact-inquiry-title" className="text-lg font-black text-slate-900 dark:text-white">{selected.subject || 'Customer inquiry'}</h3>
                <p className="mt-1 text-xs text-slate-500">{selected.customer_name} • {new Date(selected.created_at).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close inquiry"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                {selected.customer_phone && <a href={`tel:${selected.customer_phone}`} className="inline-flex items-center gap-2 font-bold text-indigo-600"><Phone className="w-4 h-4" />{selected.customer_phone}</a>}
                {selected.customer_email && <a href={`mailto:${selected.customer_email}`} className="inline-flex items-center gap-2 font-bold text-indigo-600 break-all"><Mail className="w-4 h-4" />{selected.customer_email}</a>}
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{selected.message}</div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                Merchant note
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-normal" placeholder="Record how you handled the inquiry…" />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                {selected.status === 'OPEN' && <button type="button" disabled={busy} onClick={() => void update('READ')} className="px-4 py-2.5 rounded-xl border text-xs font-bold">Mark Read</button>}
                {selected.status !== 'CLOSED' && <button type="button" disabled={busy} onClick={() => void update('RESPONDED')} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"><CheckCircle2 className="inline w-4 h-4 mr-1" />Mark Responded</button>}
                {selected.status !== 'CLOSED' && <button type="button" disabled={busy} onClick={() => void update('CLOSED')} className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold">Close</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
