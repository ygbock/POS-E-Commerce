import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Phone, MessageCircle, Navigation, Globe2, ExternalLink, ShieldCheck, Store, BriefcaseBusiness, AlertCircle } from 'lucide-react';
import type { DiscoveryLocation, DiscoveryService, DiscoveryReview, DiscoveryPublicBusinessProfile } from '../../types/discovery';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import { VerificationBadge } from './VerificationBadge';
import { DiscoveryRating } from './DiscoveryRating';
import { DiscoveryLoadingState } from './DiscoveryLoadingState';
import { ServiceCard } from './ServiceCard';

export interface DiscoveryBusinessProfileProps {
  businessId: string;
  onBack?: () => void;
  onRequestService?: (service: DiscoveryService) => void;
  className?: string;
}

const locationText = (l?: DiscoveryLocation) => l ? [l.address_line_1,l.address_line_2,l.city,l.district,l.region].filter(Boolean).join(', ') : '';
export const DiscoveryBusinessProfile: React.FC<DiscoveryBusinessProfileProps> = ({ businessId,onBack,onRequestService,className='' }) => {
  const [profile,setProfile]=useState<DiscoveryPublicBusinessProfile|null>(null);
  const [status,setStatus]=useState<'loading'|'loaded'|'error'|'not_found'>('loading');
  const [error,setError]=useState('');
  const [showReviews,setShowReviews]=useState(false);

  useEffect(() => {
    let mounted=true;
    setStatus('loading'); setError('');
    discoveryApi.getBusinessBySlug(businessId).then(data=>{if(mounted){setProfile(data);setStatus('loaded');}})
      .catch((err:unknown)=>{if(!mounted)return;if(err instanceof DOMException&&err.name==='AbortError')return;if(err instanceof DiscoveryApiError&&err.status===404){setStatus('not_found');setError('This business listing is no longer available.');}else{setStatus('error');setError(err instanceof Error?err.message:'Unable to load this business profile.');}});
    return ()=>{mounted=false;};
  },[businessId]);

  const primary=useMemo(()=>profile?.locations.find(l=>l.is_primary&&l.is_active)||profile?.locations.find(l=>l.is_active)||profile?.locations[0],[profile]);

  if(status==='loading') return <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 p-6 ${className}`}><div className="max-w-7xl mx-auto"><DiscoveryLoadingState type="businesses" count={3}/></div></div>;
  if(status==='not_found') return <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 ${className}`}><div className="max-w-xl mx-auto px-4 py-20 text-center"><AlertCircle className="w-10 h-10 mx-auto text-slate-400"/><h1 className="mt-4 text-2xl font-black">Business not found</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p><button type="button" onClick={onBack} className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold"><ArrowLeft className="w-4 h-4"/>Back to discovery</button></div></div>;
  if(status==='error'||!profile) return <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 ${className}`}><div className="max-w-xl mx-auto px-4 py-20 text-center" role="alert"><AlertCircle className="w-10 h-10 mx-auto text-rose-500"/><h1 className="mt-4 text-2xl font-black">Unable to load business</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error||'Please try again.'}</p><button type="button" onClick={()=>window.location.reload()} className="mt-6 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold">Try again</button></div></div>;

  const b=profile.business,s=profile.settings,locations=profile.locations.filter(l=>l.is_active),services=profile.activeServices.filter(x=>x.is_active),reviews=profile.recentReviews||[];
  const rating=Number(profile.reviewsSummary?.rating||0), reviewCount=Number(profile.reviewsSummary?.count||0);
  const canCall=s.allow_phone_contact&&!!b.phone, canWhatsApp=s.allow_whatsapp_contact&&!!b.whatsapp, canDirections=s.allow_directions&&primary?.latitude!=null&&primary?.longitude!=null, canStore=s.allow_public_store_link&&b.business_mode==='DISCOVERY_AND_STORE';

  return <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur"><div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft className="w-4 h-4"/>Back to discovery</button><span className="text-xs font-black tracking-widest text-slate-400 uppercase">AbaCha Discovery</span></div></header>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="h-48 sm:h-64 bg-slate-100 dark:bg-slate-800">{b.cover_image_url?<img src={b.cover_image_url} alt="" className="w-full h-full object-cover"/>:<div className="h-full flex items-center justify-center text-slate-300"><Store className="w-20 h-20"/></div>}</div>
        <div className="p-5 sm:p-8"><div className="flex flex-col lg:flex-row lg:items-end gap-5">
          <div className="-mt-16 sm:-mt-20 w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 shadow-xl overflow-hidden flex items-center justify-center shrink-0">{b.logo_url?<img src={b.logo_url} alt={`${b.name} logo`} className="w-full h-full object-cover"/>:<span className="text-2xl font-black">{b.name.slice(0,2).toUpperCase()}</span>}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl sm:text-4xl font-black">{b.name}</h1><VerificationBadge status={b.verification_status}/></div><p className="mt-1 text-sm font-semibold text-slate-500">{b.category_name||b.business_type||'Local business'}</p><div className="mt-3 flex flex-wrap items-center gap-3"><DiscoveryRating rating={rating} reviewCount={reviewCount} size="md"/>{primary&&<span className="inline-flex items-center gap-1 text-sm text-slate-500"><MapPin className="w-4 h-4"/>{locationText(primary)}</span>}</div></div>
          <div className="flex flex-wrap gap-2">{canCall&&<a href={`tel:${b.phone}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold"><Phone className="w-4 h-4"/>Call</a>}{canWhatsApp&&<a href={`https://wa.me/${b.whatsapp!.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-bold"><MessageCircle className="w-4 h-4"/>WhatsApp</a>}{canDirections&&<a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${primary!.latitude},${primary!.longitude}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold"><Navigation className="w-4 h-4"/>Directions</a>}{canStore&&<a href={`/${encodeURIComponent(b.slug)}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold"><ExternalLink className="w-4 h-4"/>Open Store</a>}</div>
        </div>{b.description&&<p className="mt-6 max-w-4xl text-sm sm:text-base leading-7 text-slate-600 dark:text-slate-300">{b.description}</p>}</div>
      </section>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6"><div className="space-y-6">
        {s.show_products&&<section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6"><div className="flex items-center gap-2"><BriefcaseBusiness className="w-5 h-5 text-blue-600"/><h2 className="text-lg font-black">Products & store</h2></div><p className="mt-2 text-sm text-slate-500">{canStore?'Browse this business store to see its publicly listed products.':'Product information is not publicly available from this listing.'}</p>{canStore&&<a href={`/${encodeURIComponent(b.slug)}`} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold">Visit store</a>}</section>}
        {services.length>0&&<section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Services</h2><span className="text-xs font-bold text-slate-400">{services.length} listed</span></div><div className="mt-4 grid sm:grid-cols-2 gap-4">{services.map(x=><ServiceCard key={x.id} service={x} onRequestService={s.allow_service_requests?onRequestService:undefined}/>)}</div></section>}
        {s.allow_reviews&&<section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">Reviews</h2><div className="mt-2"><DiscoveryRating rating={rating} reviewCount={reviewCount} size="md"/></div></div></div>{reviews.length===0?<p className="mt-5 text-sm text-slate-500">No public reviews yet.</p>:<div className="mt-5 space-y-4">{(showReviews?reviews:reviews.slice(0,3)).map((r:DiscoveryReview)=><article key={r.id} className="border-t border-slate-100 dark:border-slate-800 pt-4"><div className="flex justify-between gap-3"><strong className="text-sm">{r.reviewer_name}</strong><span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span></div><DiscoveryRating rating={r.rating} reviewCount={1} showCount={false} size="sm" className="mt-1"/>{r.title&&<h3 className="mt-2 text-sm font-bold">{r.title}</h3>}{r.body&&<p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{r.body}</p>}{r.verified_purchase&&<span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><ShieldCheck className="w-3.5 h-3.5"/>Verified purchase</span>}</article>)}</div>}{reviews.length>3&&<button type="button" onClick={()=>setShowReviews(v=>!v)} className="mt-4 text-sm font-bold text-blue-600">{showReviews?'Show fewer reviews':'Show more reviews'}</button>}</section>}
      </div>
      <aside className="space-y-6"><section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"><h2 className="font-black">Contact & location</h2><div className="mt-4 space-y-3 text-sm">{primary&&<div className="flex gap-3"><MapPin className="w-4 h-4 mt-0.5 text-slate-400"/><span>{locationText(primary)}</span></div>}{b.phone&&s.allow_phone_contact&&<div className="flex gap-3"><Phone className="w-4 h-4 mt-0.5 text-slate-400"/><a href={`tel:${b.phone}`} className="font-semibold hover:underline">{b.phone}</a></div>}{b.email&&<div className="flex gap-3"><span className="text-slate-400">@</span><a href={`mailto:${b.email}`} className="break-all font-semibold hover:underline">{b.email}</a></div>}{b.website&&<div className="flex gap-3"><Globe2 className="w-4 h-4 mt-0.5 text-slate-400"/><a href={b.website} target="_blank" rel="noopener noreferrer" className="break-all font-semibold hover:underline">{b.website}</a></div>}</div></section>
      {locations.length>0&&<section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"><h2 className="font-black">Locations</h2><div className="mt-4 space-y-4">{locations.map(l=><div key={l.id} className="border-t border-slate-100 dark:border-slate-800 pt-3"><div className="font-bold text-sm">{l.name}</div><p className="mt-1 text-xs text-slate-500">{locationText(l)}</p>{l.latitude!=null&&l.longitude!=null&&s.allow_directions&&<a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600"><Navigation className="w-3 h-3"/>Directions</a>}</div>)}</div></section>}
      {profile.categories.length>0&&<section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"><h2 className="font-black">Categories</h2><div className="mt-3 flex flex-wrap gap-2">{profile.categories.map(c=><span key={c.id} className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold">{c.name}</span>)}</div></section>}</aside></div>
    </main>
  </div>;
};
