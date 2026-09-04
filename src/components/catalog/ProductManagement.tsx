import React, { useState } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  FolderTree,
  Award,
  Scale,
  QrCode,
  Hourglass,
  Barcode as BarcodeIcon,
  Printer,
  Sparkles,
  Layers,
  Store,
  Monitor,
  Building2,
  ShieldCheck,
  Tag,
  Boxes,
  Cpu,
  PackagePlus,
  ArrowRight,
  Filter,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  ArrowUpRight,
  Download,
  BarChart3,
  Percent,
  Truck,
  Warehouse,
  LayoutGrid,
  List,
  Eye,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Product, ProductVariant, ProductType, ProductStatus } from '../../types';
import { CategoryManagement } from './CategoryManagement';
import { BrandManagement } from './BrandManagement';
import { UomManagement } from './UomManagement';
import { SerialNumberRegistry } from './SerialNumberRegistry';
import { BatchLotManagement } from './BatchLotManagement';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { ProductModal } from './ProductModal';
import { ProductServiceManager } from './ProductServiceManager';
import { Server } from 'lucide-react';

type ModuleTab = 'catalog' | 'service' | 'categories' | 'brands' | 'uom' | 'serials' | 'batches';
type WorkspaceTab = 'overview' | 'variants' | 'inventory' | 'pricing';

export const ProductManagement: React.FC = () => {
  const {
    products,
    deleteProduct,
    duplicateProduct,
    categories,
    brands,
    locations,
    formatCurrency,
    getTotalStockForVariant,
  } = useCommerce();

  // Navigation: Sub-Modules and Workspace Tabs
  const [activeModule, setActiveModule] = useState<ModuleTab>('catalog');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('overview');

  // View mode toggle for Overview (Table vs Grid Cards)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Master Catalog Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | ProductStatus>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | ProductType>('All');
  const [marginFilter, setMarginFilter] = useState<'All' | 'low' | 'healthy' | 'high'>('All');
  const [locationFilter, setLocationFilter] = useState<string>('All');

  // Expanded variant rows in table
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState<Product | null>(null);
  const [selectedVariantForBarcode, setSelectedVariantForBarcode] = useState<ProductVariant | null>(null);

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;
    const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    const pType = p.productType || (p.isBundle ? 'bundle' : p.isComposite ? 'composite' : 'standard');
    const matchesType = typeFilter === 'All' || pType === typeFilter;

    // Margin filter check
    let matchesMargin = true;
    if (marginFilter !== 'All') {
      const avgMargin =
        p.variants.reduce((acc, v) => {
          const margin = ((v.retailPrice - v.costPrice) / v.retailPrice) * 100;
          return acc + margin;
        }, 0) / (p.variants.length || 1);

      if (marginFilter === 'low') matchesMargin = avgMargin < 20;
      else if (marginFilter === 'healthy') matchesMargin = avgMargin >= 20 && avgMargin <= 50;
      else if (marginFilter === 'high') matchesMargin = avgMargin > 50;
    }

    const query = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      p.variants.some(
        (v) =>
          v.sku.toLowerCase().includes(query) ||
          v.barcode.includes(query) ||
          v.name.toLowerCase().includes(query)
      );

    return matchesCat && matchesBrand && matchesStatus && matchesType && matchesMargin && matchesSearch;
  });

  // Flattened Variants List across filtered products for the Variants & Pricing workspace tabs
  const allFlattenedVariants = filteredProducts.flatMap((product) =>
    product.variants.map((variant) => {
      const totalStock = getTotalStockForVariant(product.id, variant.id);
      const marginDollars = variant.retailPrice - variant.costPrice;
      const marginPercent = variant.retailPrice > 0 ? (marginDollars / variant.retailPrice) * 100 : 0;
      const markupPercent = variant.costPrice > 0 ? (marginDollars / variant.costPrice) * 100 : 0;

      return {
        product,
        variant,
        totalStock,
        marginDollars,
        marginPercent,
        markupPercent,
      };
    })
  );

  // Master KPI Metrics Calculations
  const totalProductsCount = products.length;
  const totalVariantsCount = products.reduce((acc, p) => acc + p.variants.length, 0);

  const totalCatalogCostValue = products.reduce((acc, p) => {
    return (
      acc +
      p.variants.reduce((vAcc, v) => {
        const stock = getTotalStockForVariant(p.id, v.id);
        return vAcc + stock * v.costPrice;
      }, 0)
    );
  }, 0);

  const totalCatalogRetailValue = products.reduce((acc, p) => {
    return (
      acc +
      p.variants.reduce((vAcc, v) => {
        const stock = getTotalStockForVariant(p.id, v.id);
        return vAcc + stock * v.retailPrice;
      }, 0)
    );
  }, 0);

  const totalUnitsInStock = products.reduce((acc, p) => {
    return (
      acc +
      p.variants.reduce((vAcc, v) => vAcc + getTotalStockForVariant(p.id, v.id), 0)
    );
  }, 0);

  const lowStockCount = products.reduce((acc, p) => {
    const pStock = p.variants.reduce((vAcc, v) => vAcc + getTotalStockForVariant(p.id, v.id), 0);
    return pStock > 0 && pStock <= 15 ? acc + 1 : acc;
  }, 0);

  const outOfStockCount = products.reduce((acc, p) => {
    const pStock = p.variants.reduce((vAcc, v) => vAcc + getTotalStockForVariant(p.id, v.id), 0);
    return pStock === 0 ? acc + 1 : acc;
  }, 0);

  const avgCatalogMarginPercent =
    totalCatalogRetailValue > 0
      ? ((totalCatalogRetailValue - totalCatalogCostValue) / totalCatalogRetailValue) * 100
      : 0;

  const lowMarginCount = allFlattenedVariants.filter((v) => v.marginPercent < 20).length;
  const highMarginCount = allFlattenedVariants.filter((v) => v.marginPercent > 50).length;

  const handleOpenCreateProduct = () => {
    setProductToEdit(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setProductToEdit(prod);
    setIsProductModalOpen(true);
  };

  const handleOpenBarcode = (prod: Product, variant?: ProductVariant) => {
    setSelectedProductForBarcode(prod);
    setSelectedVariantForBarcode(variant || prod.variants[0]);
    setIsBarcodeModalOpen(true);
  };

  const handleDuplicate = (prodId: string) => {
    duplicateProduct(prodId);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* 1. EXECUTIVE WORKSPACE HEADER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Product Workspace
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                  <span>Omnichannel Catalog</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Central catalog repository powering POS registers, e-commerce webstore & wholesale BOMs
              </p>
            </div>
          </div>
        </div>

        {/* Global Catalog Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => handleOpenBarcode(products[0])}
            className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200/80 dark:border-slate-700 transition-all flex items-center gap-2 cursor-pointer min-h-[38px]"
          >
            <Printer className="w-4 h-4 text-sky-500" />
            <span className="hidden sm:inline">Print Barcodes & Labels</span>
            <span className="sm:hidden">Print</span>
          </button>

          <button
            onClick={handleOpenCreateProduct}
            id="btn-create-product-workspace"
            className="px-4 py-2 sm:py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-95 text-white rounded-xl text-xs font-extrabold shadow-md shadow-sky-600/20 flex items-center gap-2 transition-all cursor-pointer min-h-[38px]"
          >
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-MODULES & WORKSPACE TAB NAVIGATION */}
      <div className="space-y-4">
        {/* Module Level Tabs (Catalog vs Categories vs Brands vs UOM vs Serials vs Batches) */}
        <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2 custom-scrollbar">
          {[
            { id: 'catalog', label: `Master Catalog (${totalProductsCount})`, icon: Package },
            { id: 'service', label: 'Product Service (API & Sync)', icon: Server },
            { id: 'categories', label: `Categories (${categories.length})`, icon: FolderTree },
            { id: 'brands', label: `Brands (${brands.length})`, icon: Award },
            { id: 'uom', label: 'Units of Measure', icon: Scale },
            { id: 'serials', label: 'Serial Registry', icon: QrCode },
            { id: 'batches', label: 'Batch Lots & Expiry', icon: Hourglass },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeModule === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id as ModuleTab)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* WORKSPACE SUB-TABS (Only visible when activeModule === 'catalog') */}
        {activeModule === 'catalog' && (
          <div className="bg-slate-100 dark:bg-slate-850 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto">
              {[
                { id: 'overview', label: 'Overview', icon: LayoutGrid, count: totalProductsCount },
                { id: 'variants', label: 'Variants', icon: Layers, count: totalVariantsCount },
                { id: 'inventory', label: 'Inventory', icon: Boxes, count: totalUnitsInStock },
                { id: 'pricing', label: 'Pricing & Margins', icon: DollarSign, badge: `${avgCatalogMarginPercent.toFixed(0)}%` },
              ].map((wTab) => {
                const Icon = wTab.icon;
                const isActive = activeWorkspaceTab === wTab.id;
                return (
                  <button
                    key={wTab.id}
                    id={`workspace-tab-${wTab.id}`}
                    onClick={() => setActiveWorkspaceTab(wTab.id as WorkspaceTab)}
                    className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm border border-slate-200/80 dark:border-slate-800'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-500' : ''}`} />
                    <span>{wTab.label}</span>
                    {wTab.count !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${isActive ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                        {wTab.count}
                      </span>
                    )}
                    {wTab.badge && (
                      <span className="px-1.5 py-0.2 rounded-md text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                        {wTab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* View Mode Toggle (Table vs Cards) for Overview */}
            {activeWorkspaceTab === 'overview' && (
              <div className="hidden sm:flex items-center space-x-1 p-0.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'table' ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Table View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'cards' ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. ACTIVE CATALOG MODULE OR WORKSPACE CONTENT */}

      {/* SUB-MODULES (Categories, Brands, UOM, Serials, Batches, Product Service) */}
      {activeModule === 'service' && <ProductServiceManager />}
      {activeModule === 'categories' && <CategoryManagement />}
      {activeModule === 'brands' && <BrandManagement />}
      {activeModule === 'uom' && <UomManagement />}
      {activeModule === 'serials' && <SerialNumberRegistry />}
      {activeModule === 'batches' && <BatchLotManagement />}

      {/* MASTER CATALOG WORKSPACE (When activeModule === 'catalog') */}
      {activeModule === 'catalog' && (
        <div className="space-y-6">

          {/* GLOBAL SEARCH & MULTI-FILTER BAR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products by title, brand, category, SKU, or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-sky-500 font-medium"
                />
              </div>

              {/* Filters Group */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
                {/* Category Filter */}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
                >
                  <option value="All">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Brand Filter */}
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
                >
                  <option value="All">All Brands</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {/* Type Filter */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
                >
                  <option value="All">All Types</option>
                  <option value="standard">Standard</option>
                  <option value="variant">Multi-Variant</option>
                  <option value="bundle">Bundle Kit</option>
                  <option value="composite">Composite BOM</option>
                </select>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
                >
                  <option value="All">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="discontinued">Discontinued</option>
                </select>
              </div>
            </div>
          </div>

          {/* WORKSPACE TAB 1: OVERVIEW */}
          {activeWorkspaceTab === 'overview' && (
            <div className="space-y-6">
              {/* Executive KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6">
                {/* Metric 1: Catalog Size */}
                <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-sky-500/40 transition-all">
                  <div className="space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
                      <span className="uppercase tracking-wider truncate">Master Catalog</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                        <Package className="w-3 h-3 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
                      <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {totalProductsCount}
                      </span>
                      <span className="text-[9px] sm:text-[11px] font-bold text-sky-600 dark:text-sky-400">
                        ({totalVariantsCount} SKUs)
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] text-slate-500">
                    <span>{categories.length} Categories</span>
                    <span>{brands.length} Brands</span>
                  </div>
                </div>

                {/* Metric 2: Inventory Valuation */}
                <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                  <div className="space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
                      <span className="uppercase tracking-wider truncate">Retail Value</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                        <DollarSign className="w-3 h-3 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
                      <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                        {formatCurrency(totalCatalogRetailValue)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] text-slate-500">
                    <span>Cost: {formatCurrency(totalCatalogCostValue)}</span>
                    <span className="text-emerald-500 font-bold">+{avgCatalogMarginPercent.toFixed(0)}% Margin</span>
                  </div>
                </div>

                {/* Metric 3: Total Stock Units */}
                <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                  <div className="space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
                      <span className="uppercase tracking-wider truncate">System Stock</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <Boxes className="w-3 h-3 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
                      <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {totalUnitsInStock}
                      </span>
                      <span className="text-[9px] sm:text-[11px] font-bold text-slate-400">
                        Units
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] text-slate-500">
                    <span>{locations.length} Branch Locations</span>
                    <span className="text-sky-500 font-bold">100% Synced</span>
                  </div>
                </div>

                {/* Metric 4: Stock Alerts */}
                <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/40 transition-all">
                  <div className="space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
                      <span className="uppercase tracking-wider truncate">Inventory Risk</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {lowStockCount + outOfStockCount}
                      </span>
                      <span className="text-[9px] sm:text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Alerts
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] text-slate-500">
                    <span className="text-amber-500 font-bold">{lowStockCount} Low</span>
                    <span className="text-rose-500 font-bold">{outOfStockCount} Out</span>
                  </div>
                </div>
              </div>

              {/* OVERVIEW TABLE VIEW (Desktop & Tablet) */}
              {viewMode === 'table' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  {/* Table for screens >= sm */}
                  <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3.5 px-4">Product & Media</th>
                          <th className="py-3.5 px-4">Archetype & Channels</th>
                          <th className="py-3.5 px-4">Category / Brand</th>
                          <th className="py-3.5 px-4">SKU Matrix</th>
                          <th className="py-3.5 px-4">Retail Price</th>
                          <th className="py-3.5 px-4">Stock Units</th>
                          <th className="py-3.5 px-4">Margin %</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-16 text-slate-500">
                              <Package className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                              <p className="font-bold text-slate-700 dark:text-slate-300">No matching catalog items.</p>
                              <p className="text-xs text-slate-400 mt-1">Try resetting your filter options.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredProducts.map((product) => {
                            const isExpanded = expandedProductId === product.id;
                            const prices = product.variants.map((v) => v.retailPrice);
                            const minPrice = Math.min(...prices);
                            const maxPrice = Math.max(...prices);
                            const totalStock = product.variants.reduce(
                              (acc, v) => acc + getTotalStockForVariant(product.id, v.id),
                              0
                            );

                            const avgMargin =
                              product.variants.reduce((acc, v) => {
                                return acc + (v.retailPrice > 0 ? ((v.retailPrice - v.costPrice) / v.retailPrice) * 100 : 0);
                              }, 0) / (product.variants.length || 1);

                            const pType =
                              product.productType ||
                              (product.isBundle ? 'bundle' : product.isComposite ? 'composite' : 'standard');

                            return (
                              <React.Fragment key={product.id}>
                                <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group">
                                  {/* Product & Media */}
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center space-x-3">
                                      <img
                                        src={product.images[0]}
                                        alt={product.name}
                                        referrerPolicy="no-referrer"
                                        className="w-10 h-10 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex-shrink-0"
                                      />
                                      <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm group-hover:text-sky-500 transition-colors line-clamp-1">
                                          {product.name}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 font-mono">
                                          /{product.slug} • {product.unit || 'pcs'}
                                        </p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Archetype & Channels */}
                                  <td className="py-3.5 px-4">
                                    <div className="space-y-1">
                                      {pType === 'bundle' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                          <PackagePlus className="w-3 h-3" /> Bundle ({product.bundleItems?.length || 0})
                                        </span>
                                      ) : pType === 'composite' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                          <Cpu className="w-3 h-3" /> Composite BOM
                                        </span>
                                      ) : product.variants.length > 1 ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                          <Layers className="w-3 h-3" /> Multi-Variant
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                          <Package className="w-3 h-3" /> Standard
                                        </span>
                                      )}

                                      <div className="flex items-center space-x-1.5 text-slate-400 pt-0.5">
                                        {product.channels?.pos !== false && (
                                          <span title="Enabled on POS" className="text-sky-500">
                                            <Monitor className="w-3 h-3" />
                                          </span>
                                        )}
                                        {product.channels?.ecommerce !== false && (
                                          <span title="Enabled on Webstore" className="text-emerald-500">
                                            <Store className="w-3 h-3" />
                                          </span>
                                        )}
                                        {product.channels?.wholesale !== false && (
                                          <span title="Enabled on Wholesale" className="text-amber-500">
                                            <Building2 className="w-3 h-3" />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Category / Brand */}
                                  <td className="py-3.5 px-4">
                                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">{product.category}</p>
                                    <p className="text-[10px] text-slate-400">{product.brand}</p>
                                  </td>

                                  {/* SKU Matrix Expand */}
                                  <td className="py-3.5 px-4">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                                      className="flex items-center space-x-1 font-extrabold text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                                    >
                                      <span>{product.variants.length} SKU{product.variants.length > 1 ? 's' : ''}</span>
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  </td>

                                  {/* Retail Price */}
                                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                    {minPrice === maxPrice ? (
                                      formatCurrency(minPrice)
                                    ) : (
                                      <span>{formatCurrency(minPrice)} – {formatCurrency(maxPrice)}</span>
                                    )}
                                  </td>

                                  {/* Stock Units */}
                                  <td className="py-3.5 px-4">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                                        totalStock === 0
                                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                          : totalStock <= 15
                                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                      }`}
                                    >
                                      <Boxes className="w-3 h-3" />
                                      {totalStock} {product.unit || 'units'}
                                    </span>
                                  </td>

                                  {/* Margin % */}
                                  <td className="py-3.5 px-4 font-mono">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                                        avgMargin >= 50
                                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                          : avgMargin >= 20
                                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                      }`}
                                    >
                                      {avgMargin.toFixed(0)}%
                                    </span>
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3.5 px-4 text-right space-x-1">
                                    <button
                                      onClick={() => handleOpenBarcode(product)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="Print Barcode Labels"
                                    >
                                      <BarcodeIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDuplicate(product.id)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="Duplicate Item"
                                    >
                                      <Copy className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleOpenEditProduct(product)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="Edit Product"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm(`Delete "${product.name}" from catalog?`)) {
                                          deleteProduct(product.id);
                                        }
                                      }}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="Delete Product"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded Variant Sub-Table */}
                                {isExpanded && (
                                  <tr className="bg-slate-50/80 dark:bg-slate-850 border-y border-slate-200 dark:border-slate-800">
                                    <td colSpan={8} className="p-4 sm:p-5">
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                            <Layers className="w-3.5 h-3.5 text-sky-500" />
                                            SKU Matrix & Branch Stock Breakdown for "{product.name}"
                                          </p>
                                          <button
                                            onClick={() => handleOpenEditProduct(product)}
                                            className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-bold"
                                          >
                                            Edit Matrix →
                                          </button>
                                        </div>

                                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs">
                                          <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold text-[10px] uppercase border-b border-slate-200 dark:border-slate-800">
                                              <tr>
                                                <th className="py-2.5 px-3">Variant</th>
                                                <th className="py-2.5 px-3">SKU</th>
                                                <th className="py-2.5 px-3">Barcode</th>
                                                <th className="py-2.5 px-3">Cost</th>
                                                <th className="py-2.5 px-3">Retail</th>
                                                <th className="py-2.5 px-3">Wholesale</th>
                                                <th className="py-2.5 px-3">Branch Breakdown</th>
                                                <th className="py-2.5 px-3 text-right">Label</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                              {product.variants.map((variant) => (
                                                <tr key={variant.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                                  <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                                                    {variant.name}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-sky-500 font-bold">{variant.sku}</td>
                                                  <td className="py-2.5 px-3 text-slate-400">{variant.barcode}</td>
                                                  <td className="py-2.5 px-3 text-slate-500">{formatCurrency(variant.costPrice)}</td>
                                                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{formatCurrency(variant.retailPrice)}</td>
                                                  <td className="py-2.5 px-3 text-slate-400">
                                                    {variant.wholesalePrice ? formatCurrency(variant.wholesalePrice) : '—'}
                                                  </td>
                                                  <td className="py-2.5 px-3 font-sans">
                                                    <div className="flex flex-wrap gap-1">
                                                      {locations.map((loc) => {
                                                        const stock = variant.stockByLocation?.[loc.id] ?? 0;
                                                        return (
                                                          <span
                                                            key={loc.id}
                                                            className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                                          >
                                                            {loc.name.split(' ')[0]}: <b className="text-slate-900 dark:text-white">{stock}</b>
                                                          </span>
                                                        );
                                                      })}
                                                    </div>
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-sans">
                                                    <button
                                                      onClick={() => handleOpenBarcode(product, variant)}
                                                      className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[10px] font-bold cursor-pointer"
                                                    >
                                                      Print
                                                    </button>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Product Card List (Visible on screens < sm or in Cards view mode) */}
                  <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredProducts.map((product) => {
                      const prices = product.variants.map((v) => v.retailPrice);
                      const minPrice = Math.min(...prices);
                      const maxPrice = Math.max(...prices);
                      const totalStock = product.variants.reduce(
                        (acc, v) => acc + getTotalStockForVariant(product.id, v.id),
                        0
                      );

                      return (
                        <div key={product.id} className="p-3.5 space-y-3">
                          <div className="flex items-start space-x-3">
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                                {product.name}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {product.brand} • {product.category}
                              </p>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                                  {minPrice === maxPrice ? formatCurrency(minPrice) : `${formatCurrency(minPrice)}+`}
                                </span>
                                <span
                                  className={`px-2 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                                    totalStock === 0
                                      ? 'bg-rose-500/10 text-rose-600'
                                      : totalStock <= 15
                                      ? 'bg-amber-500/10 text-amber-600'
                                      : 'bg-emerald-500/10 text-emerald-600'
                                  }`}
                                >
                                  {totalStock} in stock
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                            <span className="text-[10px] text-slate-400 font-bold">
                              {product.variants.length} Variant{product.variants.length > 1 ? 's' : ''}
                            </span>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleOpenBarcode(product)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold"
                              >
                                Barcode
                              </button>
                              <button
                                onClick={() => handleOpenEditProduct(product)}
                                className="px-3 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold shadow-xs"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* OVERVIEW GRID CARDS VIEW (Desktop & Mobile when Cards toggled) */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => {
                    const prices = product.variants.map((v) => v.retailPrice);
                    const minPrice = Math.min(...prices);
                    const maxPrice = Math.max(...prices);
                    const totalStock = product.variants.reduce(
                      (acc, v) => acc + getTotalStockForVariant(product.id, v.id),
                      0
                    );

                    return (
                      <div
                        key={product.id}
                        className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-sky-500/40 transition-all flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider">
                                {product.brand}
                              </span>
                              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                                {product.name}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {product.category}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Price</p>
                              <p className="font-mono font-black text-sm text-slate-900 dark:text-white">
                                {minPrice === maxPrice ? formatCurrency(minPrice) : formatCurrency(minPrice) + '+'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">System Stock</p>
                              <p className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                                {totalUnitsInStock} {product.unit || 'pcs'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-2">
                          <button
                            onClick={() => handleOpenBarcode(product)}
                            className="flex-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold text-center cursor-pointer"
                          >
                            Barcode
                          </button>
                          <button
                            onClick={() => handleOpenEditProduct(product)}
                            className="flex-1 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold text-center shadow-xs cursor-pointer"
                          >
                            Edit SKU
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* WORKSPACE TAB 2: VARIANTS MATRIX */}
          {activeWorkspaceTab === 'variants' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">SKU Variant Matrix</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Comprehensive multi-attribute variant registry ({allFlattenedVariants.length} Active SKUs)
                  </p>
                </div>
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-500">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {allFlattenedVariants.filter((v) => v.variant.barcode).length} Barcodes Registered
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4">Variant & Parent</th>
                        <th className="py-3.5 px-4">SKU Code</th>
                        <th className="py-3.5 px-4">Barcode</th>
                        <th className="py-3.5 px-4">Cost Price</th>
                        <th className="py-3.5 px-4">Retail Price</th>
                        <th className="py-3.5 px-4">Wholesale</th>
                        <th className="py-3.5 px-4">Branch Stock Breakdown</th>
                        <th className="py-3.5 px-4 text-right">Label</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {allFlattenedVariants.map(({ product, variant, totalStock }) => (
                        <tr key={variant.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <p className="font-bold text-slate-900 dark:text-white text-xs">{variant.name}</p>
                            <p className="text-[10px] text-slate-400">{product.name} ({product.category})</p>
                          </td>
                          <td className="py-3.5 px-4 text-sky-500 font-bold">{variant.sku}</td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">{variant.barcode || '—'}</td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{formatCurrency(variant.costPrice)}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{formatCurrency(variant.retailPrice)}</td>
                          <td className="py-3.5 px-4 text-slate-400">
                            {variant.wholesalePrice ? formatCurrency(variant.wholesalePrice) : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-sans">
                            <div className="flex flex-wrap gap-1">
                              {locations.map((loc) => {
                                const stock = variant.stockByLocation?.[loc.id] ?? 0;
                                return (
                                  <span
                                    key={loc.id}
                                    className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                  >
                                    {loc.name.split(' ')[0]}: <b className="text-slate-900 dark:text-white">{stock}</b>
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-sans">
                            <button
                              onClick={() => handleOpenBarcode(product, variant)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-bold cursor-pointer"
                            >
                              Print Tag
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* WORKSPACE TAB 3: INVENTORY DETAILED MATRIX */}
          {activeWorkspaceTab === 'inventory' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-1">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total System Units</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">{totalUnitsInStock}</p>
                  <p className="text-xs text-slate-500">Across {locations.length} fulfillment centers</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-1">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Low Stock SKUs</p>
                  <p className="text-2xl font-black text-amber-500 font-mono">{lowStockCount}</p>
                  <p className="text-xs text-slate-500 font-medium">Below safety threshold (&lt;15 units)</p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-1">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Inventory Valuation (Cost)</p>
                  <p className="text-2xl font-black text-indigo-500 font-mono">{formatCurrency(totalCatalogCostValue)}</p>
                  <p className="text-xs text-slate-500">Unrealized retail value: {formatCurrency(totalCatalogRetailValue)}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4">Product & Variant</th>
                        <th className="py-3.5 px-4">SKU</th>
                        <th className="py-3.5 px-4">Stock Status</th>
                        {locations.map((loc) => (
                          <th key={loc.id} className="py-3.5 px-4">{loc.name}</th>
                        ))}
                        <th className="py-3.5 px-4 text-right">Total Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {allFlattenedVariants.map(({ product, variant, totalStock }) => (
                        <tr key={variant.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <p className="font-bold text-slate-900 dark:text-white text-xs">{product.name}</p>
                            <p className="text-[10px] text-slate-400">{variant.name}</p>
                          </td>
                          <td className="py-3.5 px-4 text-sky-500 font-bold">{variant.sku}</td>
                          <td className="py-3.5 px-4 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                totalStock === 0
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  : totalStock <= 15
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {totalStock === 0 ? 'Out of Stock' : totalStock <= 15 ? 'Low Stock' : 'In Stock'}
                            </span>
                          </td>
                          {locations.map((loc) => {
                            const locStock = variant.stockByLocation?.[loc.id] ?? 0;
                            return (
                              <td key={loc.id} className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                                {locStock}
                              </td>
                            );
                          })}
                          <td className="py-3.5 px-4 text-right font-black text-sm text-slate-900 dark:text-white">
                            {totalStock} {product.unit || 'units'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* WORKSPACE TAB 4: PRICING & MARGINS MATRIX */}
          {activeWorkspaceTab === 'pricing' && (
            <div className="space-y-4">
              {/* Pricing Filter Toolbar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Commercial Pricing & Margin Analysis</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gross margins, markup percentages, and tier visibility controls
                  </p>
                </div>
                {/* Margin Filter Buttons */}
                <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center text-xs font-bold overflow-x-auto">
                  <button
                    onClick={() => setMarginFilter('All')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      marginFilter === 'All'
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    All ({allFlattenedVariants.length})
                  </button>
                  <button
                    onClick={() => setMarginFilter('low')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      marginFilter === 'low'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Low (&lt;20%) ({lowMarginCount})
                  </button>
                  <button
                    onClick={() => setMarginFilter('healthy')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      marginFilter === 'healthy'
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Healthy (20-50%)
                  </button>
                  <button
                    onClick={() => setMarginFilter('high')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      marginFilter === 'high'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    High (&gt;50%) ({highMarginCount})
                  </button>
                </div>
              </div>

              {/* Pricing Matrix Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4">Variant & Product</th>
                        <th className="py-3.5 px-4">SKU Code</th>
                        <th className="py-3.5 px-4">Cost Price</th>
                        <th className="py-3.5 px-4">Retail Price</th>
                        <th className="py-3.5 px-4">Wholesale Price</th>
                        <th className="py-3.5 px-4">Gross Profit ($)</th>
                        <th className="py-3.5 px-4">Margin (%)</th>
                        <th className="py-3.5 px-4 text-right">Markup (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {allFlattenedVariants.map(({ product, variant, marginDollars, marginPercent, markupPercent }) => (
                        <tr key={variant.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <p className="font-bold text-slate-900 dark:text-white text-xs">{variant.name}</p>
                            <p className="text-[10px] text-slate-400">{product.name}</p>
                          </td>
                          <td className="py-3.5 px-4 text-sky-500 font-bold">{variant.sku}</td>
                          <td className="py-3.5 px-4 text-slate-500">{formatCurrency(variant.costPrice)}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{formatCurrency(variant.retailPrice)}</td>
                          <td className="py-3.5 px-4 text-slate-400">
                            {variant.wholesalePrice ? formatCurrency(variant.wholesalePrice) : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(marginDollars)}
                          </td>
                          <td className="py-3.5 px-4 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                marginPercent >= 50
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : marginPercent >= 20
                                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {marginPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-600 dark:text-slate-400">
                            {markupPercent.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PRODUCT CREATE / EDIT MODAL */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => {
          setIsProductModalOpen(false);
          setProductToEdit(null);
        }}
        productToEdit={productToEdit}
      />

      {/* BARCODE / QR LABEL MODAL */}
      <BarcodeLabelModal
        isOpen={isBarcodeModalOpen}
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setSelectedProductForBarcode(null);
          setSelectedVariantForBarcode(null);
        }}
        product={selectedProductForBarcode}
        variant={selectedVariantForBarcode}
      />
    </div>
  );
};
