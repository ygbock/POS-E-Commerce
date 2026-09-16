import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Shield } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { Table, Column } from '../ui/Table';
import { authClient } from '../../services/authClient';

type UserRow = { id:string; email:string; name:string; role:string; locationId?:string|null; isActive:boolean; createdAt:string };
type LocationRow = { id:string; name:string; code:string; isActive:boolean };
const roleOptions = [
  { value:'admin', label:'Administrator' }, { value:'manager', label:'Store Manager' }, { value:'cashier', label:'Cashier' },
  { value:'inventory_manager', label:'Inventory Manager' }, { value:'purchasing_manager', label:'Purchasing Manager' },
  { value:'sales_user', label:'Sales User' }, { value:'viewer', label:'Viewer' },
];

export const UserManagementView: React.FC = () => {
  const [users,setUsers]=useState<UserRow[]>([]), [locations,setLocations]=useState<LocationRow[]>([]);
  const [loading,setLoading]=useState(true), [error,setError]=useState(''), [query,setQuery]=useState('');
  const [open,setOpen]=useState(false), [saving,setSaving]=useState(false);
  const [form,setForm]=useState({name:'',email:'',password:'',role:'viewer',locationId:''});

  const load=async()=>{
    setLoading(true); setError('');
    try {
      const headers=authClient.getAuthHeaders();
      const [u,l]=await Promise.all([fetch('/api/users',{headers}),fetch('/api/locations',{headers})]);
      const ud=await u.json(), ld=await l.json();
      if(!u.ok) throw new Error(ud.error?.message||'Unable to load users.');
      if(!l.ok) throw new Error(ld.error?.message||'Unable to load locations.');
      setUsers(ud.data||[]); setLocations(ld.data||[]);
    } catch(e:any){setError(e?.message||'Unable to load tenant users.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const filtered=useMemo(()=>users.filter(u=>[u.name,u.email,u.role].join(' ').toLowerCase().includes(query.toLowerCase())),[users,query]);
  const startCreate=()=>{setForm({name:'',email:'',password:'',role:'viewer',locationId:''});setOpen(true);};

  const save=async(e:React.FormEvent)=>{
    e.preventDefault(); setSaving(true); setError('');
    try {
      const body:any={name:form.name,email:form.email,password:form.password,role:form.role,locationId:form.locationId||null};
      const res=await fetch('/api/users',{method:'POST',headers:authClient.getAuthHeaders(),body:JSON.stringify(body)});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error?.message||'Unable to save user.');
      setOpen(false); await load();
    } catch(e:any){setError(e?.message||'Unable to save user.');}
    finally{setSaving(false);}
  };

  const columns:Column<UserRow>[]=[
    {header:'User',accessor:r=><div><div className="font-semibold">{r.name}</div><div className="text-xs text-slate-500">{r.email}</div></div>},
    {header:'Role',accessor:r=><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{r.role.replaceAll('_',' ')}</span>},
    {header:'Status',accessor:r=><span className={r.isActive?'ui-status-success':'ui-status-danger'}>{r.isActive?'Active':'Inactive'}</span>},
    {header:'Location',accessor:r=>locations.find(l=>l.id===r.locationId)?.name||'Unassigned'},
    
  ];

  return <section className="ui-page">
    <header className="ui-page-header"><div className="ui-page-header__copy">
      <h1 className="ui-page-title flex items-center gap-2"><Shield className="h-5 w-5 text-blue-600"/>User Management</h1>
      <p className="ui-page-description">Manage tenant staff identities, roles, and location assignments.</p>
    </div><div className="ui-page-actions">
      <Button onClick={startCreate} leftIcon={<Plus className="h-4 w-4"/>}>Add User</Button>
      <Button variant="outline" onClick={()=>void load()} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4"/>}>Refresh</Button>
    </div></header>
    {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="ui-surface p-4 mb-4"><Input aria-label="Search users" placeholder="Search name, email or role…" value={query} onChange={e=>setQuery(e.target.value)} /></div>
    <Table data={filtered} columns={columns} caption="Tenant users" isLoading={loading} emptyStateMessage="No tenant users found." getRowKey={u=>u.id}/>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title="Create Tenant User" footer={<><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="user-form" isLoading={saving}>Create User</Button></>}>
      <form id="user-form" onSubmit={save} className="ui-form-grid ui-form-grid--wide">
        <Input label="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
        <Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required />
        <Input label="Temporary password" type="password" minLength={8} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required helperText="Minimum 8 characters." />
        <Select label="Role" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} options={roleOptions}/>
        <Select label="Location" value={form.locationId} onChange={e=>setForm({...form,locationId:e.target.value})} placeholder="Unassigned" options={locations.filter(l=>l.isActive).map(l=>({value:l.id,label:l.name}))}/>
      </form>
    </Modal>
  </section>;
};
