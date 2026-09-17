import React, { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, Store, Wrench, Package, Star, Phone, Navigation, Clock3, ShieldCheck, Send, SlidersHorizontal } from 'lucide-react';

type SearchType = 'all' | 'businesses' | 'products' | 'services';

interface DiscoveryResult {
  businesses: any[];
  products: any[];
  services: any[];
}

export const DiscoveryMarketplace: React.FC = () => {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<SearchType>('all');
  const [results, setResults] = useState<DiscoveryResult>({ businesses: [], products: [], services: [] });
  const [loading, setLoading] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [request, setRequest] = useState({ customerName: '', customerPhone: '', description: '', city: '', preferredDate: '', budgetTo: '' });

  const search = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, type, limit: '30' });
      if (location) params.set('city', location);
      const response = await fetch(`/api/discovery/search?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Search failed');
      setResults(body.data || { businesses: [], products: [], services: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void search(); }, [type]);

  const total = useMemo(() => results.businesses.length + results.products.length + results.services.length, [results]);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/discovery/service-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    if (!response.ok) return;
    setRequestOpen(false);
    setRequest({ customerName: '', customerPhone: '', description: '', city: '', preferredDate: '', budgetTo: '' });
  };

  return (
    <div className="min-h-full space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 sm:p-10 text-white shadow-xl">
        <div className="max-w-4xl mx-auto text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold"><MapPin className="w-3.5 h-3.5" /> Discover businesses, products & services near you</div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">What are you looking for?</h1>
          <p className="text-sm sm:text-base text-slate-300">Find a nearby business, check product availability, or request a service from local providers.</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_190px_auto] gap-2 bg-white p-2 rounded-2xl shadow-2xl text-slate-900">
            <div className="flex items-center gap-2 px-3"><Search className="w-5 h-5 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }} placeholder="Products, businesses or services" className="w-full py-3 outline-none text-sm" /></div>
            <div className="flex items-center gap-2 px-3 border-t md:border-t-0 md:border-l border-slate-200"><MapPin className="w-4 h-4 text-slate-400" /><input value={location} onChange={e => setLocation(e.target.value)} placeholder="City / area" className="w-full py-3 outline-none text-sm" /></div>
            <button onClick={() => void search()} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700">{loading ? 'Searching…' : 'Search'}</button>
          </div>
          <button onClick={() => setRequestOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/15"><Send className="w-4 h-4" /> Post a service request</button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {([['all','All',SlidersHorizontal],['businesses','Businesses',Store],['products','Products',Package],['services','Services',Wrench]] as const).map(([id,label,Icon]) => <button key={id} onClick={() => setType(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border ${type===id?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}><Icon className="w-4 h-4" />{label}</button>)}
        <span className="ml-auto text-xs text-slate-500">{total} results</span>
      </div>

      {type !== 'products' && results.businesses.length > 0 && <section className="space-y-3"><h2 className="text-lg font-black text-slate-900 dark:text-white">Businesses</h2><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{results.businesses.map((b:any)=><article key={b.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow"><div className="h-28 bg-slate-100 dark:bg-slate-800">{b.cover_image_url && <img src={b.cover_image_url} alt="" className="w-full h-full object-cover" />}</div><div className="p-4 space-y-3"><div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center overflow-hidden">{b.logo_url?<img src={b.logo_url} alt="" className="w-full h-full object-cover" />:<Store className="w-5 h-5" />}</div><div className="min-w-0 flex-1"><h3 className="font-bold truncate">{b.name}</h3><p className="text-xs text-slate-500">{b.category_name || b.business_type || 'Local business'}</p></div>{b.verification_status==='VERIFIED'&&<ShieldCheck className="w-5 h-5 text-emerald-500" title="Verified" />}</div><p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{b.short_description || 'Discover this local business on AbaCha.'}</p><div className="flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[b.city,b.district].filter(Boolean).join(', ')||'Location available'}</span><span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" />{Number(b.rating||0).toFixed(1)} ({b.review_count||0})</span></div><div className="flex gap-2"><a href={`/business/${encodeURIComponent(b.slug)}`} className="flex-1 text-center rounded-lg bg-slate-900 text-white py-2 text-xs font-bold">View business</a>{b.phone&&<a href={`tel:${b.phone}`} className="rounded-lg border border-slate-200 p-2" title="Call"><Phone className="w-4 h-4" /></a>}{b.latitude&&b.longitude&&<a href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2" title="Directions"><Navigation className="w-4 h-4" /></a>}</div></div></article>)}</div></section>}

      {type !== 'businesses' && results.products.length > 0 && <section className="space-y-3"><h2 className="text-lg font-black text-slate-900 dark:text-white">Products available from local businesses</h2><div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">{results.products.map((p:any)=><article key={p.variant_id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"><div className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3">{Array.isArray(p.images)&&p.images[0]&&<img src={p.images[0]} alt="" className="w-full h-full object-cover" />}</div><h3 className="font-bold text-sm line-clamp-2">{p.product_name}</h3><p className="text-xs text-slate-500 mt-1">{p.business_name}</p><div className="flex justify-between items-center mt-3"><span className="font-black text-sm">{p.show_prices===false?'Price on request':`${p.retail_price} SLE`}</span>{p.show_stock_status!==false&&<span className={`text-[10px] font-bold ${Number(p.available_stock)>0?'text-emerald-600':'text-amber-600'}`}>{Number(p.available_stock)>0?'Available':'Check stock'}</span>}</div></article>)}</div></section>}

      {type !== 'businesses' && results.services.length > 0 && <section className="space-y-3"><h2 className="text-lg font-black text-slate-900 dark:text-white">Services</h2><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{results.services.map((s:any)=><article key={s.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Wrench className="w-5 h-5" /></div><div className="min-w-0"><h3 className="font-bold">{s.name}</h3><p className="text-xs text-slate-500">{s.business_name}</p></div></div><p className="text-sm text-slate-600 dark:text-slate-300 mt-3 line-clamp-3">{s.description || 'Service available from this local provider.'}</p><div className="flex justify-between items-center mt-4 text-xs"><span className="font-bold">{s.price_from!=null?`From ${s.price_from} ${s.currency}`:'Request a quote'}</span><span className="text-slate-500 inline-flex gap-1 items-center"><Clock3 className="w-3.5 h-3.5" />{s.duration_minutes?`${s.duration_minutes} min`:'Flexible'}</span></div></article>)}</div></section>}

      {!loading && total===0 && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center"><Search className="w-8 h-8 mx-auto text-slate-400" /><h3 className="mt-3 font-bold">No matches yet</h3><p className="text-sm text-slate-500 mt-1">Try a broader search, another area, or post a service request.</p></div>}

      {requestOpen && <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"><form onSubmit={submitRequest} className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"><div><h2 className="text-xl font-black">Post a service request</h2><p className="text-sm text-slate-500">Tell local providers what you need and let them respond with quotes.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[['customerName','Your name'],['customerPhone','Phone'],['city','City / area'],['preferredDate','Preferred date'],['budgetTo','Budget ceiling']].map(([key,placeholder])=><input key={key} required={key==='customerName'} value={(request as any)[key]} onChange={e=>setRequest({...request,[key]:e.target.value})} placeholder={placeholder} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />)}</div><textarea required value={request.description} onChange={e=>setRequest({...request,description:e.target.value})} placeholder="Describe what you need" rows={5} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /><div className="flex justify-end gap-2"><button type="button" onClick={()=>setRequestOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold">Cancel</button><button className="rounded-xl bg-blue-600 text-white px-5 py-2 text-sm font-bold">Send request</button></div></form></div>}
    </div>
  );
};
