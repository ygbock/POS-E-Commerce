import React, { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Truck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Table, Column } from '../ui/Table';
import { authClient } from '../../services/authClient';

type Supplier = {
  id: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  rating?: number | string;
  lead_time_days?: number;
  is_active: boolean;
  supplied_variant_count?: number;
  purchase_order_count?: number;
};

export const SupplierManagementView: React.FC = () => {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: 'Net 30',
    rating: '5',
    leadTimeDays: '7',
    isActive: true,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/suppliers', { headers: authClient.getAuthHeaders() });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || 'Unable to load suppliers.');
      setRows(payload?.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const resetForm = () => setForm({
    name: '', contactPerson: '', email: '', phone: '', address: '',
    paymentTerms: 'Net 30', rating: '5', leadTimeDays: '7', isActive: true,
  });

  const startCreate = () => { setEditing(null); resetForm(); setOpen(true); };
  const startEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      paymentTerms: supplier.payment_terms || 'Net 30',
      rating: String(supplier.rating ?? 5),
      leadTimeDays: String(supplier.lead_time_days ?? 7),
      isActive: supplier.is_active,
    });
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(editing ? `/api/suppliers/${encodeURIComponent(editing.id)}` : '/api/suppliers', {
        method: editing ? 'PUT' : 'POST',
        headers: authClient.getAuthHeaders(),
        body: JSON.stringify({
          ...form,
          rating: Number(form.rating),
          leadTimeDays: Number(form.leadTimeDays),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || 'Unable to save supplier.');
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (supplier: Supplier) => {
    if (!window.confirm(`Deactivate supplier "${supplier.name}"?`)) return;
    setError('');
    try {
      const response = await fetch(`/api/suppliers/${encodeURIComponent(supplier.id)}`, {
        method: 'DELETE',
        headers: authClient.getAuthHeaders(),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || 'Unable to deactivate supplier.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to deactivate supplier.');
    }
  };

  const columns: Column<Supplier>[] = [
    {
      header: 'Supplier',
      accessor: (row) => (
        <div>
          <div className="font-semibold">{row.name}</div>
          <div className="text-xs text-slate-500">{row.contact_person || row.email || 'No contact recorded'}</div>
        </div>
      ),
    },
    { header: 'Terms', accessor: row => row.payment_terms || '—' },
    { header: 'Lead time', accessor: row => `${row.lead_time_days ?? 0} days` },
    { header: 'Products', accessor: row => String(row.supplied_variant_count ?? 0) },
    {
      header: 'Status',
      accessor: row => <span className={row.is_active ? 'ui-status-success' : 'ui-status-danger'}>{row.is_active ? 'Active' : 'Inactive'}</span>,
    },
    {
      header: 'Actions',
      accessor: row => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => startEdit(row)} aria-label={`Edit ${row.name}`} leftIcon={<Pencil className="h-4 w-4" />}>Edit</Button>
          {row.is_active && <Button size="sm" variant="ghost" onClick={() => void deactivate(row)}>Deactivate</Button>}
        </div>
      ),
    },
  ];

  return (
    <section className="ui-page">
      <header className="ui-page-header">
        <div className="ui-page-header__copy">
          <h1 className="ui-page-title flex items-center gap-2"><Truck className="h-5 w-5 text-blue-600" />Supplier Management</h1>
          <p className="ui-page-description">Manage supplier records used by purchasing and receiving workflows.</p>
        </div>
        <div className="ui-page-actions">
          <Button onClick={startCreate} leftIcon={<Plus className="h-4 w-4" />}>Add Supplier</Button>
          <Button variant="outline" onClick={() => void load()} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>Refresh</Button>
        </div>
      </header>
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <Table data={rows} columns={columns} caption="Tenant suppliers" isLoading={loading} emptyStateMessage="No suppliers configured." getRowKey={row => row.id} />
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="supplier-form" isLoading={saving}>{editing ? 'Save Changes' : 'Create Supplier'}</Button></>}
      >
        <form id="supplier-form" onSubmit={save} className="ui-form-grid ui-form-grid--wide">
          <Input label="Supplier name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input label="Contact person" value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <Input label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          <Input label="Payment terms" value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} />
          <Input label="Rating (0–5)" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} inputMode="decimal" />
          <Input label="Lead time (days)" value={form.leadTimeDays} onChange={e => setForm({ ...form, leadTimeDays: e.target.value })} inputMode="numeric" />
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Active</label>
        </form>
      </Modal>
    </section>
  );
};
