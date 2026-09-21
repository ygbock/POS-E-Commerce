import React, { FormEvent, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { authClient } from '../../services/authClient';

export const BusinessOwnerSignup: React.FC = () => {
  const [form, setForm] = useState({ name:'', email:'', password:'', confirmPassword:'', businessName:'', businessMode:'DISCOVERY_ONLY' as 'DISCOVERY_ONLY'|'DISCOVERY_AND_STORE' });
  const [loading,setLoading]=useState(false); const [error,setError]=useState('');
  const submit=async(e:FormEvent)=>{e.preventDefault();setError('');if(form.password.length<12)return setError('Password must be at least 12 characters.');if(form.password!==form.confirmPassword)return setError('Passwords do not match.');setLoading(true);try{await authClient.registerBusinessOwner({name:form.name,email:form.email,password:form.password,businessName:form.businessName,businessMode:form.businessMode});window.location.assign('/business');}catch(err){setError(err instanceof Error?err.message:'Unable to create your business account.');}finally{setLoading(false);}};
  const set=(key:string,value:string)=>setForm(v=>({...v,[key]:value}));
  return <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-900 relative">
    {/* Floating Back Button */}
    <div className="absolute top-4 left-4 z-10">
      <a
        href="/discover"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-300 hover:text-white transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Marketplace</span>
      </a>
    </div>

    <div className="mx-auto max-w-2xl mt-6">
      <div className="mb-8 text-center text-white"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-black text-slate-950">A</div><h1 className="text-3xl font-bold">Start your business on AbaCha</h1><p className="mt-2 text-slate-400">Create your owner account and begin your Discovery listing.</p></div>
      <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8 relative">
        <div className="absolute top-6 right-6">
          <a
            href="/discover"
            className="text-slate-400 hover:text-slate-600 transition"
            title="Close and return to marketplace"
          >
            <X className="w-5 h-5" />
          </a>
        </div>{error&&<div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Full name<input required value={form.name} onChange={e=>set('name',e.target.value)} className="mt-1.5 w-full rounded-xl border p-3" autoComplete="name"/></label>
        <label className="text-sm font-medium">Email<input required type="email" value={form.email} onChange={e=>set('email',e.target.value)} className="mt-1.5 w-full rounded-xl border p-3" autoComplete="email"/></label>
        <label className="text-sm font-medium">Password<input required type="password" minLength={12} value={form.password} onChange={e=>set('password',e.target.value)} className="mt-1.5 w-full rounded-xl border p-3" autoComplete="new-password"/></label>
        <label className="text-sm font-medium">Confirm password<input required type="password" minLength={12} value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} className="mt-1.5 w-full rounded-xl border p-3" autoComplete="new-password"/></label>
        <label className="text-sm font-medium sm:col-span-2">Business name<input required value={form.businessName} onChange={e=>set('businessName',e.target.value)} className="mt-1.5 w-full rounded-xl border p-3" placeholder="e.g. Freetown Mobile Hub"/></label>
      </div>
      <div className="mt-6"><p className="text-sm font-semibold">How do you want to use AbaCha?</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={()=>set('businessMode','DISCOVERY_ONLY')} className={form.businessMode==='DISCOVERY_ONLY'?'rounded-2xl border border-slate-900 bg-slate-50 p-4 text-left ring-2 ring-slate-900/10':'rounded-2xl border p-4 text-left'}><b>Discovery listing</b><span className="mt-1 block text-sm text-slate-500">Be discovered without opening a commerce store yet.</span></button>
        <button type="button" onClick={()=>set('businessMode','DISCOVERY_AND_STORE')} className={form.businessMode==='DISCOVERY_AND_STORE'?'rounded-2xl border border-slate-900 bg-slate-50 p-4 text-left ring-2 ring-slate-900/10':'rounded-2xl border p-4 text-left'}><b>Discovery + Store</b><span className="mt-1 block text-sm text-slate-500">Build your listing and prepare an online store, inventory and orders.</span></button>
      </div></div>
      <button disabled={loading} className="mt-7 w-full rounded-xl bg-slate-900 px-4 py-3.5 font-semibold text-white disabled:opacity-50">{loading?'Creating your business…':'Create business account'}</button>
      <p className="mt-4 text-center text-xs text-slate-500">Already have an account? <a href="/login" className="font-semibold text-slate-900">Sign in</a></p>
    </form>
  </div></div>;
};
