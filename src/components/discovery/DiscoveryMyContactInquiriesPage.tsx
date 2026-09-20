import React, { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare, RefreshCw } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import type { DiscoveryContactInquiry } from '../../types/discovery';

interface Props {
  onBack?: () => void;
}

export const DiscoveryMyContactInquiriesPage: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<DiscoveryContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await discoveryApi.getMyContactInquiries());
    } catch (err: unknown) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load your inquiries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <button type="button" onClick={onBack || (() => window.history.back())} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
            <ArrowLeft className="w-4 h-4" /> Back to Discovery
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-black">My Contact Inquiries</h1>
          <p className="mt-1 text-sm text-slate-500">Track inquiries you have sent to businesses through AbaCha Discovery.</p>
        </div>

        {error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">{error}</div>}

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading inquiries…</div>
        ) : items.length === 0 ? (
          <div className="py-16 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
            <MessageSquare className="w-10 h-10 mx-auto text-slate-400" />
            <p className="mt-3 text-sm font-bold">No contact inquiries yet.</p>
            <p className="mt-1 text-xs text-slate-500">When you contact a business through a Discovery profile, your inquiry will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black">{item.business_name || 'Business'}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{item.subject || 'Contact inquiry'}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">{item.status}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{item.message}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-400">
                  <span>Sent {new Date(item.created_at).toLocaleString()}</span>
                  {item.responded_at && <span>Responded {new Date(item.responded_at).toLocaleString()}</span>}
                  {item.closed_at && <span>Closed {new Date(item.closed_at).toLocaleString()}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
