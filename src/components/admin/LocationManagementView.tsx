import React, { useEffect, useState } from 'react';
import { Building2, Pencil, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { Table, Column } from '../ui/Table';
import { authClient } from '../../services/authClient';

type Location={id:string;code:string;name:string;type:string;address?:string|null;phone?:string|null;manager_name?:string|null;is_pos_enabled:boolean;is_active:boolean};
const types=['Warehouse','Retail Store','Distribution Center'].map(value=>({value,label:value}));

export const LocationManagementView:React.FC=()=>{
 const [rows,setRows]=useState<Location[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<Location|null>(null);
 const [form,setForm]=useState({code:'',name:'',type:'Retail Store',address:'',phone:'',manager_name:'',is_pos_enabled:false,is_active:true});
 const load=async()=>{setLoading(true);setError('');try{const r=await fetch('/api/locations',{headers:authClient.getAuthHeaders()});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Unable to load locations.');setRows(d.data||[]);}catch(e:any){setError(e?.message||'Unable to load locations.');}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const create=()=>{setEditing(null);setForm({code:'',name:'',type:'Retail Store',address:'',phone:'',manager_name:'',is_pos_enabled:false,is_active:true});setOpen(true);};
 const edit=(r:Location)=>{setEditing(r);setForm({code:r.code,name:r.name,type:r.type,address:r.address||'',phone:r.phone||'',manager_name:r.manager_name||'',is_pos_enabled:r.is_pos_enabled,is_active:r.is_active});setOpen(true);};
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');try{const method=editing?'PUT':'POST';const url=editing?'/api/locations/'+editing.id:'/api/locations';const r=await fetch(url,{method,headers:authClient.getAuthHeaders(),body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Unable to save location.');setOpen(false);await load();}catch(e:any){setError(e?.message||'Unable to save location.');}finally{setSaving(false);}};
 const columns:Column<Location>[]=[
  {header:'Location',accessor:r=><div><div className="font-semibold">{r.name}</div><div className="text-xs text-slate-500">{r.code}</div></div>},
  {header:'Type',accessor:'type'},{header:'POS',accessor:r=>r.is_pos_enabled?'Enabled':'Disabled'},
  {header:'Status',accessor:r=><span className={r.is_active?'ui-status-success':'ui-status-danger'}>{r.is_active?'Active':'Inactive'}</span>},
  {header:'Actions',accessor:r=><Button size="sm" variant="ghost" onClick={()=>edit(r)} aria-label={'Edit '+r.name} leftIcon={<Pencil className="h-4 w-4"/>}>Edit</Button>}
 ];
 return <section className="ui-page">
  <header className="ui-page-header"><div className="ui-page-header__copy"><h1 className="ui-page-title flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600"/>Location Management</h1><p className="ui-page-description">Manage tenant branches, warehouses, distribution centers, and POS-enabled locations.</p></div><div className="ui-page-actions"><Button onClick={create} leftIcon={<Plus className="h-4 w-4"/>}>Add Location</Button><Button variant="outline" onClick={()=>void load()} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4"/>}>Refresh</Button></div></header>
  {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
  <Table data={rows} columns={columns} caption="Tenant locations" isLoading={loading} emptyStateMessage="No locations configured." getRowKey={r=>r.id}/>
  <Modal isOpen={open} onClose={()=>setOpen(false)} title={editing?'Edit Location':'Add Location'} footer={<><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="location-form" isLoading={saving}>{editing?'Save Changes':'Create Location'}</Button></>}>
   <form id="location-form" onSubmit={save} className="ui-form-grid ui-form-grid--wide">
    <Input label="Location code" value={form.code} onChange={e=>setForm({...form,code:e.target.value})} required disabled={Boolean(editing)} helperText="2–64 letters, numbers, hyphens or underscores."/>
    <Input label="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
    <Select label="Type" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} options={types}/>
    <Input label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
    <Input label="Manager" value={form.manager_name} onChange={e=>setForm({...form,manager_name:e.target.value})}/>
    <Input label="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.is_pos_enabled} onChange={e=>setForm({...form,is_pos_enabled:e.target.checked})}/>POS enabled</label>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Active</label>
   </form>
  </Modal>
 </section>;
};
