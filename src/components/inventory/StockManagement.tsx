import React, { useState } from 'react';
import {
  Boxes,
  ArrowLeftRight,
  Sliders,
  History,
  PackageCheck,
  Search,
  X,
  Hourglass,
  Clock,
  AlertTriangle,
  Barcode as BarcodeIcon,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { StockAdjustmentReason, Product, ProductVariant } from '../../types';
import { BatchLotManagement } from '../catalog/BatchLotManagement';
import { BarcodeLabelModal } from '../catalog/BarcodeLabelModal';

interface StockManagementProps {
  initialSubTab?: 'matrix' | 'transfers' | 'adjustments' | 'movements' | 'batches';
}

export const StockManagement: React.FC<StockManagementProps> = ({ initialSubTab = 'matrix' }) => {
  const {
    products,
    locations,
    stockMovements,
    transfers,
    stockTransfers,
    batchLots,
    createStockTransfer,
    receiveStockTransfer,
    updateTransferStatus,
    createStockAdjustment,
    formatCurrency,
    getTotalStockForVariant,
  } = useCommerce();

  // Safely fallback to transfers or empty array if undefined
  const activeTransfersList = stockTransfers || transfers || [];
  const safeMovementsList = stockMovements || [];

  const criticalExpiringLotsCount = (batchLots || []).filter((lot) => {
    if (lot.remainingQuantity <= 0) return false;
    const exp = new Date(lot.expiryDate).getTime();
    const days = Math.ceil((exp - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 45;
  }).length;

  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'transfers' | 'adjustments' | 'movements' | 'batches'>(initialSubTab);

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('All');

  // Transfer Form Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState(locations[0]?.id || 'loc-main-wh');
  const [transferTo, setTransferTo] = useState(locations[1]?.id || 'loc-store-downtown');
  const [transferVariantId, setTransferVariantId] = useState('');
  const [transferQty, setTransferQty] = useState(10);
  const [transferNotes, setTransferNotes] = useState('');

  // Adjustment Form Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustLocationId, setAdjustLocationId] = useState(locations[0]?.id || 'loc-main-wh');
  const [adjustVariantId, setAdjustVariantId] = useState('');
  const [adjustQtyDelta, setAdjustQtyDelta] = useState(-2);
  const [adjustReason, setAdjustReason] = useState<StockAdjustmentReason>('Damage');
  const [adjustNotes, setAdjustNotes] = useState('');

  // Barcode Label Studio Modal
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState<Product | null>(null);
  const [selectedVariantForBarcode, setSelectedVariantForBarcode] = useState<ProductVariant | null>(null);

  const handleOpenBarcode = (prod: Product, variant?: ProductVariant) => {
    setSelectedProductForBarcode(prod);
    setSelectedVariantForBarcode(variant || prod.variants[0]);
    setIsBarcodeModalOpen(true);
  };

  // Flat list of variants for easy lookup
  const allVariantsWithProduct: Array<{ product: Product; variant: ProductVariant }> = [];
  (products || []).forEach((p) => {
    (p.variants || []).forEach((v) => {
      allVariantsWithProduct.push({ product: p, variant: v });
    });
  });

  const filteredMatrix = allVariantsWithProduct.filter(({ product, variant }) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variant.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variant.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleCreateTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferFrom === transferTo) {
      alert('Source and destination locations cannot be identical.');
      return;
    }
    const item = allVariantsWithProduct.find((i) => i.variant.id === transferVariantId);
    if (!item) {
      alert('Please select a valid variant.');
      return;
    }

    const sourceLoc = locations.find((l) => l.id === transferFrom);
    const destLoc = locations.find((l) => l.id === transferTo);

    createStockTransfer({
      sourceLocationId: transferFrom,
      sourceLocationName: sourceLoc?.name || transferFrom,
      destLocationId: transferTo,
      destLocationName: destLoc?.name || transferTo,
      createdBy: 'Store Manager',
      items: [
        {
          productId: item.product.id,
          variantId: item.variant.id,
          productName: item.product.name,
          variantName: item.variant.name,
          sku: item.variant.sku,
          requestedQty: Number(transferQty),
        },
      ],
      notes: transferNotes,
    });

    setIsTransferModalOpen(false);
    setTransferNotes('');
  };

  const handleCreateAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const item = allVariantsWithProduct.find((i) => i.variant.id === adjustVariantId);
    if (!item) {
      alert('Please select a valid variant.');
      return;
    }

    const loc = locations.find((l) => l.id === adjustLocationId);
    const currentStock = item.variant.stockByLocation[adjustLocationId] || 0;
    const delta = Number(adjustQtyDelta);
    const physicalCount = Math.max(0, currentStock + delta);
    const varianceVal = delta * item.variant.costPrice;

    createStockAdjustment({
      locationId: adjustLocationId,
      locationName: loc?.name || adjustLocationId,
      status: 'Approved',
      reason: adjustReason,
      items: [
        {
          productId: item.product.id,
          variantId: item.variant.id,
          productName: item.product.name,
          variantName: item.variant.name,
          sku: item.variant.sku,
          systemStock: currentStock,
          physicalCount,
          variance: delta,
          unitCost: item.variant.costPrice,
          totalVarianceValue: varianceVal,
        },
      ],
      notes: adjustNotes,
    });

    setIsAdjustModalOpen(false);
    setAdjustNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-blue-600" />
            <span>Inventory & Warehouse Control</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Multi-node stock reconciliation, inter-facility transit, and immutable audit logs
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="btn-new-stock-transfer"
            onClick={() => {
              if (allVariantsWithProduct.length > 0) {
                setTransferVariantId(allVariantsWithProduct[0].variant.id);
              }
              setIsTransferModalOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm shadow-blue-200 flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>New Stock Transfer</span>
          </button>

          <button
            id="btn-new-stock-adjustment"
            onClick={() => {
              if (allVariantsWithProduct.length > 0) {
                setAdjustVariantId(allVariantsWithProduct[0].variant.id);
              }
              setIsAdjustModalOpen(true);
            }}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium border border-slate-200 shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Sliders className="w-4 h-4 text-amber-600" />
            <span>Stock Adjustment</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 shadow-sm overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('matrix')}
          className={`flex-1 min-w-[150px] py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'matrix' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Multi-Location Stock Matrix</span>
        </button>

        <button
          onClick={() => setActiveSubTab('batches')}
          className={`flex-1 min-w-[160px] py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'batches' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Hourglass className="w-4 h-4 text-amber-500" />
          <span>Batch & Expiry Control</span>
          {criticalExpiringLotsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {criticalExpiringLotsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('transfers')}
          className={`flex-1 min-w-[150px] py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'transfers' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>Inter-Facility Transfers ({activeTransfersList.filter((t) => t.status === 'In Transit' || t.status === 'Requested').length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('movements')}
          className={`flex-1 min-w-[140px] py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'movements' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Stock Audit Trail ({safeMovementsList.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: Stock Matrix */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search SKU or item name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <span>Facility Filter:</span>
              <select
                aria-label="Facility Filter"
                value={selectedLocationFilter}
                onChange={(e) => setSelectedLocationFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg py-1 px-2.5 focus:outline-none focus:border-blue-500"
              >
                <option value="All">All Facilities (Consolidated)</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Item & Variant</th>
                    <th className="py-3 px-4">SKU / Barcode</th>
                    {locations.slice(0, 3).map((l) => (
                      <th key={l.id} className="py-3 px-4 text-right">{l.name.split(' ')[0]}</th>
                    ))}
                    <th className="py-3 px-4 text-right">Total Stock</th>
                    <th className="py-3 px-4 text-right">Inventory Asset Value</th>
                    <th className="py-3 px-4 text-center">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMatrix.map(({ product, variant }) => {
                    const total = getTotalStockForVariant(variant);
                    const assetVal = total * variant.costPrice;

                    return (
                      <tr key={variant.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 leading-tight">{product.name}</div>
                          <div className="text-xs text-blue-600 font-medium">{variant.name}</div>
                        </td>

                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-slate-800">{variant.sku}</div>
                              <div className="text-[10px] text-slate-400">{variant.barcode || 'No barcode'}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenBarcode(product, variant)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-600 border border-slate-200 transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[11px] font-sans font-bold"
                              title="Open Barcode Label Studio for this item"
                            >
                              <BarcodeIcon className="w-3.5 h-3.5 text-sky-500" />
                              <span className="hidden sm:inline">Print Tag</span>
                            </button>
                          </div>
                        </td>

                        {locations.slice(0, 3).map((l) => (
                          <td key={l.id} className="py-3 px-4 text-right font-mono font-medium text-slate-800">
                            {variant.stockByLocation[l.id] ?? 0} {product.unit || 'pcs'}
                          </td>
                        ))}

                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {total} {product.unit || 'pcs'}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(assetVal)}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                              total > variant.lowStockThreshold * 2
                                ? 'bg-emerald-100 text-emerald-700'
                                : total > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {total > variant.lowStockThreshold * 2 ? 'Optimal' : total > 0 ? 'Low Stock' : 'Stockout'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: Batch & Expiry Control */}
      {activeSubTab === 'batches' && <BatchLotManagement />}
      {activeSubTab === 'transfers' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Stock Transfers & Inter-Facility Transit</h3>
                <p className="text-xs text-slate-500">Track shipments moved from central distribution to regional stores</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {activeTransfersList.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">No active transfers found.</div>
              ) : (
                activeTransfersList.map((transfer) => {
                  const fromLoc = locations.find((l) => l.id === transfer.sourceLocationId);
                  const toLoc = locations.find((l) => l.id === transfer.destLocationId);

                  return (
                    <div key={transfer.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-900 text-sm">{transfer.transferNumber}</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              transfer.status === 'Received'
                                ? 'bg-emerald-100 text-emerald-700'
                                : transfer.status === 'In Transit'
                                ? 'bg-blue-100 text-blue-700'
                                : transfer.status === 'Requested'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {transfer.status}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 text-slate-500 text-xs">
                          <span>From: <strong className="text-slate-800">{fromLoc?.name || transfer.sourceLocationName}</strong></span>
                          <span>➔</span>
                          <span>To: <strong className="text-slate-800">{toLoc?.name || transfer.destLocationName}</strong></span>
                          <span>• Created by {transfer.createdBy}</span>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          {transfer.items.map((i, idx) => (
                            <span key={idx} className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-700 border border-slate-200">
                              {i.productName} ({i.requestedQty} pcs)
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right text-xs text-slate-500">
                          <p>Created: {new Date(transfer.createdAt).toLocaleDateString()}</p>
                          {transfer.notes && <p className="font-mono text-slate-700 font-medium">{transfer.notes}</p>}
                        </div>

                        {transfer.status === 'Requested' && (
                          <button
                            onClick={() => updateTransferStatus(transfer.id, 'In Transit')}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-1.5 shadow-xs transition-colors"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                            <span>Dispatch Shipment</span>
                          </button>
                        )}

                        {transfer.status === 'In Transit' && (
                          <button
                            onClick={() => receiveStockTransfer(transfer.id)}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-1.5 shadow-xs transition-colors"
                          >
                            <PackageCheck className="w-4 h-4" />
                            <span>Acknowledge Delivery & Restock</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Movements Audit Trail */}
      {activeSubTab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Immutable Stock Audit Log</h3>
              <p className="text-xs text-slate-500">Full forensic log of every stock increment, sale deduction, write-off and transfer</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Facility</th>
                  <th className="py-3 px-4">SKU / Item</th>
                  <th className="py-3 px-4 text-center">Change</th>
                  <th className="py-3 px-4 text-right">Balance After</th>
                  <th className="py-3 px-4">Reference / Reason</th>
                  <th className="py-3 px-4">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {safeMovementsList.map((mov) => {
                  const loc = locations.find((l) => l.id === mov.locationId);
                  const isPositive = mov.quantityChange > 0;

                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 text-slate-500">{new Date(mov.timestamp).toLocaleString()}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900 font-sans">{mov.type}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-700">{loc?.name || mov.locationName || mov.locationId}</td>
                      <td className="py-2.5 px-4 font-sans text-blue-600 font-medium">
                        <div>{mov.productName}</div>
                        <div className="text-[10px] text-slate-400">{mov.sku} ({mov.variantName})</div>
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold">
                        <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                          {isPositive ? `+${mov.quantityChange}` : mov.quantityChange}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">{mov.newStock}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-700">
                        {mov.referenceId} {mov.reason ? `(${mov.reason})` : ''}
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-500">{mov.performedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: New Transfer */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Initiate Inter-Facility Transfer</h3>
              </div>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransferSubmit} className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Origin (Dispatch From):</label>
                  <select
                    value={transferFrom}
                    onChange={(e) => setTransferFrom(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Destination (Deliver To):</label>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Select Product Variant to Transfer:</label>
                <select
                  value={transferVariantId}
                  onChange={(e) => setTransferVariantId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                >
                  {allVariantsWithProduct.map(({ product, variant }) => (
                    <option key={variant.id} value={variant.id}>
                      {product.name} ({variant.name}) — SKU: {variant.sku}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Quantity to Move:</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Transit Manifest Notes:</label>
                <textarea
                  rows={2}
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Replenishing high foot-traffic weekend stock..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm shadow-blue-200"
                >
                  Dispatch Shipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Stock Adjustment */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">Stock Adjustment & Write-off</h3>
              </div>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustmentSubmit} className="py-4 space-y-4">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Location:</label>
                <select
                  value={adjustLocationId}
                  onChange={(e) => setAdjustLocationId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Product Variant:</label>
                <select
                  value={adjustVariantId}
                  onChange={(e) => setAdjustVariantId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                >
                  {allVariantsWithProduct.map(({ product, variant }) => (
                    <option key={variant.id} value={variant.id}>
                      {product.name} ({variant.name}) — SKU: {variant.sku}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Quantity Delta (+ or -):</label>
                  <input
                    type="number"
                    required
                    value={adjustQtyDelta}
                    onChange={(e) => setAdjustQtyDelta(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-bold"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Use negative for damages/shrinkage</p>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Audit Reason:</label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value as StockAdjustmentReason)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    <option value="Damage">Damage / Breakage</option>
                    <option value="Physical Count Reconciliation">Physical Count Reconciliation</option>
                    <option value="Theft/Shrinkage">Theft / Shrinkage</option>
                    <option value="Expiry">Expired Goods</option>
                    <option value="Internal Transfer Correction">Internal Correction</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Auditor Explanation:</label>
                <textarea
                  rows={2}
                  required
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Explain why this adjustment is being performed..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Post Inventory Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Label Studio Modal */}
      <BarcodeLabelModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        product={selectedProductForBarcode}
        variant={selectedVariantForBarcode}
      />
    </div>
  );
};
