import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  Plus,
  Trash2,
  Sparkles,
  Barcode as BarcodeIcon,
  Package,
  Layers,
  DollarSign,
  Boxes,
  Cpu,
  PackagePlus,
  Image as ImageIcon,
  Sliders,
  ShieldCheck,
  Hourglass,
  Store,
  Monitor,
  Building2,
  Info,
} from 'lucide-react';
import {
  Product,
  ProductVariant,
  ProductType,
  ProductStatus,
  BundleItem,
  CompositeBomItem,
  ProductSpecification,
  BranchLocationId,
} from '../../types';
import { useCommerce } from '../../context/CommerceContext';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
}) => {
  const {
    products,
    categories,
    brands,
    unitsOfMeasurement,
    locations,
    addProduct,
    updateProduct,
    generateSku,
    generateBarcode,
    formatCurrency,
  } = useCommerce();

  const [activeTab, setActiveTab] = useState<'basic' | 'variants' | 'bundle' | 'bom' | 'media' | 'specs'>('basic');

  // Basic Information
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [brand, setBrand] = useState(brands[0]?.name || 'Generic');
  const [category, setCategory] = useState(categories[0]?.name || 'Electronics');
  const [subcategory, setSubcategory] = useState(categories[0]?.subcategories[0] || 'Audio');
  const [unit, setUnit] = useState('pcs');
  const [status, setStatus] = useState<ProductStatus>('active');
  const [productType, setProductType] = useState<ProductType>('standard');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [featured, setFeatured] = useState(false);
  const [taxRate, setTaxRate] = useState(10);

  // Omnichannel Flags
  const [channelPos, setChannelPos] = useState(true);
  const [channelEcommerce, setChannelEcommerce] = useState(true);
  const [channelWholesale, setChannelWholesale] = useState(true);

  // Tracking Flags
  const [isTrackSerial, setIsTrackSerial] = useState(false);
  const [isTrackBatch, setIsTrackBatch] = useState(false);

  // Variants State
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Bundle Items State
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);

  // BOM Items State
  const [bomItems, setBomItems] = useState<CompositeBomItem[]>([]);
  const [assemblyLaborCost, setAssemblyLaborCost] = useState<number>(0);

  // Media
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');

  // Specifications
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [newSpecGroup, setNewSpecGroup] = useState('General');
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');

  // Initial Load / Reset
  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name);
      setSlug(productToEdit.slug);
      setBrand(productToEdit.brand);
      setCategory(productToEdit.category);
      setSubcategory(productToEdit.subcategory || '');
      setUnit(productToEdit.unit || 'pcs');
      setStatus(productToEdit.status);
      setProductType(productToEdit.productType || (productToEdit.isBundle ? 'bundle' : productToEdit.isComposite ? 'composite' : 'standard'));
      setShortDescription(productToEdit.shortDescription || '');
      setDescription(productToEdit.description || '');
      setTagsInput(productToEdit.tags?.join(', ') || '');
      setFeatured(productToEdit.featured || false);
      setTaxRate(productToEdit.taxRate ?? 10);
      setChannelPos(productToEdit.channels?.pos ?? true);
      setChannelEcommerce(productToEdit.channels?.ecommerce ?? true);
      setChannelWholesale(productToEdit.channels?.wholesale ?? true);
      setIsTrackSerial(productToEdit.isTrackSerial ?? false);
      setIsTrackBatch(productToEdit.isTrackBatch ?? false);
      setVariants(JSON.parse(JSON.stringify(productToEdit.variants)));
      setBundleItems(productToEdit.bundleItems ? JSON.parse(JSON.stringify(productToEdit.bundleItems)) : []);
      setBomItems(productToEdit.bomItems ? JSON.parse(JSON.stringify(productToEdit.bomItems)) : []);
      setAssemblyLaborCost(productToEdit.assemblyLaborCost || 0);
      setImageUrls(productToEdit.images || []);
      setSpecifications(productToEdit.specifications ? JSON.parse(JSON.stringify(productToEdit.specifications)) : []);
    } else {
      // Default Initial state
      setName('');
      setSlug('');
      const defaultBrand = brands[0]?.name || 'AcousticTech';
      const defaultCat = categories[0]?.name || 'Electronics';
      setBrand(defaultBrand);
      setCategory(defaultCat);
      setSubcategory(categories[0]?.subcategories[0] || 'Audio');
      setUnit('pcs');
      setStatus('active');
      setProductType('standard');
      setShortDescription('');
      setDescription('');
      setTagsInput('New, Featured');
      setFeatured(false);
      setTaxRate(10);
      setChannelPos(true);
      setChannelEcommerce(true);
      setChannelWholesale(true);
      setIsTrackSerial(false);
      setIsTrackBatch(false);
      
      // Default Initial Variant
      const initialSku = generateSku(defaultBrand, defaultCat, 'Item Standard');
      const initialBarcode = generateBarcode('890');
      const defaultLocStock: { [k in BranchLocationId]?: number } = {};
      locations.forEach((loc) => {
        defaultLocStock[loc.id] = loc.id.includes('wh') ? 30 : 10;
      });

      setVariants([
        {
          id: `var-${Date.now()}-1`,
          sku: initialSku,
          barcode: initialBarcode,
          name: 'Standard Edition',
          attributes: { Edition: 'Standard' },
          costPrice: 45.0,
          retailPrice: 99.0,
          wholesalePrice: 70.0,
          memberPrice: 89.0,
          minSellingPrice: 65.0,
          weightKg: 0.5,
          lowStockThreshold: 5,
          stockByLocation: defaultLocStock,
        },
      ]);
      setBundleItems([]);
      setBomItems([]);
      setAssemblyLaborCost(0);
      setImageUrls(['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80']);
      setSpecifications([
        { group: 'Warranty', name: 'Standard Warranty', value: '2 Years Manufacturer' },
      ]);
    }
  }, [productToEdit, isOpen]);

  // Update subcategories when category changes
  useEffect(() => {
    const matched = categories.find((c) => c.name.toLowerCase() === category.toLowerCase());
    if (matched && matched.subcategories.length > 0 && !matched.subcategories.includes(subcategory)) {
      setSubcategory(matched.subcategories[0]);
    }
  }, [category, categories]);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!productToEdit) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  // Add Variant Row
  const handleAddVariant = () => {
    const varNum = variants.length + 1;
    const vName = `Variant ${varNum}`;
    const autoSku = generateSku(brand, category, name || 'Item', { Opt: `${varNum}` });
    const autoBarcode = generateBarcode('890');
    const defaultLocStock: { [k in BranchLocationId]?: number } = {};
    locations.forEach((loc) => {
      defaultLocStock[loc.id] = 10;
    });

    const newVar: ProductVariant = {
      id: `var-${Date.now()}-${varNum}`,
      sku: autoSku,
      barcode: autoBarcode,
      name: vName,
      attributes: { Color: 'Black', Size: 'M' },
      costPrice: variants[0]?.costPrice || 45.0,
      retailPrice: variants[0]?.retailPrice || 99.0,
      wholesalePrice: variants[0]?.wholesalePrice || 70.0,
      memberPrice: variants[0]?.memberPrice || 89.0,
      minSellingPrice: variants[0]?.minSellingPrice || 65.0,
      weightKg: variants[0]?.weightKg || 0.5,
      lowStockThreshold: 5,
      stockByLocation: defaultLocStock,
    };
    setVariants([...variants, newVar]);
  };

  const handleRemoveVariant = (index: number) => {
    if (variants.length <= 1) {
      alert('A product must have at least one SKU variant.');
      return;
    }
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleUpdateVariant = (index: number, field: keyof ProductVariant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const handleUpdateVariantStock = (varIndex: number, locId: BranchLocationId, val: number) => {
    const updated = [...variants];
    const locMap = { ...updated[varIndex].stockByLocation, [locId]: Math.max(0, val) };
    updated[varIndex].stockByLocation = locMap;
    setVariants(updated);
  };

  // Add Bundle Component
  const handleAddBundleItem = (productId: string, variantId: string) => {
    const prod = products.find((p) => p.id === productId);
    const variant = prod?.variants.find((v) => v.id === variantId);
    if (!prod || !variant) return;

    const existingIndex = bundleItems.findIndex((b) => b.productId === productId && b.variantId === variantId);
    if (existingIndex >= 0) {
      const updated = [...bundleItems];
      updated[existingIndex].quantity += 1;
      setBundleItems(updated);
    } else {
      setBundleItems([
        ...bundleItems,
        {
          productId: prod.id,
          variantId: variant.id,
          productName: prod.name,
          variantName: variant.name,
          sku: variant.sku,
          quantity: 1,
          unitPrice: variant.retailPrice,
        },
      ]);
    }
  };

  // Add BOM Component
  const handleAddBomItem = (productId: string, variantId: string) => {
    const prod = products.find((p) => p.id === productId);
    const variant = prod?.variants.find((v) => v.id === variantId);
    if (!prod || !variant) return;

    setBomItems([
      ...bomItems,
      {
        productId: prod.id,
        variantId: variant.id,
        productName: prod.name,
        variantName: variant.name,
        sku: variant.sku,
        quantityRequired: 1,
        unitCost: variant.costPrice,
        scrapPercentage: 0,
      },
    ]);
  };

  // Specifications
  const handleAddSpec = () => {
    if (!newSpecName.trim() || !newSpecValue.trim()) return;
    setSpecifications([
      ...specifications,
      {
        group: newSpecGroup.trim() || 'General',
        name: newSpecName.trim(),
        value: newSpecValue.trim(),
      },
    ]);
    setNewSpecName('');
    setNewSpecValue('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Product name is required');
      return;
    }
    if (variants.length === 0) {
      alert('At least one variant SKU is required');
      return;
    }

    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    const isBundle = productType === 'bundle';
    const isComposite = productType === 'composite';

    const productPayload: Product = {
      id: productToEdit ? productToEdit.id : `prod-${Date.now().toString(36)}`,
      name: name.trim(),
      slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      brand,
      category,
      subcategory,
      unit,
      status,
      productType,
      channels: {
        pos: channelPos,
        ecommerce: channelEcommerce,
        wholesale: channelWholesale,
      },
      isBundle,
      bundleItems: isBundle ? bundleItems : undefined,
      isComposite,
      bomItems: isComposite ? bomItems : undefined,
      assemblyLaborCost: isComposite ? Number(assemblyLaborCost) : undefined,
      isTrackSerial,
      isTrackBatch,
      taxRate: Number(taxRate),
      rating: productToEdit?.rating || 5.0,
      reviewCount: productToEdit?.reviewCount || 0,
      salesCount: productToEdit?.salesCount || 0,
      featured,
      shortDescription,
      description,
      tags,
      images: imageUrls.length > 0 ? imageUrls : ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'],
      specifications,
      variants,
      createdAt: productToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (productToEdit) {
      updateProduct(productPayload);
    } else {
      addProduct(productPayload);
    }

    onClose();
  };

  // Calculations for Bundles & BOM
  const totalBundleRetail = bundleItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const totalBomMaterialCost = bomItems.reduce((acc, item) => acc + item.unitCost * item.quantityRequired, 0);
  const totalCompositeCost = totalBomMaterialCost + Number(assemblyLaborCost || 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden text-slate-900 flex flex-col my-4 max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {productToEdit ? `Edit Product: ${productToEdit.name}` : 'Create Master Catalog Product'}
              </h2>
              <p className="text-xs text-slate-500">
                Single unified record synced simultaneously to POS Cashier, Web Storefront, and B2B
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-6 border-b border-slate-200 bg-slate-50/50 overflow-x-auto">
          {[
            { id: 'basic', label: '1. Basic Info & Channels', icon: Info },
            { id: 'variants', label: `2. SKUs & Pricing (${variants.length})`, icon: DollarSign },
            { id: 'bundle', label: '3. Bundle Kits', icon: PackagePlus, show: productType === 'bundle' },
            { id: 'bom', label: '3. Bill of Materials (BOM)', icon: Cpu, show: productType === 'composite' },
            { id: 'media', label: `4. Images & Media (${imageUrls.length})`, icon: ImageIcon },
            { id: 'specs', label: `5. Specifications (${specifications.length})`, icon: Sliders },
          ]
            .filter((t) => t.show !== false)
            .map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-semibold text-xs whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 bg-blue-50/50 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
        </div>

        {/* Form Body with Scroll */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: BASIC INFO & CHANNELS */}
          {activeTab === 'basic' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Omnichannel Distribution Banner */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Store className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Omnichannel Touchpoint Enablement
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Synced Central Database</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={channelPos}
                      onChange={(e) => setChannelPos(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 text-blue-600" /> POS Cashier
                      </span>
                      <span className="text-[10px] text-slate-500 block">Available on physical registers</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={channelEcommerce}
                      onChange={(e) => setChannelEcommerce(e.target.checked)}
                      className="w-4 h-4 rounded accent-emerald-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-emerald-600" /> Web Storefront
                      </span>
                      <span className="text-[10px] text-slate-500 block">Online customer portal</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={channelWholesale}
                      onChange={(e) => setChannelWholesale(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-amber-600" /> B2B Wholesale
                      </span>
                      <span className="text-[10px] text-slate-500 block">Bulk commercial accounts</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Product Type & Tracking Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Product Archetype / Type
                  </label>
                  <select
                    value={productType}
                    onChange={(e) => setProductType(e.target.value as ProductType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="standard">Standard Physical Good</option>
                    <option value="variant">Variant Matrix (Sizes / Colors / Specs)</option>
                    <option value="bundle">Curated Value Bundle / Gift Kit</option>
                    <option value="composite">Composite Assembled (Bill of Materials BOM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Lifecycle Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProductStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="active">Active (Available for Sale)</option>
                    <option value="inactive">Inactive (Draft / Hidden)</option>
                    <option value="discontinued">Discontinued (Archived)</option>
                  </select>
                </div>
              </div>

              {/* Tracking Capabilities */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTrackSerial}
                    onChange={(e) => setIsTrackSerial(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Track Unique Serial Numbers (S/N)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Prompt cashier to scan individual serial number during checkout
                    </span>
                  </div>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTrackBatch}
                    onChange={(e) => setIsTrackBatch(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Hourglass className="w-3.5 h-3.5 text-amber-600" /> Track Batch / Lot Numbers & Expiration
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Enforce First-Expired-First-Out (FEFO) and batch traceability
                    </span>
                  </div>
                </label>
              </div>

              {/* Title & Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AeroSound Pro Wireless ANC Headphones"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">URL Slug</label>
                  <input
                    type="text"
                    required
                    placeholder="aerosound-pro-anc"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Brand, Category, Subcategory, UOM */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand *</label>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subcategory</label>
                  <select
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {categories
                      .find((c) => c.name.toLowerCase() === category.toLowerCase())
                      ?.subcategories.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      )) || <option value="">None</option>}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit of Measure</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {unitsOfMeasurement.map((u) => (
                      <option key={u.id} value={u.code}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Short & Long Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Short Description (POS / Card)</label>
                <input
                  type="text"
                  placeholder="One sentence summary for fast cashier identification..."
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Description</label>
                <textarea
                  rows={3}
                  placeholder="Detailed product features, materials, and warranty information..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              {/* Tags & Tax Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="Wireless, Bluetooth, Premium, Audio"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VARIANTS & MULTI-LOCATION PRICING MATRIX */}
          {activeTab === 'variants' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">SKU Variants & Pricing Matrix</h3>
                  <p className="text-xs text-slate-500">
                    Define sizes, colors, wholesale tiers, minimum prices, and branch stock levels
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add SKU Variant</span>
                </button>
              </div>

              {/* Variants Accordion Cards */}
              <div className="space-y-4">
                {variants.map((v, idx) => {
                  const grossMargin =
                    v.retailPrice > 0 ? (((v.retailPrice - v.costPrice) / v.retailPrice) * 100).toFixed(1) : '0';

                  return (
                    <div
                      key={v.id || idx}
                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 relative shadow-xs"
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 text-xs font-black flex items-center justify-center border border-blue-100">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={v.name}
                            onChange={(e) => handleUpdateVariant(idx, 'name', e.target.value)}
                            placeholder="Variant Name (e.g. Midnight Black / M)"
                            className="bg-transparent font-bold text-slate-900 text-sm focus:outline-none focus:border-b-2 border-blue-600"
                          />
                        </div>

                        <div className="flex items-center space-x-3">
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Margin: {grossMargin}%
                          </span>

                          {variants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Variant"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* SKU & Barcode Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold uppercase text-slate-600">SKU Code *</label>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateVariant(
                                  idx,
                                  'sku',
                                  generateSku(brand, category, name, { Var: `${idx + 1}` })
                                )
                              }
                              className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold"
                            >
                              <Sparkles className="w-3 h-3" /> Auto-Gen SKU
                            </button>
                          </div>
                          <input
                            type="text"
                            required
                            value={v.sku}
                            onChange={(e) => handleUpdateVariant(idx, 'sku', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold uppercase text-slate-600">Barcode / EAN-13</label>
                            <button
                              type="button"
                              onClick={() => handleUpdateVariant(idx, 'barcode', generateBarcode('890'))}
                              className="text-[10px] text-sky-600 hover:text-sky-700 flex items-center gap-1 font-semibold"
                            >
                              <BarcodeIcon className="w-3 h-3" /> Auto Barcode
                            </button>
                          </div>
                          <input
                            type="text"
                            value={v.barcode}
                            onChange={(e) => handleUpdateVariant(idx, 'barcode', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                          />
                        </div>
                      </div>

                      {/* Pricing Tier Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                            Cost Price ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.costPrice}
                            onChange={(e) => handleUpdateVariant(idx, 'costPrice', Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-blue-600 block mb-1">
                            Retail / Selling ($) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={v.retailPrice}
                            onChange={(e) => handleUpdateVariant(idx, 'retailPrice', Number(e.target.value))}
                            className="w-full bg-white border border-blue-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                            Wholesale ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.wholesalePrice ?? ''}
                            onChange={(e) => handleUpdateVariant(idx, 'wholesalePrice', Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                            VIP / Member ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.memberPrice ?? ''}
                            onChange={(e) => handleUpdateVariant(idx, 'memberPrice', Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-rose-600 block mb-1">
                            Min Price ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.minSellingPrice}
                            onChange={(e) => handleUpdateVariant(idx, 'minSellingPrice', Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-rose-500"
                          />
                        </div>
                      </div>

                      {/* Multi-Location Stock Allocation */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold uppercase text-slate-600 flex items-center gap-1">
                            <Boxes className="w-3.5 h-3.5 text-blue-600" /> Multi-Branch Stock Allocation
                          </label>
                          <span className="text-[10px] text-slate-500">
                            Low Stock Alert Threshold:{' '}
                            <input
                              type="number"
                              min="0"
                              value={v.lowStockThreshold}
                              onChange={(e) => handleUpdateVariant(idx, 'lowStockThreshold', Number(e.target.value))}
                              className="w-12 bg-slate-50 border border-slate-200 rounded px-1 text-center text-slate-900"
                            />
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {locations.map((loc) => {
                            const curStock = v.stockByLocation?.[loc.id] ?? 0;
                            return (
                              <div
                                key={loc.id}
                                className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between"
                              >
                                <div className="truncate mr-2">
                                  <p className="text-[11px] font-bold text-slate-900 truncate">{loc.name}</p>
                                  <p className="text-[9px] text-slate-500 uppercase">{loc.type}</p>
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  value={curStock}
                                  onChange={(e) =>
                                    handleUpdateVariantStock(idx, loc.id as BranchLocationId, Number(e.target.value))
                                  }
                                  className="w-16 bg-white border border-slate-200 rounded-md py-1 px-2 text-right text-xs font-bold text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: BUNDLES & KITS */}
          {activeTab === 'bundle' && productType === 'bundle' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Bundle Component Items</h3>
                  <p className="text-xs text-slate-500">
                    Combine multiple inventory items into a discounted packaged kit
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Sum of Individual Prices</p>
                  <p className="text-base font-black text-amber-600">{formatCurrency(totalBundleRetail)}</p>
                </div>
              </div>

              {/* Add item to bundle selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Catalog Product to Add
                  </label>
                  <select
                    id="bundle-product-picker"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  >
                    {products
                      .filter((p) => p.id !== productToEdit?.id && !p.isBundle)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.brand})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      const picker = document.getElementById('bundle-product-picker') as HTMLSelectElement;
                      if (picker && picker.value) {
                        const targetProd = products.find((p) => p.id === picker.value);
                        if (targetProd && targetProd.variants[0]) {
                          handleAddBundleItem(targetProd.id, targetProd.variants[0].id);
                        }
                      }
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Include Component in Bundle</span>
                  </button>
                </div>
              </div>

              {/* Bundle items list */}
              <div className="space-y-2">
                {bundleItems.map((item, idx) => (
                  <div
                    key={`${item.productId}-${item.variantId}-${idx}`}
                    className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{item.productName}</h4>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {item.variantName} • SKU: {item.sku} • {formatCurrency(item.unitPrice)}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs text-slate-500 font-semibold">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const updated = [...bundleItems];
                            updated[idx].quantity = Math.max(1, Number(e.target.value));
                            setBundleItems(updated);
                          }}
                          className="w-14 bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-center text-xs font-bold text-slate-900"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setBundleItems(bundleItems.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BILL OF MATERIALS (BOM) */}
          {activeTab === 'bom' && productType === 'composite' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Bill of Materials (BOM) & Assembly</h3>
                  <p className="text-xs text-slate-500">
                    Raw component requirements and labor costs for manufactured items
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Total Finished Unit Cost</p>
                  <p className="text-base font-black text-rose-600">{formatCurrency(totalCompositeCost)}</p>
                </div>
              </div>

              {/* Labor & Assembly Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assembly Labor Cost ($ per finished unit)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={assemblyLaborCost}
                    onChange={(e) => setAssemblyLaborCost(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Raw Material Cost Subtotal
                  </label>
                  <p className="text-base font-bold font-mono text-slate-900 py-1.5">
                    {formatCurrency(totalBomMaterialCost)}
                  </p>
                </div>
              </div>

              {/* Add raw component */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Raw Material / Sub-Component
                  </label>
                  <select
                    id="bom-product-picker"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  >
                    {products
                      .filter((p) => p.id !== productToEdit?.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.brand})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      const picker = document.getElementById('bom-product-picker') as HTMLSelectElement;
                      if (picker && picker.value) {
                        const targetProd = products.find((p) => p.id === picker.value);
                        if (targetProd && targetProd.variants[0]) {
                          handleAddBomItem(targetProd.id, targetProd.variants[0].id);
                        }
                      }
                    }}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add BOM Component</span>
                  </button>
                </div>
              </div>

              {/* BOM Items List */}
              <div className="space-y-2">
                {bomItems.map((item, idx) => (
                  <div
                    key={`${item.productId}-${item.variantId}-${idx}`}
                    className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{item.productName}</h4>
                      <p className="text-[11px] text-slate-500 font-mono">
                        SKU: {item.sku} • Cost: {formatCurrency(item.unitCost)} / unit
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs text-slate-500 font-semibold">Qty Req:</span>
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          value={item.quantityRequired}
                          onChange={(e) => {
                            const updated = [...bomItems];
                            updated[idx].quantityRequired = Number(e.target.value);
                            setBomItems(updated);
                          }}
                          className="w-16 bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-center text-xs font-bold text-slate-900"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setBomItems(bomItems.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: MEDIA & IMAGES */}
          {activeTab === 'media' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Product Gallery & Media</h3>
                  <p className="text-xs text-slate-500">
                    High-resolution imagery displayed in POS quick catalog and online storefront
                  </p>
                </div>
              </div>

              {/* Add Image URL Input */}
              <div className="flex items-center space-x-2">
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newImageUrl.trim()) {
                      setImageUrls([...imageUrls, newImageUrl.trim()]);
                      setNewImageUrl('');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Image</span>
                </button>
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {imageUrls.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative group bg-slate-100 rounded-xl overflow-hidden border border-slate-200 aspect-square"
                  >
                    <img
                      src={url}
                      alt={`Product image ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {idx === 0 && (
                      <span className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-md shadow-xs">
                        Primary Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setImageUrls(imageUrls.filter((_, i) => i !== idx))}
                      className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SPECIFICATIONS */}
          {activeTab === 'specs' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Technical Specifications & Attributes</h3>
                <p className="text-xs text-slate-500">
                  Custom key-value specifications displayed on spec sheets and customer receipts
                </p>
              </div>

              {/* Add spec input */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <input
                    type="text"
                    placeholder="Group (e.g. Dimensions)"
                    value={newSpecGroup}
                    onChange={(e) => setNewSpecGroup(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Spec Name (e.g. Weight)"
                    value={newSpecName}
                    onChange={(e) => setNewSpecName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Value (e.g. 240 grams)"
                    value={newSpecValue}
                    onChange={(e) => setNewSpecValue(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddSpec}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Spec</span>
                  </button>
                </div>
              </div>

              {/* Specs Table */}
              <div className="space-y-2">
                {specifications.map((spec, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-xs"
                  >
                    <div className="grid grid-cols-3 flex-1 text-xs">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">{spec.group}</span>
                      <span className="text-slate-900 font-semibold">{spec.name}</span>
                      <span className="text-slate-600 font-mono">{spec.value}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSpecifications(specifications.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-3"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 flex items-center space-x-2 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>{productToEdit ? 'Save Changes' : 'Create Master Product'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
