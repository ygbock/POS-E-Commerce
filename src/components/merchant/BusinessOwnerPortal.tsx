import React, { useEffect, useState } from 'react';
import { authClient } from '../../services/authClient';
import { DiscoveryBusinessContainer } from '../discovery/business/DiscoveryBusinessContainer';

type Business={id:string;name:string;business_mode:string;listing_status:string;verification_status:string;is_discoverable:boolean;membership_role:string};

export const BusinessOwnerPortal: React.FC = () => {
  const [data,setData]=useState<{user:any;businesses:Business[]}|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=async()=>{setLoading(true);try{const r=await fetch('/api/merchant/me',{headers:authClient.getAuthHeaders()});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Unable to load merchant workspace.');setData(j.data);}catch(e){setError(e instanceof Error?e.message:'Unable to load merchant workspace.');}finally{setLoading(false);}};
  useEffect(()=>{if(!authClient.getToken()){window.location.assign('/business/signin');return;}void load();},[]);
  const pathParts=window.location.pathname.split('/').filter(Boolean);
  const selectedBusinessId=pathParts.length>=2 && pathParts[0]==='business' && pathParts[1]!=='signup' && pathParts[1]!=='signin' ? pathParts[1] : null;
  const onboardingRequested=new URLSearchParams(window.location.search).get('onboarding')==='1';
  if(selectedBusinessId && !loading && !error) return <DiscoveryBusinessContainer initialBusinessId={selectedBusinessId} openOnboarding={onboardingRequested} />;
  if(loading)return <div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-6xl text-slate-500">Loading your merchant workspace…</div></div>;
  if(error)return <div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6"><h1 className="text-xl font-bold">Merchant portal</h1><p className="mt-2 text-red-600">{error}</p><button onClick={load} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white">Retry</button></div></div>;
  const businesses=data?.businesses||[];
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">AbaCha Merchant</p><h1 className="text-xl font-bold">Business Owner Portal</h1></div><div className="flex items-center gap-3"><span className="hidden text-sm text-slate-600 sm:block">{data?.user?.name}</span><button onClick={async()=>{await authClient.logout();window.location.assign('/business/signin')}} className="rounded-lg border px-3 py-2 text-sm">Sign out</button></div></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8"><div className="mb-8"><h2 className="text-2xl font-bold">Welcome back{data?.user?.name ? ', ' + data.user.name.split(' ')[0] : ''}</h2><p className="mt-1 text-slate-500">Manage your business listings, discovery presence and store setup.</p></div>
      {businesses.length===0?<div className="rounded-2xl bg-white p-8 text-center"><h3 className="text-lg font-bold">Create your first business</h3><p className="mt-2 text-sm text-slate-500">Your owner account is ready. Create a business to begin onboarding.</p></div>:
      <div className="grid gap-5 lg:grid-cols-3">{businesses.map(b=><div key={b.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="font-bold">{b.name}</h3><p className="mt-1 text-xs text-slate-500">{b.business_mode==='DISCOVERY_AND_STORE'?'Discovery + Store':'Discovery only'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{b.listing_status.replace('_',' ')}</span></div><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Verification</span><b>{b.verification_status}</b></div><div className="flex justify-between"><span className="text-slate-500">Discoverable</span><b>{b.is_discoverable?'Yes':'Not yet'}</b></div></div><button onClick={()=>window.location.assign('/business/'+b.id+(b.listing_status==='DRAFT'?'?onboarding=1':''))} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 font-semibold text-white">Manage business</button></div>)}</div>}
    </main></div>;
};
