import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Building,
  CheckCircle2,
  PackagePlus,
  X,
  FileText,
  Search,
  Filter,
  AlertTriangle,
  RefreshCw,
  Edit3,
  Trash2,
  Calendar,
  DollarSign,
  Clock,
  Star,
  MapPin,
  Mail,
  Phone,
  ShieldCheck,
  Layers,
  Printer,
  Eye,
  BarChart3,
  Check,
  ArrowRight,
  Package,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { PurchaseOrder, Product, ProductVariant, BranchLocationId, Supplier } from '../../types';

export const PurchasingManagement: React.FC = () => {
  const {
    suppliers,
    purchaseOrders,
    products,
    locations,
    createPurchaseOrder,
    receivePurchaseOrderGoods,
    updatePurchaseOrderStatus,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    formatCurrency,
    getTotalStockForVariant,
  } = useCommerce();

  // Tab State
  const [activeTab, setActiveTab] = useState<'pos' | 'suppliers' | 'replenishment' | 'analytics'>('pos');

  // Filters & Search
  const [poSearch, setPoSearch] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState<string>('ALL');
  const [poLocationFilter, setPoLocationFilter] = useState<string>('ALL');

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierTermsFilter, setSupplierTermsFilter] = useState<string>('ALL');

  // Modals state
  const [isCreatePoOpen, setIsCreatePoOpen] = useState(false);
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [viewingPo, setViewingPo] = useState<PurchaseOrder | null>(null);

  // Supplier Edit / Create modal state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierFormData, setSupplierFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: 'Net 30',
    rating: 4.8,
    leadTimeDays: 5,
  });

  // PO creation form state
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [destinationLocationId, setDestinationLocationId] = useState<BranchLocationId>(
    locations[0]?.id || 'loc-main-wh'
  );
  const [expectedDate, setExpectedDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );
  const [poNotes, setPoNotes] = useState('');
  const [poLineItems, setPoLineItems] = useState<
    Array<{
      productId: string;
      variantId: string;
      productName: string;
      variantName: string;
      sku: string;
      orderedQty: number;
      unitCost: number;
    }>
  >([]);

  // Receive PO state
  const [receivedQtys, setReceivedQtys] = useState<{ [variantId: string]: number }>({});
  const [batchNumbers, setBatchNumbers] = useState<{ [variantId: string]: string }>({});
  const [expiryDates, setExpiryDates] = useState<{ [variantId: string]: string }>({});

  // Auto-replenishment custom override order quantities
  const [replenishQtys, setReplenishQtys] = useState<{ [variantId: string]: number }>({});
  const [replenishSuppliers, setReplenishSuppliers] = useState<{ [variantId: string]: string }>({});
  const [autoOrderSuccessMsg, setAutoOrderSuccessMsg] = useState<string | null>(null);

  // Flattened variant list for dropdowns
  const allVariants: Array<{ product: Product; variant: ProductVariant }> = useMemo(() => {
    const list: Array<{ product: Product; variant: ProductVariant }> = [];
    products.forEach((p) => {
      p.variants.forEach((v) => list.push({ product: p, variant: v }));
    });
    return list;
  }, [products]);

  // Scanned low stock items across all variants
  const lowStockItems = useMemo(() => {
    const items: Array<{
      product: Product;
      variant: ProductVariant;
      totalStock: number;
      deficitQty: number;
      defaultSupplier: Supplier;
    }> = [];

    products.forEach((prod) => {
      prod.variants.forEach((v) => {
        const total = getTotalStockForVariant(v);
        if (total <= v.lowStockThreshold) {
          const deficit = Math.max(v.lowStockThreshold * 2 - total, 10);
          // Pick supplier matching brand or default to first
          const matchedSup =
            suppliers.find((s) => s.name.toLowerCase().includes(prod.brand.toLowerCase())) ||
            suppliers[0];

          items.push({
            product: prod,
            variant: v,
            totalStock: total,
            deficitQty: deficit,
            defaultSupplier: matchedSup,
          });
        }
      });
    });

    return items;
  }, [products, suppliers, getTotalStockForVariant]);

  // Open create PO modal with initial item
  const openCreatePoModal = (prefillSupplierId?: string, prefillVariantId?: string) => {
    const targetSupplier = prefillSupplierId || suppliers[0]?.id || '';
    setSelectedSupplierId(targetSupplier);

    if (prefillVariantId) {
      const match = allVariants.find((x) => x.variant.id === prefillVariantId);
      if (match) {
        setPoLineItems([
          {
            productId: match.product.id,
            variantId: match.variant.id,
            productName: match.product.name,
            variantName: match.variant.name,
            sku: match.variant.sku,
            orderedQty: 25,
            unitCost: match.variant.costPrice,
          },
        ]);
      }
    } else if (allVariants.length > 0) {
      setPoLineItems([
        {
          productId: allVariants[0].product.id,
          variantId: allVariants[0].variant.id,
          productName: allVariants[0].product.name,
          variantName: allVariants[0].variant.name,
          sku: allVariants[0].variant.sku,
          orderedQty: 50,
          unitCost: allVariants[0].variant.costPrice,
        },
      ]);
    }

    setIsCreatePoOpen(true);
  };

  const handleAddPoItemRow = () => {
    if (allVariants.length > 0) {
      setPoLineItems((prev) => [
        ...prev,
        {
          productId: allVariants[0].product.id,
          variantId: allVariants[0].variant.id,
          productName: allVariants[0].product.name,
          variantName: allVariants[0].variant.name,
          sku: allVariants[0].variant.sku,
          orderedQty: 20,
          unitCost: allVariants[0].variant.costPrice,
        },
      ]);
    }
  };

  const handleRemovePoItemRow = (index: number) => {
    setPoLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreatePoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    const destLoc = locations.find((l) => l.id === destinationLocationId) || locations[0];
    if (!sup || poLineItems.length === 0) return;

    const subtotal = poLineItems.reduce((s, it) => s + it.unitCost * it.orderedQty, 0);

    createPurchaseOrder({
      supplierId: sup.id,
      supplierName: sup.name,
      destinationLocationId: destLoc.id,
      destinationLocationName: destLoc.name,
      status: 'Sent',
      paymentStatus: 'Unpaid',
      expectedDate: new Date(expectedDate).toISOString(),
      items: poLineItems.map((item) => ({
        ...item,
        receivedQty: 0,
        totalCost: item.orderedQty * item.unitCost,
      })),
      subtotal,
      tax: subtotal * 0.05,
      shipping: 50,
      totalAmount: subtotal * 1.05 + 50,
      notes: poNotes,
      createdBy: 'Procurement Manager',
    });

    setIsCreatePoOpen(false);
    setPoNotes('');
  };

  // Open supplier edit / create modal
  const openSupplierModal = (sup?: Supplier) => {
    if (sup) {
      setEditingSupplier(sup);
      setSupplierFormData({
        name: sup.name,
        contactPerson: sup.contactPerson,
        email: sup.email,
        phone: sup.phone,
        address: sup.address,
        paymentTerms: sup.paymentTerms,
        rating: sup.rating,
        leadTimeDays: sup.leadTimeDays,
      });
    } else {
      setEditingSupplier(null);
      setSupplierFormData({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        paymentTerms: 'Net 30',
        rating: 4.8,
        leadTimeDays: 5,
      });
    }
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormData.name.trim()) return;

    if (editingSupplier) {
      updateSupplier({
        ...editingSupplier,
        ...supplierFormData,
      });
    } else {
      const newSup: Supplier = {
        id: `sup-${Date.now()}`,
        ...supplierFormData,
        activeOrdersCount: 0,
      };
      addSupplier(newSup);
    }

    setIsSupplierModalOpen(false);
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove supplier profile for "${name}"?`)) {
      deleteSupplier(id);
    }
  };

  // Receiving GRN Modal handlers
  const openReceiveModal = (po: PurchaseOrder) => {
    setReceivingPo(po);
    const initialQtys: { [variantId: string]: number } = {};
    const initialBatches: { [variantId: string]: string } = {};
    const initialExpiries: { [variantId: string]: string } = {};

    po.items.forEach((item) => {
      const remaining = item.orderedQty - item.receivedQty;
      initialQtys[item.variantId] = remaining > 0 ? remaining : 0;
      initialBatches[item.variantId] = `LOT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      initialExpiries[item.variantId] = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    });

    setReceivedQtys(initialQtys);
    setBatchNumbers(initialBatches);
    setExpiryDates(initialExpiries);
  };

  const handleConfirmReceiveGoods = () => {
    if (!receivingPo) return;
    const receivedItems = Object.entries(receivedQtys).map(([variantId, quantity]) => ({
      variantId,
      quantity: Number(quantity) || 0,
      batchNumber: batchNumbers[variantId],
      expiryDate: expiryDates[variantId],
    }));

    receivePurchaseOrderGoods(receivingPo.id, receivedItems);
    setReceivingPo(null);
  };

  // Auto-replenish all low stock items by grouping by supplier
  const handleBulkAutoReplenish = () => {
    if (lowStockItems.length === 0) return;

    // Group low stock items by supplier
    const itemsBySupplier: {
      [supplierId: string]: {
        supplier: Supplier;
        items: Array<{
          productId: string;
          variantId: string;
          productName: string;
          variantName: string;
          sku: string;
          orderedQty: number;
          unitCost: number;
        }>;
      };
    } = {};

    lowStockItems.forEach(({ product, variant, deficitQty, defaultSupplier }) => {
      const selectedSupId = replenishSuppliers[variant.id] || defaultSupplier?.id || suppliers[0]?.id;
      const selectedSup = suppliers.find((s) => s.id === selectedSupId) || suppliers[0];
      const customQty = replenishQtys[variant.id] || deficitQty;

      if (!itemsBySupplier[selectedSup.id]) {
        itemsBySupplier[selectedSup.id] = {
          supplier: selectedSup,
          items: [],
        };
      }

      itemsBySupplier[selectedSup.id].items.push({
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        orderedQty: customQty,
        unitCost: variant.costPrice,
      });
    });

    let poCount = 0;
    const destLoc = locations[0];

    Object.values(itemsBySupplier).forEach(({ supplier, items }) => {
      if (items.length === 0) return;
      const subtotal = items.reduce((s, it) => s + it.unitCost * it.orderedQty, 0);

      createPurchaseOrder({
        supplierId: supplier.id,
        supplierName: supplier.name,
        destinationLocationId: destLoc.id,
        destinationLocationName: destLoc.name,
        status: 'Sent',
        paymentStatus: 'Unpaid',
        expectedDate: new Date(Date.now() + (supplier.leadTimeDays || 7) * 86400000).toISOString(),
        items: items.map((it) => ({
          ...it,
          receivedQty: 0,
          totalCost: it.orderedQty * it.unitCost,
        })),
        subtotal,
        tax: subtotal * 0.05,
        shipping: 40,
        totalAmount: subtotal * 1.05 + 40,
        notes: `Automated reorder generated from stock replenishment threshold scan.`,
        createdBy: 'System Auto-Procurement',
      });
      poCount++;
    });

    setAutoOrderSuccessMsg(
      `Successfully generated ${poCount} Purchase Order(s) across ${lowStockItems.length} low-stock SKUs!`
    );
    setTimeout(() => setAutoOrderSuccessMsg(null), 6000);
  };

  // Filtered Purchase Orders
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const query = poSearch.toLowerCase().trim();
      const matchesSearch =
        !query ||
        po.poNumber.toLowerCase().includes(query) ||
        po.supplierName.toLowerCase().includes(query) ||
        po.items.some((i) => i.productName.toLowerCase().includes(query) || i.sku.toLowerCase().includes(query));

      const matchesStatus =
        poStatusFilter === 'ALL'
          ? true
          : poStatusFilter === 'OPEN'
          ? po.status === 'Sent' || po.status === 'Approved' || po.status === 'Partially Received'
          : po.status.toUpperCase() === poStatusFilter.toUpperCase();

      const matchesLocation = poLocationFilter === 'ALL' || po.destinationLocationId === poLocationFilter;

      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [purchaseOrders, poSearch, poStatusFilter, poLocationFilter]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const query = supplierSearch.toLowerCase().trim();
      const matchesSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.contactPerson.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        s.phone.toLowerCase().includes(query);

      const matchesTerms =
        supplierTermsFilter === 'ALL' || s.paymentTerms.toLowerCase() === supplierTermsFilter.toLowerCase();

      return matchesSearch && matchesTerms;
    });
  }, [suppliers, supplierSearch, supplierTermsFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const openPOs = purchaseOrders.filter((p) => p.status !== 'Received' && p.status !== 'Cancelled');
    const openPOValue = openPOs.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalLowStockCost = lowStockItems.reduce(
      (sum, item) => sum + item.deficitQty * item.variant.costPrice,
      0
    );
    const receivedPOs = purchaseOrders.filter((p) => p.status === 'Received');
    const totalReceivedValue = receivedPOs.reduce((sum, p) => sum + p.totalAmount, 0);

    return {
      activeSuppliersCount: suppliers.length,
      openPOCount: openPOs.length,
      openPOValue,
      lowStockCount: lowStockItems.length,
      totalLowStockCost,
      receivedPOCount: receivedPOs.length,
      totalReceivedValue,
      avgLeadTime: (
        suppliers.reduce((s, sup) => s + (sup.leadTimeDays || 5), 0) / (suppliers.length || 1)
      ).toFixed(1),
    };
  }, [purchaseOrders, suppliers, lowStockItems]);

  return (
    <div className="space-y-6">
      {/* Executive Workspace Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Purchasing & Supplier Portal
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Procurement Active
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5">
                Vendor relation directory, purchase order workflows, and automated threshold stock replenishment
              </p>
            </div>
          </div>
        </div>

        {/* Global Quick Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('replenishment')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              activeTab === 'replenishment'
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Reorder Alerts ({metrics.lowStockCount})</span>
          </button>

          <button
            onClick={() => openSupplierModal()}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs"
          >
            <Building className="w-4 h-4 text-slate-500" />
            <span>Add Supplier Profile</span>
          </button>

          <button
            id="btn-create-purchase-order"
            onClick={() => openCreatePoModal()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs shadow-blue-200 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Issue Purchase Order</span>
          </button>
        </div>
      </div>

      {/* Top Procurement Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Active Suppliers
            </span>
            <span className="text-2xl font-extrabold text-slate-900 mt-0.5 block">
              {metrics.activeSuppliersCount}
            </span>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">
              Avg Lead Time: <strong className="text-slate-800">{metrics.avgLeadTime} Days</strong>
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Building className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Open PO Commitment
            </span>
            <span className="text-2xl font-extrabold text-blue-600 mt-0.5 block font-mono">
              {formatCurrency(metrics.openPOValue)}
            </span>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">
              {metrics.openPOCount} Pending Inbound POs
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Stock Reorder Risk
            </span>
            <span className="text-2xl font-extrabold text-amber-600 mt-0.5 block font-mono">
              {metrics.lowStockCount} SKUs
            </span>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">
              Est. Restock: <strong className="text-slate-800">{formatCurrency(metrics.totalLowStockCost)}</strong>
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Inbound GRN Received
            </span>
            <span className="text-2xl font-extrabold text-emerald-600 mt-0.5 block font-mono">
              {formatCurrency(metrics.totalReceivedValue)}
            </span>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">
              {metrics.receivedPOCount} Orders Received
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Pills */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 shadow-2xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('pos')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'pos'
              ? 'bg-blue-600 text-white shadow-2xs font-bold'
              : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Purchase Orders ({purchaseOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex-1 min-w-[150px] py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'suppliers'
              ? 'bg-blue-600 text-white shadow-2xs font-bold'
              : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Supplier Directory ({suppliers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('replenishment')}
          className={`flex-1 min-w-[180px] py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'replenishment'
              ? 'bg-blue-600 text-white shadow-2xs font-bold'
              : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Auto-Replenishment ({metrics.lowStockCount})</span>
          {metrics.lowStockCount > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-400 text-slate-900 rounded-full text-[10px] font-black">
              !
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'analytics'
              ? 'bg-blue-600 text-white shadow-2xs font-bold'
              : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Spend & AP Analytics</span>
        </button>
      </div>

      {/* Auto Order Success Banner */}
      {autoOrderSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{autoOrderSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActiveTab('pos')}
            className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700"
          >
            View Issued POs →
          </button>
        </div>
      )}

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === 'pos' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-4 p-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PO #, supplier, or product name..."
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
                <button
                  onClick={() => setPoStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    poStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setPoStatusFilter('OPEN')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    poStatusFilter === 'OPEN' ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'hover:text-slate-900'
                  }`}
                >
                  Open / Pending
                </button>
                <button
                  onClick={() => setPoStatusFilter('RECEIVED')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    poStatusFilter === 'RECEIVED' ? 'bg-white text-emerald-600 shadow-2xs font-bold' : 'hover:text-slate-900'
                  }`}
                >
                  Received
                </button>
              </div>

              <select
                value={poLocationFilter}
                onChange={(e) => setPoLocationFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-lg py-2 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Destination Facilities</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PO Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Order Items Summary</th>
                    <th className="py-3 px-4">Expected Date</th>
                    <th className="py-3 px-4 text-right">Total Cost</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPOs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No purchase orders matching criteria found.
                      </td>
                    </tr>
                  ) : (
                    filteredPOs.map((po) => {
                      const isFullyReceived = po.status === 'Received';

                      return (
                        <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            <button
                              onClick={() => setViewingPo(po)}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              {po.poNumber}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">{po.supplierName}</td>
                          <td className="py-3.5 px-4 text-slate-600">{po.destinationLocationName}</td>
                          <td className="py-3.5 px-4 text-slate-700">
                            <div className="space-y-0.5">
                              {po.items.map((i, idx) => (
                                <div key={idx} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-800">{i.productName}</span>
                                  <span className="text-slate-400">
                                    ({i.receivedQty}/{i.orderedQty} recv)
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs">
                            {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(po.totalAmount)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                po.status === 'Received'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : po.status === 'Partially Received'
                                  ? 'bg-amber-100 text-amber-800'
                                  : po.status === 'Cancelled'
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {po.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setViewingPo(po)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Slip / Invoice"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {!isFullyReceived && po.status !== 'Cancelled' && (
                                <button
                                  onClick={() => openReceiveModal(po)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                                >
                                  <PackagePlus className="w-3.5 h-3.5" />
                                  <span>Receive</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUPPLIER DIRECTORY */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {/* Supplier Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 border border-slate-200 rounded-xl shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search vendor name, contact person, email or phone..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={supplierTermsFilter}
                onChange={(e) => setSupplierTermsFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-lg py-2 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Payment Terms</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 60">Net 60</option>
                <option value="Immediate / COD">Immediate / COD</option>
              </select>

              <button
                onClick={() => openSupplierModal()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Supplier</span>
              </button>
            </div>
          </div>

          {/* Supplier Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((sup) => (
              <div
                key={sup.id}
                className="p-5 bg-white rounded-xl border border-slate-200 space-y-3 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{sup.name}</span>
                      </h3>
                      <span className="font-mono text-[10px] text-slate-400">ID: {sup.id}</span>
                    </div>

                    <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 font-bold text-xs shrink-0">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{sup.rating}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                    <p className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Contact: <strong className="text-slate-800">{sup.contactPerson}</strong>
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-500">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{sup.email}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{sup.phone}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{sup.address}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>
                      Terms: <strong className="text-slate-800 font-semibold">{sup.paymentTerms}</strong>
                    </span>
                    <span>
                      Lead Time:{' '}
                      <strong className="text-slate-800 font-semibold">{sup.leadTimeDays} Days</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => openCreatePoModal(sup.id)}
                      className="flex-1 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Issue PO</span>
                    </button>

                    <button
                      onClick={() => openSupplierModal(sup)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit Supplier Profile"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Supplier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: AUTOMATED REPLENISHMENT */}
      {activeTab === 'replenishment' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-500 animate-spin-slow" />
                <span>Automated Reorder Threshold Engine</span>
              </h2>
              <p className="text-xs text-slate-500">
                Scans all master catalog SKUs across branches. Items with stock ≤ low stock threshold are queued for auto-replenishment.
              </p>
            </div>

            {lowStockItems.length > 0 && (
              <button
                onClick={handleBulkAutoReplenish}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-xs flex items-center gap-2 transition-colors self-start sm:self-auto"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Auto-Generate Grouped POs ({lowStockItems.length} SKUs)</span>
              </button>
            )}
          </div>

          {lowStockItems.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-800 text-sm">All Inventory Stock Levels Healthy!</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No catalog SKUs are currently below their defined low stock safety thresholds. Automated purchase orders will trigger as stock depletes.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Product & SKU</th>
                    <th className="py-3 px-4 text-center">Current Total Stock</th>
                    <th className="py-3 px-4 text-center">Reorder Threshold</th>
                    <th className="py-3 px-4 text-center">Suggested Order Qty</th>
                    <th className="py-3 px-4">Preferred Supplier</th>
                    <th className="py-3 px-4 text-right">Est. Unit Cost</th>
                    <th className="py-3 px-4 text-right">Line Total</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.map(({ product, variant, totalStock, deficitQty, defaultSupplier }) => {
                    const chosenSupplierId =
                      replenishSuppliers[variant.id] || defaultSupplier?.id || suppliers[0]?.id;
                    const customQty = replenishQtys[variant.id] || deficitQty;
                    const lineTotal = customQty * variant.costPrice;

                    return (
                      <tr key={variant.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{product.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {variant.name} • SKU: {variant.sku}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                              totalStock === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {totalStock} {product.unit}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono text-slate-600 font-semibold">
                          {variant.lowStockThreshold} {product.unit}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="number"
                            min="1"
                            value={customQty}
                            onChange={(e) => {
                              const q = parseInt(e.target.value, 10) || 1;
                              setReplenishQtys((prev) => ({ ...prev, [variant.id]: q }));
                            }}
                            className="w-20 bg-white border border-slate-300 rounded p-1 text-center font-bold text-slate-900"
                          />
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={chosenSupplierId}
                            onChange={(e) =>
                              setReplenishSuppliers((prev) => ({ ...prev, [variant.id]: e.target.value }))
                            }
                            className="bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 w-full"
                          >
                            {suppliers.map((sup) => (
                              <option key={sup.id} value={sup.id}>
                                {sup.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-700">
                          {formatCurrency(variant.costPrice)}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(lineTotal)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => openCreatePoModal(chosenSupplierId, variant.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-2xs"
                          >
                            Issue PO
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PROCUREMENT ANALYTICS & AP LEDGER */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span>Procurement Expenditure by Supplier</span>
            </h3>

            <div className="space-y-3">
              {suppliers.map((sup) => {
                const supPOs = purchaseOrders.filter((p) => p.supplierId === sup.id);
                const totalSpent = supPOs.reduce((sum, p) => sum + p.totalAmount, 0);
                const grandTotal = purchaseOrders.reduce((sum, p) => sum + p.totalAmount, 1);
                const pct = Math.min(100, Math.round((totalSpent / grandTotal) * 100));

                return (
                  <div key={sup.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-800">{sup.name}</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatCurrency(totalSpent)} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Vendor Fulfillment Lead Times</span>
            </h3>

            <div className="space-y-3">
              {suppliers.map((sup) => (
                <div key={sup.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{sup.name}</div>
                    <div className="text-[11px] text-slate-500">Contact: {sup.contactPerson}</div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-xs font-mono">{sup.leadTimeDays} Days</div>
                    <div className="text-[10px] text-emerald-600 font-semibold">98.5% On-Time</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / ISSUE PO */}
      {isCreatePoOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Issue Purchase Order</h3>
              </div>
              <button
                onClick={() => setIsCreatePoOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePoSubmit} className="py-4 overflow-y-auto space-y-4 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Vendor / Supplier:</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Destination Facility:</label>
                  <select
                    value={destinationLocationId}
                    onChange={(e) => setDestinationLocationId(e.target.value as BranchLocationId)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Expected Inbound Date:</label>
                  <input
                    type="date"
                    required
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-slate-600">
                    Order Line Items
                  </span>
                  <button
                    type="button"
                    onClick={handleAddPoItemRow}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-xs font-semibold hover:bg-blue-100"
                  >
                    + Add Item
                  </button>
                </div>

                {poLineItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-5">
                      <select
                        value={item.variantId}
                        onChange={(e) => {
                          const vId = e.target.value;
                          const found = allVariants.find((x) => x.variant.id === vId);
                          if (found) {
                            setPoLineItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      productId: found.product.id,
                                      variantId: found.variant.id,
                                      productName: found.product.name,
                                      variantName: found.variant.name,
                                      sku: found.variant.sku,
                                      unitCost: found.variant.costPrice,
                                    }
                                  : it
                              )
                            );
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-900 text-xs"
                      >
                        {allVariants.map(({ product, variant }) => (
                          <option key={variant.id} value={variant.id}>
                            {product.name} ({variant.name})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-3">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.orderedQty}
                        onChange={(e) => {
                          const q = parseInt(e.target.value, 10) || 1;
                          setPoLineItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, orderedQty: q } : it))
                          );
                        }}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-900 text-center text-xs font-bold"
                      />
                    </div>

                    <div className="col-span-3 font-mono font-bold text-right text-slate-900">
                      {formatCurrency(item.unitCost * item.orderedQty)}
                    </div>

                    <div className="col-span-1 text-right">
                      {poLineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePoItemRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Special Instructions:</label>
                <textarea
                  rows={2}
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="Carrier instructions, delivery hours, or special handling notes..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreatePoOpen(false)}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Confirm & Transmit PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT SUPPLIER */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                {editingSupplier ? 'Edit Supplier Profile' : 'Add New Supplier Profile'}
              </h3>
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="py-4 space-y-3">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Company / Vendor Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Electronics Ltd."
                  value={supplierFormData.name}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Contact Person:</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. David Vance"
                    value={supplierFormData.contactPerson}
                    onChange={(e) =>
                      setSupplierFormData({ ...supplierFormData, contactPerson: e.target.value })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Payment Terms:</label>
                  <select
                    value={supplierFormData.paymentTerms}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, paymentTerms: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 60">Net 60</option>
                    <option value="Immediate / COD">Immediate / COD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Email Address:</label>
                  <input
                    type="email"
                    required
                    placeholder="orders@vendor.com"
                    value={supplierFormData.email}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, email: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Phone Number:</label>
                  <input
                    type="text"
                    required
                    placeholder="+1 (555) 019-2831"
                    value={supplierFormData.phone}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Office / Warehouse Address:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 742 Industrial Pkwy, Logistics Zone B"
                  value={supplierFormData.address}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, address: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Lead Time (Days):</label>
                  <input
                    type="number"
                    min="1"
                    value={supplierFormData.leadTimeDays}
                    onChange={(e) =>
                      setSupplierFormData({ ...supplierFormData, leadTimeDays: Number(e.target.value) || 1 })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Rating (1 to 5):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={supplierFormData.rating}
                    onChange={(e) =>
                      setSupplierFormData({ ...supplierFormData, rating: Number(e.target.value) || 5 })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Save Supplier Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECEIVE GOODS (GRN) */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Receive Goods for PO {receivingPo.poNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Restocks facility inventory & writes financial ledger accounts payable
                </p>
              </div>
              <button onClick={() => setReceivingPo(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Destination Facility:</label>
                <p className="p-2.5 bg-slate-50 rounded-lg text-slate-900 font-bold border border-slate-200">
                  {receivingPo.destinationLocationName}
                </p>
              </div>

              <div className="space-y-3">
                <p className="font-bold uppercase tracking-wider text-[11px] text-slate-600">
                  Line Items to Receive & Lot Assign:
                </p>
                {receivingPo.items.map((item) => (
                  <div
                    key={item.variantId}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">
                          Ordered: {item.orderedQty} • Already Recv: {item.receivedQty}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-medium">Recv Qty:</span>
                        <input
                          type="number"
                          min="0"
                          max={item.orderedQty - item.receivedQty}
                          value={receivedQtys[item.variantId] || 0}
                          onChange={(e) => {
                            const q = parseInt(e.target.value, 10) || 0;
                            setReceivedQtys((prev) => ({ ...prev, [item.variantId]: q }));
                          }}
                          className="w-20 bg-white border border-slate-300 rounded p-1.5 text-right font-bold text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Batch / Lot #:</span>
                        <input
                          type="text"
                          value={batchNumbers[item.variantId] || ''}
                          onChange={(e) =>
                            setBatchNumbers((prev) => ({ ...prev, [item.variantId]: e.target.value }))
                          }
                          className="w-full bg-white border border-slate-200 rounded p-1 text-slate-900 font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block">Expiry Date:</span>
                        <input
                          type="date"
                          value={expiryDates[item.variantId] || ''}
                          onChange={(e) =>
                            setExpiryDates((prev) => ({ ...prev, [item.variantId]: e.target.value }))
                          }
                          className="w-full bg-white border border-slate-200 rounded p-1 text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleConfirmReceiveGoods}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Receiving & Post to Ledger</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VIEW PO DOCUMENT / SLIP */}
      {viewingPo && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-lg text-slate-900 font-mono">{viewingPo.poNumber}</h3>
                <p className="text-xs text-slate-500">Official Purchase Order Slip</p>
              </div>
              <button onClick={() => setViewingPo(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">Vendor:</span>
                <p className="font-bold text-slate-900">{viewingPo.supplierName}</p>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Ship To Facility:
                </span>
                <p className="font-bold text-slate-900">{viewingPo.destinationLocationName}</p>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">Order Date:</span>
                <p className="text-slate-800">{new Date(viewingPo.orderDate).toLocaleDateString()}</p>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Expected Date:
                </span>
                <p className="text-slate-800">
                  {viewingPo.expectedDate ? new Date(viewingPo.expectedDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-bold uppercase tracking-wider text-[11px] text-slate-600 block">
                Line Items Breakdown
              </span>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Cost</th>
                      <th className="py-2 px-3 text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingPo.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-semibold text-slate-900">{it.productName}</td>
                        <td className="py-2 px-3 text-center">{it.orderedQty}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatCurrency(it.unitCost)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {formatCurrency(it.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1 text-right text-xs pt-2 border-t border-slate-200">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">{formatCurrency(viewingPo.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax (5%):</span>
                <span className="font-mono">{formatCurrency(viewingPo.tax)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Freight / Shipping:</span>
                <span className="font-mono">{formatCurrency(viewingPo.shipping)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                <span>Total Amount:</span>
                <span className="font-mono text-blue-600">{formatCurrency(viewingPo.totalAmount)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
