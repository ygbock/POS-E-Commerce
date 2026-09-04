import React, { useState } from 'react';
import {
  QrCode,
  Plus,
  Search,
  Filter,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  RotateCcw,
  Check,
  X,
  Calendar,
  Building2,
  Tag,
  Clock,
  Printer,
} from 'lucide-react';
import { SerialNumberRecord, SerialStatus, BranchLocationId } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

const STATUS_CONFIG: { [key in SerialStatus]: { bg: string; text: string; border: string; icon: any } } = {
  'In Stock': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  Allocated: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: Tag,
  },
  Sold: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    icon: ShieldCheck,
  },
  'Under Repair': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: Wrench,
  },
  Defective: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: XCircle,
  },
  Returned: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: RotateCcw,
  },
};

export const SerialNumberRegistry: React.FC = () => {
  const { serialNumbers, addSerialNumber, updateSerialNumberStatus, products, locations } = useCommerce();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [selectedSerialForEdit, setSelectedSerialForEdit] = useState<SerialNumberRecord | null>(null);

  // Form State
  const [serialInput, setSerialInput] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [selectedVariantId, setSelectedVariantId] = useState(products[0]?.variants[0]?.id || '');
  const [targetLocationId, setTargetLocationId] = useState<BranchLocationId>(locations[0]?.id as BranchLocationId);
  const [warrantyMonths, setWarrantyMonths] = useState(24);
  const [notes, setNotes] = useState('');

  // Update Status Quick Modal State
  const [newStatus, setNewStatus] = useState<SerialStatus>('In Stock');
  const [statusNotes, setStatusNotes] = useState('');

  const currentProd = products.find((p) => p.id === selectedProductId);
  const currentVar = currentProd?.variants.find((v) => v.id === selectedVariantId);

  const filteredSerials = serialNumbers.filter((sn) => {
    const matchesSearch =
      sn.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sn.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sn.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sn.orderNumber && sn.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || sn.status === statusFilter;
    const matchesLoc = locationFilter === 'All' || sn.locationId === locationFilter;

    return matchesSearch && matchesStatus && matchesLoc;
  });

  const handleRegisterSerial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialInput.trim() || !currentProd || !currentVar) return;

    const loc = locations.find((l) => l.id === targetLocationId);
    const now = new Date();
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + warrantyMonths);

    // Support multiple serial numbers split by commas or newlines
    const serialList = serialInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    serialList.forEach((sNum, index) => {
      const newRec: SerialNumberRecord = {
        id: `sn-${Date.now()}-${index}`,
        serialNumber: sNum,
        productId: currentProd.id,
        productName: currentProd.name,
        variantId: currentVar.id,
        variantName: currentVar.name,
        sku: currentVar.sku,
        locationId: targetLocationId,
        locationName: loc?.name || targetLocationId,
        status: 'In Stock',
        receivedDate: now.toISOString(),
        warrantyExpiry: expiry.toISOString(),
        notes: notes.trim() || undefined,
      };
      addSerialNumber(newRec);
    });

    setIsRegisterModalOpen(false);
    setSerialInput('');
    setNotes('');
  };

  const handleStatusUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSerialForEdit) {
      updateSerialNumberStatus(selectedSerialForEdit.id, newStatus, statusNotes);
      setSelectedSerialForEdit(null);
      setStatusNotes('');
    }
  };

  const isWarrantyActive = (expiryDate?: string) => {
    if (!expiryDate) return false;
    return new Date(expiryDate).getTime() > Date.now();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Unique Serial Numbers (S/N) Registry</h2>
              <p className="text-xs text-slate-500">
                Individual hardware unit traceability, warranty activation, RMA, and POS assignment
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-200 transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Register Serial Units</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search serial number, SKU, order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-1.5">
          <span className="text-xs text-slate-500 font-semibold">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="All">All Statuses ({serialNumbers.length})</option>
            <option value="In Stock">In Stock</option>
            <option value="Allocated">Allocated</option>
            <option value="Sold">Sold</option>
            <option value="Under Repair">Under Repair</option>
            <option value="Defective">Defective</option>
            <option value="Returned">Returned</option>
          </select>
        </div>

        {/* Location Filter */}
        <div className="flex items-center space-x-1.5">
          <span className="text-xs text-slate-500 font-semibold">Location:</span>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="All">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Serial Numbers Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Serial Number</th>
                <th className="py-3 px-4">Product & Variant</th>
                <th className="py-3 px-4">Branch Location</th>
                <th className="py-3 px-4">Unit Status</th>
                <th className="py-3 px-4">Warranty Expiry</th>
                <th className="py-3 px-4">Order Linkage</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSerials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No matching serial numbers found in the registry.
                  </td>
                </tr>
              ) : (
                filteredSerials.map((sn) => {
                  const statusInfo = STATUS_CONFIG[sn.status] || STATUS_CONFIG['In Stock'];
                  const StatusIcon = statusInfo.icon;
                  const activeWarranty = isWarrantyActive(sn.warrantyExpiry);

                  return (
                    <tr key={sn.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {sn.serialNumber}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900 line-clamp-1">{sn.productName}</p>
                        <p className="text-[11px] text-slate-500">
                          {sn.variantName} <span className="font-mono text-slate-400">({sn.sku})</span>
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {sn.locationName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {sn.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {sn.warrantyExpiry ? (
                          <div>
                            <span
                              className={`text-[11px] font-semibold flex items-center gap-1 ${
                                activeWarranty ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {activeWarranty ? 'Active Warranty' : 'Expired'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Until {new Date(sn.warrantyExpiry).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">No warranty</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {sn.orderNumber ? (
                          <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {sn.orderNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">— Unsold —</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedSerialForEdit(sn);
                            setNewStatus(sn.status);
                            setStatusNotes(sn.notes || '');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                        >
                          Change Status
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Serial Numbers Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-900 flex flex-col my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Register Serial Numbers (S/N)</h3>
                  <p className="text-xs text-slate-500">Bulk register or scan serialized device numbers</p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSerial} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product *</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      const p = products.find((prod) => prod.id === e.target.value);
                      setSelectedVariantId(p?.variants[0]?.id || '');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Variant / SKU *</label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {currentProd?.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.sku})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Location *</label>
                  <select
                    value={targetLocationId}
                    onChange={(e) => setTargetLocationId(e.target.value as BranchLocationId)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Warranty Term (Months)</label>
                  <input
                    type="number"
                    min="0"
                    value={warrantyMonths}
                    onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Serial Number(s) * (One per line or comma-separated)
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder={`SN-2026-9001\nSN-2026-9002\nSN-2026-9003`}
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Intake / QA Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Received from Supplier batch #41, QA passed."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 flex items-center space-x-2 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Register Units</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {selectedSerialForEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-slate-900 flex flex-col my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Update Serial Status</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedSerialForEdit.serialNumber}</p>
              </div>
              <button
                onClick={() => setSelectedSerialForEdit(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStatusUpdate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Lifecycle Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as SerialStatus)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="In Stock">In Stock (Available for POS/Sales)</option>
                  <option value="Allocated">Allocated (Reserved for order)</option>
                  <option value="Sold">Sold (Delivered to customer)</option>
                  <option value="Under Repair">Under Repair (RMA / Technician)</option>
                  <option value="Defective">Defective (Quarantined)</option>
                  <option value="Returned">Returned (Customer RMA)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status Transition Notes</label>
                <textarea
                  rows={3}
                  placeholder="Reason for change, RMA tracking ticket, or customer details..."
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedSerialForEdit(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 flex items-center space-x-2 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Update Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
