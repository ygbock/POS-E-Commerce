import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Banknote,
  MapPin,
  Tag,
  RefreshCw,
  X,
  FileText,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryService,
  DiscoveryBookingMode,
} from '../../../types/discovery';

interface DiscoveryServicesManagerProps {
  business: DiscoveryBusiness;
}

export const DiscoveryServicesManager: React.FC<DiscoveryServicesManagerProps> = ({
  business,
}) => {
  const [services, setServices] = useState<DiscoveryService[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal / Editor State
  const [editingService, setEditingService] = useState<DiscoveryService | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Form State
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    serviceType: 'Consultation',
    priceFrom: '',
    priceTo: '',
    currency: 'SLE',
    durationMinutes: '60',
    serviceAreaText: 'Greater Freetown Metropolitan',
    bookingMode: 'REQUEST' as DiscoveryBookingMode,
    isActive: true,
  });

  const fetchServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoveryApi.getBusinessServices(business.id);
      setServices(data);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else {
        setError('Failed to load services.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchServices();
  }, [business.id]);

  const handleOpenAdd = () => {
    setEditingService(null);
    setForm({
      name: '',
      slug: '',
      description: '',
      serviceType: 'Consultation',
      priceFrom: '',
      priceTo: '',
      currency: 'SLE',
      durationMinutes: '60',
      serviceAreaText: 'Greater Freetown Metropolitan',
      bookingMode: 'REQUEST',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (svc: DiscoveryService) => {
    setEditingService(svc);
    setForm({
      name: svc.name || '',
      slug: svc.slug || '',
      description: svc.description || '',
      serviceType: svc.service_type || 'General',
      priceFrom: svc.price_from != null ? String(svc.price_from) : '',
      priceTo: svc.price_to != null ? String(svc.price_to) : '',
      currency: svc.currency || 'SLE',
      durationMinutes: svc.duration_minutes != null ? String(svc.duration_minutes) : '60',
      serviceAreaText: svc.service_area_text || '',
      bookingMode: svc.booking_mode || 'REQUEST',
      isActive: Boolean(svc.is_active),
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!form.name.trim()) throw new Error('Service name is required.');

      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || null,
        serviceType: form.serviceType.trim() || null,
        priceFrom: form.priceFrom ? Number(form.priceFrom) : null,
        priceTo: form.priceTo ? Number(form.priceTo) : null,
        currency: form.currency || 'SLE',
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        serviceAreaText: form.serviceAreaText.trim() || null,
        bookingMode: form.bookingMode,
        isActive: form.isActive,
      };

      if (editingService) {
        await discoveryApi.updateService(business.id, editingService.id, payload as any);
        setSuccess('Service offering updated.');
      } else {
        await discoveryApi.createService(business.id, payload as any);
        setSuccess('New service created.');
      }

      setIsModalOpen(false);
      await fetchServices();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save service.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600" />
            Service Offerings & Bookings
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Publish custom repair, consultation, catering, or trade services that customers can discover and request quotes for.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Service</span>
        </button>
      </div>

      {/* Alerts */}
      {success && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Services List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading service catalog...
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 mx-auto flex items-center justify-center mb-3">
            <Wrench className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No services published yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            List your professional services, hourly rates, or custom job estimates to receive quote inquiries directly from local clients.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add First Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {svc.service_type || 'Service'}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                      {svc.name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(svc)}
                    className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {svc.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                    {svc.description}
                  </p>
                )}

                {/* Details Pills */}
                <div className="flex flex-wrap gap-2.5 mt-4">
                  {/* Pricing */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                    <span>
                      {svc.price_from
                        ? svc.price_to
                          ? `${svc.currency} ${svc.price_from} - ${svc.price_to}`
                          : `From ${svc.currency} ${svc.price_from}`
                        : 'Custom Quote'}
                    </span>
                  </div>

                  {/* Duration */}
                  {svc.duration_minutes ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{svc.duration_minutes} mins</span>
                    </div>
                  ) : null}

                  {/* Booking Mode */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Mode: {svc.booking_mode}</span>
                  </div>
                </div>

                {svc.service_area_text && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>Area: {svc.service_area_text}</span>
                  </p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {svc.is_active ? 'Active & Discoverable' : 'Hidden from Search'}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(svc)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                >
                  Edit Configuration
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" />
                {editingService ? 'Edit Service Offering' : 'Add New Service Offering'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Service Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Commercial HVAC Inspection & Repair"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Service Category
                  </label>
                  <select
                    value={form.serviceType}
                    onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Consultation">Consultation</option>
                    <option value="Repair & Maintenance">Repair & Maintenance</option>
                    <option value="Installation">Installation</option>
                    <option value="Catering & Events">Catering & Events</option>
                    <option value="Cleaning & Care">Cleaning & Care</option>
                    <option value="Custom Fabrication">Custom Fabrication</option>
                    <option value="General Service">General Service</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Booking / Inquiry Mode
                  </label>
                  <select
                    value={form.bookingMode}
                    onChange={(e) => setForm({ ...form, bookingMode: e.target.value as DiscoveryBookingMode })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="REQUEST">Inquiry Request</option>
                    <option value="QUOTE">Custom Price Quote</option>
                    <option value="BOOKING">Direct Booking</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Price Starting From (SLE)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.priceFrom}
                    onChange={(e) => setForm({ ...form, priceFrom: e.target.value })}
                    placeholder="150.00"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Price Up To (Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.priceTo}
                    onChange={(e) => setForm({ ...form, priceTo: e.target.value })}
                    placeholder="500.00"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estimated Duration (Mins)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                    placeholder="60"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Service Area / Radius
                  </label>
                  <input
                    type="text"
                    value={form.serviceAreaText}
                    onChange={(e) => setForm({ ...form, serviceAreaText: e.target.value })}
                    placeholder="Freetown & Western Area"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Service Description & Inclusions
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detail what is included in this service, warranty, parts required, customer prep..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Active and Discoverable by Customers</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{saving ? 'Saving...' : editingService ? 'Update Service' : 'Create Service'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
