import React, { useState } from 'react';
import { ArrowLeft, Send, MapPin, CalendarDays, Wallet, CheckCircle2, AlertCircle, LocateFixed } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import { authClient } from '../../services/authClient';

export interface DiscoveryServiceRequestPageProps { serviceName?: string; serviceId?: string; onBack?: () => void; onViewRequests?: () => void; }

export const DiscoveryServiceRequestPage: React.FC<DiscoveryServiceRequestPageProps> = ({ serviceName, serviceId, onBack, onViewRequests }) => {
  const [form, setForm] = useState({ customerName:'', customerPhone:'', customerEmail:'', city:'', district:'', preferredDate:'', budgetTo:'', description: serviceName ? 'I am interested in ' + serviceName + '. ' : '' });
  const [coords, setCoords] = useState<{lat:number;lng:number} | null>(null);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const update = (key: keyof typeof form, value: string) => setForm(v => ({...v,[key]:value}));
  const locate = () => { if (!navigator.geolocation) { setError('Location is not available in this browser.'); return; } setLocating(true); navigator.geolocation.getCurrentPosition(p => { setCoords({lat:p.coords.latitude,lng:p.coords.longitude}); setLocating(false); }, () => { setLocating(false); setError('Location permission was not granted. You can continue without sharing your location.'); }, {enableHighAccuracy:false,timeout:8000}); };
  const signIn = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.assign('/login?redirect=' + encodeURIComponent(returnTo));
  };
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError('');
    if (!authClient.getToken()) {
      setStatus('error');
      setError('Sign in is required to submit and track a service request.');
      return;
    } if (!form.customerName.trim() || !form.description.trim()) { setError('Please provide your name and describe what you need.'); return; } if (form.budgetTo && (!Number.isFinite(Number(form.budgetTo)) || Number(form.budgetTo) < 0)) { setError('Please enter a valid maximum budget.'); return; } setStatus('submitting'); try { const result = await discoveryApi.createServiceRequest({ customerName:form.customerName.trim(), description:form.description.trim(), customerPhone:form.customerPhone.trim()||undefined, customerEmail:form.customerEmail.trim()||undefined, city:form.city.trim()||undefined, district:form.district.trim()||undefined, latitude:coords?.lat, longitude:coords?.lng, preferredDate:form.preferredDate||undefined, budgetTo:form.budgetTo ? Number(form.budgetTo) : undefined, serviceId:serviceId || undefined }); setRequestId(result.id); setStatus('success'); } catch (err: unknown) { setStatus('error'); setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to submit your service request. Please try again.'); } };
  if (status === 'success') return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"><main className="max-w-xl mx-auto px-4 py-16 text-center"><div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-9 h-9"/></div><h1 className="mt-6 text-3xl font-black">Request submitted</h1><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Your request is now available to matching service providers. Providers can review your requirements and respond with quotes.</p><div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-left"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Request reference</div><div className="mt-1 font-black break-all">{requestId}</div></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
<button type="button" onClick={onViewRequests} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">Track my request</button>
<button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"><ArrowLeft className="w-4 h-4"/>Back to discovery</button>
</div></main></div>;
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"><header className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95"><div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft className="w-4 h-4"/>Back to discovery</button></div></header>
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-widest text-blue-600">AbaCha Discovery</p><h1 className="mt-2 text-3xl sm:text-4xl font-black">Post a service request</h1><p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">Tell local providers what you need. Matching businesses can review your request and send you a quote.</p></div>
      <form onSubmit={submit} className="mt-8 grid lg:grid-cols-[1fr_280px] gap-6"><section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 space-y-5">
        {serviceName && <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 p-4"><div className="text-xs font-bold text-blue-600">Selected service</div><div className="mt-1 font-black">{serviceName}</div></div>}
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-semibold">Your name<input required value={form.customerName} onChange={e=>update('customerName',e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label><label className="text-sm font-semibold">Phone<input type="tel" value={form.customerPhone} onChange={e=>update('customerPhone',e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label><label className="text-sm font-semibold">Email<input type="email" value={form.customerEmail} onChange={e=>update('customerEmail',e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label><label className="text-sm font-semibold">Preferred date<input type="date" value={form.preferredDate} onChange={e=>update('preferredDate',e.target.value)} min={new Date().toISOString().slice(0,10)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label></div>
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-semibold">City<input value={form.city} onChange={e=>update('city',e.target.value)} placeholder="e.g. Freetown" className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label><label className="text-sm font-semibold">District<input value={form.district} onChange={e=>update('district',e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label></div>
        <label className="text-sm font-semibold block">Maximum budget (SLE)<input inputMode="decimal" value={form.budgetTo} onChange={e=>update('budgetTo',e.target.value)} placeholder="Optional" className="mt-1.5 w-full rounded-xl border px-3 py-2.5 bg-transparent"/></label>
        <label className="text-sm font-semibold block">Describe what you need<textarea required minLength={10} value={form.description} onChange={e=>update('description',e.target.value)} rows={6} placeholder="Describe the job, timing, location, and useful details…" className="mt-1.5 w-full rounded-xl border px-3 py-3 bg-transparent resize-y"/></label>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>{error}</div>}
        {!authClient.getToken() ? (
          <button
            type="button"
            onClick={signIn}
            className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 font-bold"
          >
            <Send className="w-4 h-4" />
            Sign in to submit request
          </button>
        ) : (
          <button
            disabled={status==='submitting'}
            type="submit"
            className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-3 font-bold"
          >
            {status==='submitting'?'Submitting…':<><Send className="w-4 h-4"/>Submit request</>}
          </button>
        )}
      </section><aside className="space-y-4"><section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"><h2 className="font-black">Request details</h2><div className="text-xs text-slate-500 space-y-3"><div className="flex gap-2"><MapPin className="w-4 h-4 shrink-0"/>Add your city or district so providers can assess the service area.</div><div className="flex gap-2"><CalendarDays className="w-4 h-4 shrink-0"/>A preferred date helps providers respond accurately.</div><div className="flex gap-2"><Wallet className="w-4 h-4 shrink-0"/>A budget is optional and can help providers quote.</div></div></section>
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"><h2 className="font-black">Share location</h2><p className="mt-2 text-xs text-slate-500">Location sharing is optional and is used to help providers assess proximity.</p><button type="button" onClick={locate} disabled={locating} className="mt-4 w-full inline-flex justify-center items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold disabled:opacity-60"><LocateFixed className="w-4 h-4"/>{locating?'Locating…':coords?'Location attached':'Use my location'}</button></section></aside></form>
    </main></div>;
};