import React, { useState, useEffect, useMemo } from 'react';
import {
  Server,
  Layers,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Search,
  Plus,
  Edit3,
  Trash2,
  Barcode,
  Terminal,
  Activity,
  Boxes,
  Store,
  Monitor,
  Building2,
  Code,
  Send,
  Sliders,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Tag,
  Copy,
  Check,
  Package,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Product, ProductVariant, CatalogAttribute } from '../../types';
import { productService, SyncStatusResponse, SkuLookupResponse } from '../../services/productService';

export const ProductServiceManager: React.FC = () => {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    categories,
    brands,
    formatCurrency,
  } = useCommerce();

  // Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'skus' | 'attributes' | 'api-tester'>('overview');

  // Backend API Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());

  // Products CRUD State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBrand, setSelectedBrand] = useState('All');
  const [channelFilter, setChannelFilter] = useState<'All' | 'pos' | 'ecommerce' | 'wholesale'>('All');

  // Product Modal/Form State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  // SKU Scanner Lookup State
  const [lookupInput, setLookupInput] = useState('AUD-AERO-BLK');
  const [lookupResult, setLookupResult] = useState<SkuLookupResponse | null>(null);
  const [isSearchingSku, setIsSearchingSku] = useState(false);

  // Attributes State
  const [attributes, setAttributes] = useState<CatalogAttribute[]>([
    {
      id: 'attr-color',
      name: 'Color',
      code: 'color',
      type: 'select',
      options: ['Midnight Black', 'Silver Cloud', 'Space Gray', 'Navy Blue', 'Forest Green', 'Titanium Gold', 'Matte White'],
      required: false,
      description: 'Product visual color variant selection',
      usageCount: 24,
    },
    {
      id: 'attr-size',
      name: 'Size',
      code: 'size',
      type: 'select',
      options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
      required: false,
      description: 'Standard apparel and accessory dimensions',
      usageCount: 18,
    },
    {
      id: 'attr-material',
      name: 'Material',
      code: 'material',
      type: 'select',
      options: ['Recycled Aluminum', 'Merino Wool', 'Japanese Ceramic', 'Stainless Steel', 'Titanium Grade 5', 'Organic Cotton'],
      required: false,
      description: 'Primary structural build material',
      usageCount: 12,
    },
    {
      id: 'attr-storage',
      name: 'Storage Capacity',
      code: 'storage',
      type: 'select',
      options: ['128GB', '256GB', '512GB', '1TB', '2TB SSD'],
      required: false,
      description: 'Onboard memory and disk storage',
      usageCount: 8,
    },
  ]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrOptions, setNewAttrOptions] = useState('');

  // API Tester State
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [apiEndpoint, setApiEndpoint] = useState('/api/products');
  const [apiBody, setApiBody] = useState('{\n  "name": "Sample Product",\n  "brand": "AcousticTech",\n  "category": "Electronics"\n}');
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Fetch Sync Status
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const data = await productService.getSyncStatus();
      setSyncStatus(data);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('Backend API endpoint offline, using direct simulated state', e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchAttributes();
  }, []);

  const fetchAttributes = async () => {
    try {
      const res = await productService.getAttributes();
      if (res.success && res.data) {
        setAttributes(res.data);
      }
    } catch (e) {
      // Fallback
    }
  };

  // Trigger Force Sync
  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await productService.forceSync('MANUAL_SERVICE_SYNC', 'Product Master Catalog');
      await fetchStatus();
    } catch (e) {
      setLastSyncTime(new Date().toLocaleTimeString());
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Handle SKU Scanner Test
  const handleSkuLookup = async (skuToSearch?: string) => {
    const target = skuToSearch || lookupInput;
    if (!target.trim()) return;
    setIsSearchingSku(true);
    try {
      const result = await productService.lookupSkuOrBarcode(target.trim());
      setLookupResult(result);
    } catch (err: any) {
      setLookupResult({
        success: false,
        found: false,
        error: err.message || 'SKU lookup error',
      });
    } finally {
      setIsSearchingSku(false);
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesBrand = selectedBrand === 'All' || p.brand === selectedBrand;
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(searchQuery.toLowerCase()) || v.barcode.includes(searchQuery));

      let matchesChannel = true;
      if (channelFilter === 'pos') matchesChannel = !!p.channels?.pos;
      if (channelFilter === 'ecommerce') matchesChannel = !!p.channels?.ecommerce;
      if (channelFilter === 'wholesale') matchesChannel = !!p.channels?.wholesale;

      return matchesCat && matchesBrand && matchesSearch && matchesChannel;
    });
  }, [products, selectedCategory, selectedBrand, searchQuery, channelFilter]);

  // Handle Save Product (Create or Update)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct?.name) return;

    try {
      if (editingProduct.id) {
        // Update
        await productService.updateProduct(editingProduct.id, editingProduct);
        updateProduct(editingProduct as Product);
      } else {
        // Create
        const res = await productService.createProduct(editingProduct);
        if (res.data) {
          addProduct(res.data);
        }
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
      fetchStatus();
    } catch (err: any) {
      alert(`Error saving product: ${err.message}`);
    }
  };

  // Handle Delete Product
  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product from the master catalog?')) return;
    try {
      await productService.deleteProduct(id);
      deleteProduct(id);
      fetchStatus();
    } catch (err: any) {
      alert(`Failed to delete product: ${err.message}`);
    }
  };

  // Add Attribute Option
  const handleAddAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttrName.trim()) return;

    const opts = newAttrOptions.split(',').map((s) => s.trim()).filter(Boolean);
    const newAttr: Partial<CatalogAttribute> = {
      name: newAttrName.trim(),
      code: newAttrName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      type: 'select',
      options: opts.length > 0 ? opts : ['Default'],
      description: 'Custom catalog attribute',
      usageCount: 0,
    };

    try {
      const res = await productService.createAttribute(newAttr);
      if (res.data) {
        setAttributes((prev) => [...prev, res.data]);
      }
    } catch (e) {
      setAttributes((prev) => [
        ...prev,
        {
          id: `attr-${Date.now()}`,
          name: newAttrName.trim(),
          code: newAttrName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          type: 'select',
          options: opts.length > 0 ? opts : ['Default'],
          description: 'Custom catalog attribute',
          usageCount: 0,
        },
      ]);
    }

    setNewAttrName('');
    setNewAttrOptions('');
  };

  // Run API Tester Endpoint
  const handleRunApiTest = async () => {
    setIsApiLoading(true);
    setApiResponse(null);

    try {
      const options: RequestInit = {
        method: apiMethod,
        headers: { 'Content-Type': 'application/json' },
      };

      if (apiMethod === 'POST' || apiMethod === 'PUT') {
        options.body = apiBody;
      }

      const res = await fetch(apiEndpoint, options);
      const data = await res.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setApiResponse(JSON.stringify({ error: err.message || 'API Execution Error' }, null, 2));
    } finally {
      setIsApiLoading(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      
      {/* HEADER & SERVICE ARCHITECTURE BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-700/50 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30">
              <Server className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              Centralized Product Service API
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Single Source of Truth
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            Unified backend master catalog CRUD service driving real-time product definitions, variant SKUs, attributes, and stock rules across POS Register, E-commerce Storefront, and Inventory modules.
          </p>
        </div>

        {/* Sync Status Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 text-xs space-y-0.5 font-mono">
            <div className="text-slate-400 flex items-center justify-between gap-4">
              <span>Service Status:</span>
              <strong className="text-emerald-400">ONLINE (v2.4)</strong>
            </div>
            <div className="text-slate-400 flex items-center justify-between gap-4">
              <span>Last Sync:</span>
              <strong className="text-slate-200">{lastSyncTime}</strong>
            </div>
          </div>

          <button
            onClick={handleForceSync}
            disabled={isSyncing}
            className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-blue-600/30 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Catalog...' : 'Force Module Sync'}</span>
          </button>
        </div>
      </div>

      {/* SERVICE NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Architecture & Health</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'products'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Master Products CRUD ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('skus')}
          className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'skus'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Barcode className="w-4 h-4" />
          <span>SKU & Barcode Inspector</span>
        </button>

        <button
          onClick={() => setActiveTab('attributes')}
          className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'attributes'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Catalog Attributes ({attributes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('api-tester')}
          className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'api-tester'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Interactive REST API Tester</span>
        </button>
      </div>

      {/* TAB 1: SERVICE ARCHITECTURE & SINGLE SOURCE OF TRUTH HEALTH */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Module Integration Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* POS Terminal */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                  <Monitor className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Sync
                </span>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">POS Register Engine</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Barcode scanner lookup, quick-keys grid, pricing overrides, and cash shift receipts.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Sync Latency:</span>
                <strong className="text-blue-600 dark:text-blue-400">1.2 ms</strong>
              </div>
            </div>

            {/* E-commerce Storefront */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Store className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Sync
                </span>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">E-Commerce Storefront</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Public shop catalog, search indexing, variant selectors, and online checkout cart.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Sync Latency:</span>
                <strong className="text-emerald-600 dark:text-emerald-400">2.4 ms</strong>
              </div>
            </div>

            {/* Multi-Branch Inventory */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Boxes className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Sync
                </span>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Multi-Branch Inventory</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Warehouse stock matrix, serial/batch tracking, inter-branch transfers, and replenishment POs.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Sync Latency:</span>
                <strong className="text-indigo-600 dark:text-indigo-400">0.8 ms</strong>
              </div>
            </div>
          </div>

          {/* Master Endpoints Architecture Documentation */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-500" />
              <span>Centralized Product Service API Endpoints Specification</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-[10px]">GET</span>
                  <span>/api/products</span>
                </div>
                <p className="text-slate-500">Fetch catalog products with category, brand, search, channel filters.</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-[10px]">POST</span>
                  <span>/api/products</span>
                </div>
                <p className="text-slate-500">Create new master product with initial variants, SKUs & pricing tiers.</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-amber-600 dark:text-amber-400">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-[10px]">PUT</span>
                  <span>/api/products/:id</span>
                </div>
                <p className="text-slate-500">Update master product details, channel flags, and variant rules.</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-rose-600 dark:text-rose-400">
                  <span className="px-2 py-0.5 rounded bg-rose-500/10 text-[10px]">DELETE</span>
                  <span>/api/products/:id</span>
                </div>
                <p className="text-slate-500">Remove product permanently from single source of truth master store.</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-[10px]">GET</span>
                  <span>/api/skus/lookup/:sku</span>
                </div>
                <p className="text-slate-500">Fast barcode scanner lookup for POS, inventory, & customer search.</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-purple-600 dark:text-purple-400">
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-[10px]">GET / POST / PUT</span>
                  <span>/api/attributes</span>
                </div>
                <p className="text-slate-500">Manage catalog attributes (Color, Size, Material, Weight, Storage).</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MASTER PRODUCTS CRUD WORKBENCH */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Controls & Add Product Button */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row gap-3 justify-between items-center">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products, SKUs, barcodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200"
              >
                <option value="All">All Channels</option>
                <option value="pos">POS Only</option>
                <option value="ecommerce">E-Commerce Only</option>
                <option value="wholesale">Wholesale</option>
              </select>

              <button
                onClick={() => {
                  setEditingProduct({
                    name: '',
                    brand: brands[0]?.name || 'Generic',
                    category: categories[0]?.name || 'Electronics',
                    description: '',
                    unit: 'pcs',
                    status: 'active',
                    channels: { pos: true, ecommerce: true, wholesale: false },
                    taxRate: 10,
                  });
                  setIsProductModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-500/20 ml-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Create Master Product</span>
              </button>
            </div>
          </div>

          {/* Master Products Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/60 uppercase font-black text-[10px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Product Info</th>
                    <th className="px-4 py-3">Category / Brand</th>
                    <th className="px-4 py-3">Variant SKUs</th>
                    <th className="px-4 py-3">Channels</th>
                    <th className="px-4 py-3">Retail Price</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">API Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filteredProducts.map((p) => {
                    const primaryVar = p.variants?.[0];
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.images?.[0]}
                              alt={p.name}
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                            />
                            <div>
                              <span className="font-extrabold text-slate-900 dark:text-white block text-xs">{p.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">ID: {p.id}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">{p.category}</span>
                          <span className="text-[11px] text-slate-500">{p.brand}</span>
                        </td>

                        <td className="px-4 py-3.5 font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">
                            {p.variants?.length || 1} Variant(s)
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{primaryVar?.sku}</span>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            {p.channels?.pos && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">POS</span>
                            )}
                            {p.channels?.ecommerce && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Online</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 font-black text-slate-900 dark:text-white">
                          {formatCurrency(primaryVar?.retailPrice || 0)}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black capitalize ${
                            p.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}>
                            {p.status}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setIsProductModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                              title="Edit Product"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 cursor-pointer"
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
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
        </div>
      )}

      {/* TAB 3: SKU & BARCODE SCANNER INSPECTOR */}
      {activeTab === 'skus' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Barcode className="w-5 h-5 text-blue-500" />
                <span>Live Barcode & SKU Lookup Testbed (/api/skus/lookup/:sku)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Simulates real-time handheld barcode scanner queries used at POS checkout counters and warehouse receiving docks.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="Enter SKU (e.g. AUD-AERO-BLK) or Barcode..."
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => handleSkuLookup()}
                disabled={isSearchingSku}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20"
              >
                <Search className="w-4 h-4" />
                <span>{isSearchingSku ? 'Searching...' : 'Scan SKU'}</span>
              </button>
            </div>

            {/* Pre-set SKU Quick Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <span className="text-slate-400 text-[11px]">Quick Tests:</span>
              {['AUD-AERO-BLK', 'KIT-BAR-SIL', 'FOOD-MATCH-30G', 'SKU-HOM-001'].map((sku) => (
                <button
                  key={sku}
                  onClick={() => {
                    setLookupInput(sku);
                    handleSkuLookup(sku);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700"
                >
                  {sku}
                </button>
              ))}
            </div>
          </div>

          {/* Lookup Result Display */}
          {lookupResult && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              {lookupResult.found && lookupResult.variant ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                          {lookupResult.product?.name} ({lookupResult.variant.name})
                        </h4>
                        <span className="text-xs font-mono text-slate-500">SKU: {lookupResult.variant.sku} | Barcode: {lookupResult.variant.barcode}</span>
                      </div>
                    </div>

                    <span className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Total In-Stock: {lookupResult.totalStock} units
                    </span>
                  </div>

                  {/* Pricing Tiers & Location Stock */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                      <strong className="text-slate-700 dark:text-slate-300 block uppercase tracking-wider text-[10px]">Master Price Tiers</strong>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>Retail Price: <strong className="text-slate-900 dark:text-white font-black">{formatCurrency(lookupResult.variant.retailPrice)}</strong></div>
                        <div>Cost Price: <strong className="text-slate-500">{formatCurrency(lookupResult.variant.costPrice)}</strong></div>
                        <div>Wholesale Price: <strong className="text-slate-700 dark:text-slate-300">{formatCurrency(lookupResult.variant.wholesalePrice)}</strong></div>
                        <div>Member Price: <strong className="text-blue-600 dark:text-blue-400 font-bold">{formatCurrency(lookupResult.variant.memberPrice)}</strong></div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                      <strong className="text-slate-700 dark:text-slate-300 block uppercase tracking-wider text-[10px]">Stock Distribution Across Locations</strong>
                      <div className="space-y-1 font-mono text-[11px] pt-1">
                        {Object.entries(lookupResult.stockByLocation || {}).map(([loc, count]) => (
                          <div key={loc} className="flex justify-between">
                            <span className="text-slate-500">{loc}:</span>
                            <strong className="text-slate-900 dark:text-white">{count} pcs</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 font-bold">
                  {lookupResult.error || 'No matching variant SKU found in Product Service.'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CATALOG ATTRIBUTES MANAGER */}
      {activeTab === 'attributes' && (
        <div className="space-y-6">
          {/* Add Attribute Box */}
          <form onSubmit={handleAddAttribute} className="bg-white dark:bg-slate-900 p-5 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 space-y-1 w-full">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Attribute Name</label>
              <input
                type="text"
                placeholder="e.g. Finish / Flavor / Screen Size"
                value={newAttrName}
                onChange={(e) => setNewAttrName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex-1 space-y-1 w-full">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Options (Comma Separated)</label>
              <input
                type="text"
                placeholder="Option 1, Option 2, Option 3..."
                value={newAttrOptions}
                onChange={(e) => setNewAttrOptions(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-500/20 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Attribute</span>
            </button>
          </form>

          {/* Attribute Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {attributes.map((attr) => (
              <div key={attr.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-900 dark:text-white text-sm">{attr.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {attr.code}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {attr.options.map((opt, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-900">
                      {opt}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: INTERACTIVE REST API TESTER */}
      {activeTab === 'api-tester' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-500" />
              <span>Interactive REST API Explorer & Payload Inspector</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Directly execute API calls against the live Product Service endpoints and review JSON responses.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={apiMethod}
              onChange={(e) => setApiMethod(e.target.value as any)}
              className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs rounded-xl text-slate-900 dark:text-white"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
            />

            <button
              onClick={handleRunApiTest}
              disabled={isApiLoading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20"
            >
              <Send className="w-4 h-4" />
              <span>{isApiLoading ? 'Sending...' : 'Send Request'}</span>
            </button>
          </div>

          {(apiMethod === 'POST' || apiMethod === 'PUT') && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">JSON Request Payload</label>
              <textarea
                rows={5}
                value={apiBody}
                onChange={(e) => setApiBody(e.target.value)}
                className="w-full p-3 bg-slate-950 font-mono text-xs text-emerald-400 rounded-xl border border-slate-800 focus:outline-none"
              />
            </div>
          )}

          {/* Response Payload Box */}
          {apiResponse && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">JSON Response Payload:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(apiResponse);
                    setCopiedResponse(true);
                    setTimeout(() => setCopiedResponse(false), 1500);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  {copiedResponse ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedResponse ? 'Copied' : 'Copy Response'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto max-h-96 border border-slate-800">
                {apiResponse}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 my-8">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {editingProduct?.id ? 'Edit Master Product' : 'Create New Master Product'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Product Name</label>
                  <input
                    type="text"
                    required
                    value={editingProduct?.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Brand</label>
                  <select
                    value={editingProduct?.brand || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    value={editingProduct?.category || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Unit of Measure</label>
                  <input
                    type="text"
                    value={editingProduct?.unit || 'pcs'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Product Description</label>
                <textarea
                  rows={3}
                  value={editingProduct?.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div className="flex items-center space-x-4 pt-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">Enabled Channels:</span>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={editingProduct?.channels?.pos ?? true}
                    onChange={(e) => setEditingProduct({
                      ...editingProduct,
                      channels: { ...editingProduct?.channels, pos: e.target.checked, ecommerce: editingProduct?.channels?.ecommerce ?? true, wholesale: editingProduct?.channels?.wholesale ?? false }
                    })}
                  />
                  POS Register
                </label>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={editingProduct?.channels?.ecommerce ?? true}
                    onChange={(e) => setEditingProduct({
                      ...editingProduct,
                      channels: { ...editingProduct?.channels, ecommerce: e.target.checked, pos: editingProduct?.channels?.pos ?? true, wholesale: editingProduct?.channels?.wholesale ?? false }
                    })}
                  />
                  E-Commerce Storefront
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsProductModalOpen(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  Save Master Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
