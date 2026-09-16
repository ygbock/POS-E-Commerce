import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { Table, Column } from '../ui/Table';
import { authClient } from '../../services/authClient';

type Customer={id:string;name:string;email?:string|null;phone?:string|null;tier?:string;store_credit_balance?:string;credit_limit?:string;notes?:string|null;customer_group?:string};
const tiers=['Bronze','Silver','Gold','VIP'].map(value=>({value,label:value}));
export const CustomerManagementView:React.FC=()=>{
 const [rows,setRows]=useState<Customer[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<Customer|null>(null);
 const [form,setForm]=useState({name:'',email:'',phone:'',tier:'Bronze',store_credit_balance:'0.00',credit_limit:'0.00',notes:''});
 const load=async()=>{setLoading(true);setError('');try{const r=await fetch('/api/customers',{headers:authClient.getAuthHeaders()});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Unable to load customers.');setRows(d.data||[]);}catch(e:any){setError(e?.message||'Unable to load customers.');}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const filtered=useMemo(()=>rows.filter(c=>[c.name,c.email||'',c.phone||'',c.tier||''].join(' ').toLowerCase().includes(query.toLowerCase())),[rows,query]);
 const create=()=>{setEditing(null);setForm({name:'',email:'',phone:'',tier:'Bronze',store_credit_balance:'0.00',credit_limit:'0.00',notes:''});setOpen(true);};
 const edit=(c:Customer)=>{setEditing(c);setForm({name:c.name,email:c.email||'',phone:c.phone||'',tier:c.tier||'Bronze',store_credit_balance:c.store_credit_balance||'0.00',credit_limit:c.credit_limit||'0.00',notes:c.notes||''});setOpen(true);};
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');try{const r=await fetch(editing?'/api/customers/'+editing.id:'/api/customers',{method:editing?'PUT':'POST',headers:authClient.getAuthHeaders(),body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Unable to save customer.');setOpen(false);await load();}catch(e:any){setError(e?.message||'Unable to save customer.');}finally{setSaving(false);}};
 const columns:Column<Customer>[]=[
  {header:'Customer',accessor:c=><div><div className="font-semibold">{c.name}</div><div className="text-xs text-slate-500">{c.email||'No email'} · {c.phone||'No phone'}</div></div>},
  {header:'Tier',accessor:c=><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{c.tier||'Bronze'}</span>},
  {header:'Store Credit',accessor:c=><span className="ui-number">{c.store_credit_balance||'0.00'}</span>},
  {header:'Credit Limit',accessor:c=><span className="ui-number">{c.credit_limit||'0.00'}</span>},
  {header:'Actions',accessor:c=><Button size="sm" variant="ghost" onClick={()=>edit(c)} aria-label={'Edit '+c.name} leftIcon={<Pencil className="h-4 w-4"/>}>Edit</Button>}
 ];
 return <section className="ui-page">
  <header className="ui-page-header"><div className="ui-page-header__copy"><h1 className="ui-page-title flex items-center gap-2"><Users className="h-5 w-5 text-blue-600"/>Customer Management</h1><p className="ui-page-description">Tenant-scoped customer profiles, tiers, credit limits, and CRM notes.</p></div><div className="ui-page-actions"><Button onClick={create} leftIcon={<Plus className="h-4 w-4"/>}>Add Customer</Button><Button variant="outline" onClick={()=>void load()} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4"/>}>Refresh</Button></div></header>
  {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
  <div className="ui-surface p-4 mb-4"><Input aria-label="Search customers" placeholder="Search name, email, phone or tier…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
  <Table data={filtered} columns={columns} caption="Tenant customers" isLoading={loading} emptyStateMessage="No customers found." getRowKey={c=>c.id}/>
  <Modal isOpen={open} onClose={()=>setOpen(false)} title={editing?'Edit Customer':'Create Customer'} footer={<><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="customer-form" isLoading={saving}>{editing?'Save Changes':'Create Customer'}</Button></>}>
   <form id="customer-form" onSubmit={save} className="ui-form-grid ui-form-grid--wide">
    <Input label="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
    <Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
    <Input label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
    <Select label="Customer tier" value={form.tier} onChange={e=>setForm({...form,tier:e.target.value})} options={tiers}/>
    <Input label="Store credit" value={form.store_credit_balance} onChange={e=>setForm({...form,store_credit_balance:e.target.value})} inputMode="decimal" helperText="Exact decimal, e.g. 25.00"/>
    <Input label="Credit limit" value={form.credit_limit} onChange={e=>setForm({...form,credit_limit:e.target.value})} inputMode="decimal"/>
    <div className="sm:col-span-2"><Input label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
   </form>
  </Modal>
 </section>;
};
