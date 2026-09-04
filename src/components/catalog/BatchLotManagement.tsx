import React, { useState } from 'react';
import {
  Clock,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  Package,
  Check,
  X,
  Hourglass,
  BadgeAlert,
  Flame,
  ArrowDownUp,
} from 'lucide-react';
import { BatchLotRecord, BranchLocationId } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

export const BatchLotManagement: React.FC = () => {
  const { batchLots, addBatchLot, updateBatchLot, deleteBatchLot, disposeExpiredBatch, products, locations, formatCurrency } = useCommerce();
  const [searchQuery, setSearchQuery] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'All' | 'Critical' | 'Warning' | 'Healthy'>('All');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchLotRecord | null>(null);

  // Form State
  const [batchNumber, setBatchNumber] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [selectedVariantId, setSelectedVariantId] = useState(products[0]?.variants[0]?.id || '');
  const [targetLocationId, setTargetLocationId] = useState<BranchLocationId>(locations[0]?.id as BranchLocationId);
  const [initialQuantity, setInitialQuantity] = useState(100);
  const [remainingQuantity, setRemainingQuantity] = useState(100);
  const [unitCost, setUnitCost] = useState(10);
  const [manufactureDate, setManufactureDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().split('T')[0];
  });
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');

  const currentProd = products.find((p) => p.id === selectedProductId);
  const currentVar = currentProd?.variants.find((v) => v.id === selectedVariantId);

  const getDaysUntilExpiry = (expStr: string) => {
    const exp = new Date(expStr).getTime();
    const now = Date.now();
    const diff = exp - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpirySeverity = (days: number) => {
    if (days <= 0) return { label: 'Expired', level: 'Critical', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (days <= 45) return { label: `Expiring Soon (${days}d)`, level: 'Critical', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (days <= 90) return { label: `${days} Days Left`, level: 'Warning', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: `${days} Days Left`, level: 'Healthy', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const filteredLots = batchLots.filter((lot) => {
    const matchesSearch =
      lot.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lot.supplierName && lot.supplierName.toLowerCase().includes(searchQuery.toLowerCase()));

    const days = getDaysUntilExpiry(lot.expiryDate);
    const severity = getExpirySeverity(days);
    const matchesExpiry = expiryFilter === 'All' || severity.level === expiryFilter;
    const matchesLoc = locationFilter === 'All' || lot.locationId === locationFilter;

    return matchesSearch && matchesExpiry && matchesLoc;
  });

  const openCreate = () => {
    setEditingBatch(null);
    setBatchNumber(`LOT-${Date.now().toString(36).toUpperCase()}`);
    setSelectedProductId(products[0]?.id || '');
    setSelectedVariantId(products[0]?.variants[0]?.id || '');
    setTargetLocationId(locations[0]?.id as BranchLocationId);
    setInitialQuantity(100);
    setRemainingQuantity(100);
    setUnitCost(15);
    setManufactureDate(new Date().toISOString().split('T')[0]);
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    setExpiryDate(d.toISOString().split('T')[0]);
    setSupplierName('');
    setNotes('');
    setIsCreateModalOpen(true);
  };

  const openEdit = (lot: BatchLotRecord) => {
    setEditingBatch(lot);
    setBatchNumber(lot.batchNumber);
    setSelectedProductId(lot.productId);
    setSelectedVariantId(lot.variantId);
    setTargetLocationId(lot.locationId);
    setInitialQuantity(lot.initialQuantity);
    setRemainingQuantity(lot.remainingQuantity);
    setUnitCost(lot.unitCost);
    setManufactureDate(lot.manufactureDate || '');
    setExpiryDate(lot.expiryDate);
    setSupplierName(lot.supplierName || '');
    setNotes(lot.notes || '');
    setIsCreateModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProd || !currentVar) return;

    const loc = locations.find((l) => l.id === targetLocationId);

    if (editingBatch) {
      updateBatchLot({
        ...editingBatch,
        batchNumber,
        initialQuantity: Number(initialQuantity),
        remainingQuantity: Number(remainingQuantity),
        unitCost: Number(unitCost),
        manufactureDate,
        expiryDate,
        supplierName,
        notes,
      });
    } else {
      const newLot: BatchLotRecord = {
        id: `lot-${Date.now()}`,
        batchNumber,
        productId: currentProd.id,
        productName: currentProd.name,
        variantId: currentVar.id,
        variantName: currentVar.name,
        sku: currentVar.sku,
        locationId: targetLocationId,
        locationName: loc?.name || targetLocationId,
        initialQuantity: Number(initialQuantity),
        remainingQuantity: Number(remainingQuantity),
        unitCost: Number(unitCost),
        manufactureDate,
        expiryDate,
        supplierName,
        notes,
      };
      addBatchLot(newLot);
    }
    setIsCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Hourglass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Batch & Lot Expiry Tracking</h2>
              <p className="text-xs text-slate-500">
                FEFO automated rotation, expiration alerts, food/coffee roast dates, and batch lot valuations
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={openCreate}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-200 transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Batch Lot</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search lot number, item name, supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* Expiry Risk Filter */}
        <div className="flex items-center space-x-1.5">
          <span className="text-xs text-slate-500 font-semibold">Expiry Risk:</span>
          <select
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="All">All Batches ({batchLots.length})</option>
            <option value="Critical">Critical (&lt;45 days / Expired)</option>
            <option value="Warning">Warning (45-90 days)</option>
            <option value="Healthy">Healthy (&gt;90 days)</option>
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
            <option value="All">All Branches</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Batches Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Batch / Lot #</th>
                <th className="py-3 px-4">Product & SKU</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Remaining / Initial</th>
                <th className="py-3 px-4">Unit Cost</th>
                <th className="py-3 px-4">Expiry & Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLots.map((lot) => {
                const days = getDaysUntilExpiry(lot.expiryDate);
                const severity = getExpirySeverity(days);
                const fillPercent = Math.min(100, Math.round((lot.remainingQuantity / lot.initialQuantity) * 100));

                return (
                  <tr key={lot.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {lot.batchNumber}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900 line-clamp-1">{lot.productName}</p>
                      <p className="text-[11px] text-slate-500">
                        {lot.variantName} <span className="font-mono text-slate-400">({lot.sku})</span>
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {lot.locationName}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-bold text-slate-900">{lot.remainingQuantity} left</span>
                          <span className="text-slate-400">of {lot.initialQuantity}</span>
                        </div>
                        <div className="w-28 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              fillPercent < 25 ? 'bg-rose-500' : fillPercent < 50 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${fillPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {formatCurrency(lot.unitCost)}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${severity.bg}`}
                        >
                          <Clock className="w-3 h-3" />
                          {severity.label}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Exp: {lot.expiryDate}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {lot.remainingQuantity > 0 && days <= 45 && (
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to write off and dispose ${lot.remainingQuantity} expired/expiring units of batch ${lot.batchNumber}?`)) {
                                disposeExpiredBatch(lot.id, 'Disposed from Batch Lot table');
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition-colors"
                            title="Write off expired stock and remove from active inventory"
                          >
                            Dispose Expired
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(lot)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                        >
                          Adjust Lot
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove batch lot record ${lot.batchNumber}?`)) {
                              deleteBatchLot(lot.id);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete Batch Record"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Batch Lot Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-900 flex flex-col my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Hourglass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingBatch ? 'Adjust Batch Lot Record' : 'Create New Batch / Lot'}
                  </h3>
                  <p className="text-xs text-slate-500">Record production batch, expiry date, and unit cost</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batch / Lot Number *</label>
                  <input
                    type="text"
                    required
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product *</label>
                  <select
                    value={selectedProductId}
                    disabled={!!editingBatch}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      const p = products.find((prod) => prod.id === e.target.value);
                      setSelectedVariantId(p?.variants[0]?.id || '');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white disabled:opacity-50"
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
                    disabled={!!editingBatch}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white disabled:opacity-50"
                  >
                    {currentProd?.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.sku})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={initialQuantity}
                    onChange={(e) => setInitialQuantity(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Remaining Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={remainingQuantity}
                    onChange={(e) => setRemainingQuantity(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Manufacture Date</label>
                  <input
                    type="date"
                    value={manufactureDate}
                    onChange={(e) => setManufactureDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier / Roaster Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Equator Direct Trade"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lot Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Single origin harvest lot A"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 flex items-center space-x-2 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingBatch ? 'Update Batch' : 'Save Batch Lot'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
