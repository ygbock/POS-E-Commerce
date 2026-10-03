import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, LifeBuoy, MessageSquare, Plus, RefreshCw, Send, X } from 'lucide-react';
import { supportApi, SupportTicket } from '../../services/supportApi';

const statusLabel: Record<string,string> = {
  OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_ON_CUSTOMER: 'Waiting on customer', RESOLVED: 'Resolved', CLOSED: 'Closed',
};

export const SupportWorkspace: React.FC<{ platform?: boolean }> = ({ platform = false }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<SupportTicket['priority']>('NORMAL');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await supportApi.listTickets(platform);
      setTickets(data);
      if (selected) {
        const fresh = await supportApi.getTicket(selected.id, platform);
        setSelected(fresh);
      }
    } catch (e: any) { setError(e?.message || 'Unable to load support tickets.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [platform]);

  const select = async (ticket: SupportTicket) => {
    try { setSelected(await supportApi.getTicket(ticket.id, platform)); }
    catch (e: any) { setError(e?.message || 'Unable to load ticket.'); }
  };

  const create = async () => {
    if (!subject.trim() || !description.trim()) return;
    setSaving(true); setError(null);
    try {
      const created = await supportApi.createTicket({ subject, description, priority });
      setSubject(''); setDescription(''); setPriority('NORMAL'); setShowCreate(false);
      setSelected(created); await load();
    } catch (e: any) { setError(e?.message || 'Unable to create ticket.'); }
    finally { setSaving(false); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setSaving(true); setError(null);
    try {
      const updated = await supportApi.reply(selected.id, reply, platform);
      setReply(''); setSelected(updated); await load();
    } catch (e: any) { setError(e?.message || 'Unable to send reply.'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (status: SupportTicket['status']) => {
    if (!selected || !platform) return;
    setSaving(true);
    try { const updated = await supportApi.updateTicket(selected.id, { status }); setSelected(updated); await load(); }
    catch (e: any) { setError(e?.message || 'Unable to update ticket.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-5 p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><LifeBuoy className="w-5 h-5 text-blue-600" /><h1 className="text-xl font-bold text-slate-900 dark:text-white">{platform ? 'Platform Support' : 'Help & Support'}</h1></div>
          <p className="text-sm text-slate-500 mt-1">{platform ? 'Review, assign and resolve tenant support requests.' : 'Contact AbaCha support and follow your requests.'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="p-2 rounded-lg border bg-white dark:bg-slate-900 dark:border-slate-800"><RefreshCw className="w-4 h-4" /></button>
          {!platform && <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> New ticket</button>}
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">Tickets ({tickets.length})</div>
          <div className="overflow-y-auto max-h-[65vh]">
            {loading ? <div className="p-6 text-sm text-slate-500">Loading tickets…</div> : tickets.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No support tickets.</div> :
              tickets.map(ticket => <button key={ticket.id} onClick={() => void select(ticket)} className={`w-full text-left p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${selected?.id === ticket.id ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{ticket.subject}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{ticket.priority}</span></div>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-500"><Clock3 className="w-3.5 h-3.5" />{statusLabel[ticket.status] || ticket.status}<span>•</span>{new Date(ticket.updated_at).toLocaleString()}</div>
              </button>)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[420px]">
          {!selected ? <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Select a ticket to view the conversation.</div> :
            <>
              <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-slate-900 dark:text-white">{selected.subject}</h2><p className="text-xs text-slate-500 mt-1">{selected.category} · {selected.priority} · {statusLabel[selected.status]}</p></div>
                  {platform && <select value={selected.status} onChange={e => void updateStatus(e.target.value as SupportTicket['status'])} className="border rounded-lg px-2 py-1 text-xs dark:bg-slate-900"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="WAITING_ON_CUSTOMER">Waiting on customer</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select>}
                </div>
                <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selected.description}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {(selected.messages || []).map(message => <div key={message.id} className={`max-w-[85%] rounded-xl p-3 ${message.author_user_id === selected.created_by_user_id ? 'bg-slate-100 dark:bg-slate-800' : 'bg-blue-50 dark:bg-blue-950/30 ml-auto'}`}>
                  <div className="text-[10px] text-slate-500 mb-1">{message.author_email || message.author_user_id} · {new Date(message.created_at).toLocaleString()}</div>
                  <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{message.body}</div>
                </div>)}
              </div>
              {selected.status !== 'CLOSED' && selected.status !== 'RESOLVED' && <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2"><input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply(); } }} placeholder="Write a reply…" className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" /><button disabled={saving || !reply.trim()} onClick={() => void sendReply()} className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"><Send className="w-4 h-4" /></button></div>}
            </>
          }
        </div>
      </div>
      {showCreate && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border dark:border-slate-800">
        <div className="p-4 border-b flex items-center justify-between"><h2 className="font-bold">New support ticket</h2><button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-3"><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" /><select value={priority} onChange={e => setPriority(e.target.value as SupportTicket['priority'])} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select><textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} placeholder="Describe the issue…" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" /><button disabled={saving || !subject.trim() || !description.trim()} onClick={() => void create()} className="w-full py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">Submit ticket</button></div>
      </div></div>}
    </div>
  );
};
