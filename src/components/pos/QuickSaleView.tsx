import React, { useState } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import { Product, PaymentRecord, Order, CartItem } from '../../types';
import { BarcodeQrScannerModal } from './BarcodeQrScannerModal';
import {
  Zap,
  Search,
  Barcode,
  Camera,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  DollarSign,
  User,
  ShoppingBag,
  RotateCcw,
  Sparkles,
  Receipt,
  X,
  Tag,
  ArrowRight,
  Calculator,
  Tablet,
  LayoutGrid,
} from 'lucide-react';

interface QuickSaleViewProps {
  onSwitchToStandard: () => void;
  onOpenReceipt: (order: Order) => void;
  onOpenShift: () => void;
  onOpenCashMovement: () => void;
}

export const QuickSaleView: React.FC<QuickSaleViewProps> = ({
  onSwitchToStandard,
  onOpenReceipt,
  onOpenShift,
  onOpenCashMovement,
}) => {
  const {
    products,
    posCart,
    addToPosCart,
    updatePosCartItemQty,
    removeFromPosCart,
    clearPosCart,
    selectedPosCustomer,
    setSelectedPosCustomer,
    customers,
    orders,
    processPosCheckout,
    posShift,
    currentLocation,
    formatCurrency,
  } = useCommerce();

  // Mobile / Tablet Tab Switcher state ('catalog' | 'keypad' | 'cart')
  const [mobileTab, setMobileTab] = useState<'catalog' | 'keypad' | 'cart'>('catalog');

  // Unified Search & Barcode state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scanToast, setScanToast] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<boolean>(false);

  // Custom Amount Numpad State
  const [customAmountStr, setCustomAmountStr] = useState('');
  const [customItemNote, setCustomItemNote] = useState('Miscellaneous Quick Item');

  // Express Checkout & Change Display State
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [lastChangeDue, setLastChangeDue] = useState<number | null>(null);
  const [lastTendered, setLastTendered] = useState<number | null>(null);
  const [isProcessingExpress, setIsProcessingExpress] = useState(false);

  // Customer Selector Popover state
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Categories derived from products
  const categories = ['All', 'Favorites', ...Array.from(new Set(products.map((p) => p.category)))];

  // Cart Totals
  const subtotal = posCart.reduce((acc, item) => acc + item.price * item.quantity * (1 - (item.discountPercentage || 0) / 100), 0);
  const tax = subtotal * 0.10; // 10% standard tax
  const total = subtotal + tax;
  const totalItemCount = posCart.reduce((acc, item) => acc + item.quantity, 0);

  // Filtered Products
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.variants.some(
        (v) =>
          v.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (v.barcode && v.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
      );

    if (selectedCategory === 'All') return matchesSearch;
    if (selectedCategory === 'Favorites') return matchesSearch && (product.rating && product.rating >= 4.5);
    return matchesSearch && product.category === selectedCategory;
  });

  const triggerScanToast = (msg: string, isSuccess = true) => {
    setScanToast(msg);
    if (isSuccess) {
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 700);
    }
    setTimeout(() => {
      setScanToast(null);
    }, 3000);
  };

  // Handle Barcode & QR Code scan (from input submit or scanner modal)
  const handleBarcodeOrQrScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // 1. Check Product match
    let matchedProduct: Product | undefined;
    let matchedVariant: any;

    for (const prod of products) {
      for (const v of prod.variants) {
        if (
          v.sku.toUpperCase() === trimmed.toUpperCase() ||
          (v.barcode && v.barcode.toUpperCase() === trimmed.toUpperCase()) ||
          prod.id === trimmed
        ) {
          matchedProduct = prod;
          matchedVariant = v;
          break;
        }
      }
      if (matchedProduct) break;
    }

    if (matchedProduct && matchedVariant) {
      addToPosCart(matchedProduct, matchedVariant);
      triggerScanToast(`Added item: ${matchedProduct.name} (${matchedVariant.name})`);
      setSearchTerm('');
      return;
    }

    // 2. Check Customer match
    const matchedCustomer = customers.find(
      (c) => c.id.toUpperCase() === trimmed.toUpperCase() || c.email.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchedCustomer) {
      setSelectedPosCustomer(matchedCustomer);
      triggerScanToast(`Attached customer: ${matchedCustomer.name}`);
      setSearchTerm('');
      return;
    }

    // 3. Check Order match
    const matchedOrder = orders.find(
      (o) => o.id.toUpperCase() === trimmed.toUpperCase() || o.orderNumber.toUpperCase() === trimmed.toUpperCase()
    );
    if (matchedOrder) {
      onOpenReceipt(matchedOrder);
      triggerScanToast(`Opened Order #${matchedOrder.orderNumber}`);
      setSearchTerm('');
      return;
    }

    triggerScanToast(`No match found for barcode/QR: "${trimmed}"`, false);
  };

  // Submit on the single unified search bar
  const handleUnifiedSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    handleBarcodeOrQrScan(searchTerm);
  };

  // Add Custom Item to Cart
  const handleAddCustomAmount = () => {
    const amount = parseFloat(customAmountStr);
    if (!amount || amount <= 0) return;

    const customProduct: Product = {
      id: `custom-${Date.now()}`,
      name: customItemNote || 'Custom Sale Item',
      slug: `custom-${Date.now()}`,
      brand: 'Generic',
      category: 'Miscellaneous',
      subcategory: 'General',
      description: 'Quick custom amount item',
      shortDescription: 'Custom sale',
      unit: 'pcs',
      taxRate: 10,
      rating: 5,
      reviewCount: 1,
      tags: ['quick_sale'],
      variants: [
        {
          id: `var-custom-${Date.now()}`,
          name: 'Standard',
          sku: `CUSTOM-${Math.floor(Math.random() * 8999 + 1000)}`,
          barcode: `SKU-CUSTOM-${Date.now()}`,
          costPrice: amount * 0.5,
          retailPrice: amount,
          wholesalePrice: amount,
          memberPrice: amount,
          minSellingPrice: amount,
          stockByLocation: {},
          lowStockThreshold: 10,
          attributes: {},
        },
      ],
      images: ['https://images.unsplash.com/photo-1556742049-0a670f4a4591?w=300&auto=format&fit=crop&q=80'],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addToPosCart(customProduct, customProduct.variants[0]);
    setCustomAmountStr('');
    setCustomItemNote('Miscellaneous Quick Item');
  };

  // Numpad button click handler
  const handleNumpadKey = (key: string) => {
    if (key === 'C') {
      setCustomAmountStr('');
    } else if (key === 'DEL') {
      setCustomAmountStr((prev) => prev.slice(0, -1));
    } else if (key === '.') {
      if (!customAmountStr.includes('.')) {
        setCustomAmountStr((prev) => (prev === '' ? '0.' : prev + '.'));
      }
    } else {
      setCustomAmountStr((prev) => prev + key);
    }
  };

  // Express One-Tap Checkout Execution
  const handleExpressCheckout = (method: 'Cash' | 'Credit Card' | 'Mobile Money', cashTenderedAmount?: number) => {
    if (posCart.length === 0) return;

    setIsProcessingExpress(true);

    const tender = cashTenderedAmount ?? total;
    const change = method === 'Cash' && tender > total ? tender - total : 0;

    const paymentRecords: PaymentRecord[] = [
      {
        method,
        amount: total,
        reference: method === 'Cash' ? `CASH-EXPRESS-${Date.now().toString().slice(-4)}` : `TAP-AUTH-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
      },
    ];

    setTimeout(() => {
      const order = processPosCheckout(paymentRecords);
      setCompletedOrder(order);
      setLastTendered(tender);
      setLastChangeDue(change);
      setIsProcessingExpress(false);
    }, 250);
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg">
      {/* 1. TOP QUICK SALE ACTION HEADER */}
      <div className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 sm:py-3 shrink-0 flex items-center justify-between border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black shrink-0">
            <Tablet className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-xs sm:text-base font-black tracking-tight text-white flex items-center gap-1.5 truncate">
                <span>TABLET QUICK SALE</span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest">
                  Mobile Register
                </span>
              </h2>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">
              {currentLocation.name} • {posShift.cashierName}
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCashMovement}
            className="hidden sm:flex px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cash In/Out</span>
          </button>

          <button
            type="button"
            onClick={onOpenShift}
            className="hidden sm:flex px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Shift</span>
          </button>

          <button
            type="button"
            onClick={onSwitchToStandard}
            className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Standard Terminal</span>
            <span className="xs:hidden">Standard</span>
          </button>
        </div>
      </div>

      {/* 2. MOBILE / TABLET TAB SEGMENTED CONTROL (Visible on screens < lg) */}
      <div className="lg:hidden bg-slate-900 px-2.5 py-2 border-b border-slate-800 flex items-center justify-between gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Tiles</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('keypad')}
          className={`flex-1 py-2 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
            mobileTab === 'keypad'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Keypad</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
            mobileTab === 'cart'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Cart ({totalItemCount})</span>
        </button>
      </div>

      {/* 3. MAIN CONTENT BODY */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-2 sm:p-3 gap-2.5 sm:gap-3">
        
        {/* LEFT / MAIN COLUMN (Product Tiles & Custom Keypad) */}
        <div
          className={`flex-1 flex-col min-w-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden ${
            mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* UNIFIED SINGLE SEARCH & BARCODE SCANNER INPUT */}
          <div className={`p-2 sm:p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0 relative ${mobileTab === 'cart' ? 'hidden lg:block' : 'block'}`}>
            {scanFlash && (
              <div className="absolute inset-0 bg-emerald-500/15 backdrop-blur-2xs rounded-t-2xl z-0 animate-pulse pointer-events-none" />
            )}
            <form onSubmit={handleUnifiedSearchSubmit} className="relative flex items-center z-10">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${scanFlash ? 'text-emerald-500 font-bold' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search catalog or scan barcode / SKU..."
                className={`w-full border rounded-xl py-2 sm:py-2.5 pl-9 pr-24 text-xs font-bold focus:outline-none shadow-xs transition-all duration-200 ${
                  scanFlash
                    ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500 text-emerald-900 dark:text-emerald-100 ring-4 ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-[1.01]'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-amber-500'
                }`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-20 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowScannerModal(true)}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
                  scanFlash
                    ? 'bg-emerald-500 text-slate-950 scale-105 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
                title="Open Camera Barcode & QR Scanner"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Scan</span>
              </button>
            </form>

            {/* Scan Toast Banner */}
            {scanToast && (
              <div
                className={`p-2 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 transition-all duration-200 shadow-sm ${
                  scanFlash
                    ? 'bg-emerald-500 text-slate-950 border-2 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-102 animate-bounce'
                    : 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${scanFlash ? 'text-slate-950 animate-ping' : 'text-amber-500'}`} />
                <span>{scanToast}</span>
              </div>
            )}
          </div>

          {/* CATEGORIES PILLS (Shown on Catalog mode) */}
          <div className={`px-2.5 py-1.5 sm:py-2 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-1.5 overflow-x-auto shrink-0 scrollbar-none ${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'}`}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat === 'Favorites' ? '★ Favorites' : cat}
              </button>
            ))}
          </div>

          {/* CONTENT AREA: TILES & NUMPAD */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3">
            {/* CATALOG TILES VIEW */}
            <div className={mobileTab === 'keypad' ? 'hidden lg:block' : 'block'}>
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2.5 auto-rows-max">
                {filteredProducts.map((product) => {
                  const defaultVariant = product.variants[0];
                  if (!defaultVariant) return null;

                  const cartQty = posCart.find((i) => i.variantId === defaultVariant.id)?.quantity || 0;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToPosCart(product, defaultVariant)}
                      className={`relative p-2.5 sm:p-3 rounded-2xl border text-left flex flex-col justify-between min-h-[96px] sm:h-28 transition-all active:scale-95 cursor-pointer select-none shadow-2xs ${
                        cartQty > 0
                          ? 'bg-amber-500/10 border-amber-500/50 dark:bg-amber-950/30 text-slate-900 dark:text-white ring-2 ring-amber-500/40'
                          : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/80 hover:border-slate-400 text-slate-900 dark:text-white'
                      }`}
                    >
                      {cartQty > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 font-black text-[10px] sm:text-[11px] w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shadow-md animate-in zoom-in">
                          {cartQty}
                        </span>
                      )}

                      <div>
                        <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block truncate">
                          {product.category}
                        </span>
                        <h4 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight mt-0.5">
                          {product.name}
                        </h4>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                        <span className="font-mono font-black text-xs text-amber-600 dark:text-amber-400">
                          {formatCurrency(defaultVariant.retailPrice)}
                        </span>
                        <span className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                          +
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CUSTOM AMOUNT KEYPAD (Visible on Keypad Tab for mobile or as side box on desktop) */}
            <div className={mobileTab === 'catalog' ? 'hidden lg:block lg:mt-3' : 'block'}>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex flex-col justify-between max-w-md mx-auto">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-amber-500" />
                      <span>Custom Amount Keypad</span>
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Unlisted Item</span>
                  </div>

                  {/* Display Field */}
                  <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl p-2.5 mb-2.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Line Note</span>
                    <input
                      type="text"
                      value={customItemNote}
                      onChange={(e) => setCustomItemNote(e.target.value)}
                      className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none mb-1 border-b border-slate-200 dark:border-slate-800 pb-1"
                    />
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-bold">Amount</span>
                      <span className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                        ${customAmountStr || '0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Preset Quick Buttons */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                    {['1.00', '5.00', '10.00', '20.00'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCustomAmountStr(val)}
                        className="py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl font-bold text-xs cursor-pointer"
                      >
                        ${val}
                      </button>
                    ))}
                  </div>

                  {/* 3x4 Touch Numpad Grid */}
                  <div className="grid grid-cols-3 gap-1.5 font-mono">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'].map((btn) => (
                      <button
                        key={btn}
                        type="button"
                        onClick={() => handleNumpadKey(btn)}
                        className="py-3 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-extrabold text-sm rounded-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all shadow-2xs cursor-pointer"
                      >
                        {btn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add Custom Item Button */}
                <button
                  type="button"
                  onClick={handleAddCustomAmount}
                  disabled={!parseFloat(customAmountStr)}
                  className="w-full mt-3 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-md disabled:opacity-40 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom Item (${customAmountStr || '0.00'})</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: EXPRESS CHECKOUT & CART PANEL */}
        <div
          className={`w-full lg:w-80 xl:w-96 flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden shrink-0 ${
            mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Customer Bar */}
          <div className="p-2.5 sm:p-3 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2 min-w-0">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer</span>
                <span className="text-xs font-black text-slate-900 dark:text-white truncate block">
                  {selectedPosCustomer ? selectedPosCustomer.name : 'Walk-in Retail Guest'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCustomerSearch(!showCustomerSearch)}
              className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              {selectedPosCustomer ? 'Change' : 'Attach'}
            </button>
          </div>

          {/* Quick Customer Search Dropdown */}
          {showCustomerSearch && (
            <div className="p-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 space-y-1.5 max-h-40 overflow-y-auto animate-in slide-in-from-top-2">
              <button
                onClick={() => { setSelectedPosCustomer(null); setShowCustomerSearch(false); }}
                className="w-full text-left p-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                ● Walk-in Retail Guest (Default)
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedPosCustomer(c); setShowCustomerSearch(false); }}
                  className="w-full text-left p-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200 hover:bg-amber-500/10 hover:text-amber-600 rounded-lg flex items-center justify-between"
                >
                  <span>{c.name}</span>
                  <span className="text-[10px] text-slate-400">{c.tier}</span>
                </button>
              ))}
            </div>
          )}

          {/* CART ITEMS LIST */}
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2">
            {posCart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                <ShoppingBag className="w-10 h-10 stroke-1 opacity-40 text-slate-400" />
                <p className="text-xs font-bold">Register Cart is Empty</p>
                <p className="text-[11px]">Tap item tiles or use keypad to add sales items.</p>
              </div>
            ) : (
              posCart.map((item) => (
                <div
                  key={item.variantId}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <h5 className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                      {item.productName}
                    </h5>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {item.variantName} • {formatCurrency(item.price)}
                    </p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => updatePosCartItemQty(item.variantId, item.quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold hover:bg-slate-100 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-mono font-black text-xs text-slate-900 dark:text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updatePosCartItemQty(item.variantId, item.quantity + 1)}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => removeFromPosCart(item.variantId)}
                      className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center justify-center cursor-pointer ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CART TOTALS & EXPRESS CHECKOUT BUTTONS */}
          <div className="p-3 sm:p-3.5 bg-slate-900 text-white shrink-0 space-y-2.5 sm:space-y-3">
            {/* Totals Summary */}
            <div className="space-y-1 font-mono text-xs border-b border-slate-800 pb-2">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal ({totalItemCount} items):</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tax (10%):</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-sm sm:text-base font-black text-amber-400 pt-1">
                <span className="font-sans uppercase tracking-tight">TOTAL DUE:</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* ONE-TAP EXPRESS CASH TENDER KEYS */}
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block mb-1">
                Fast Cash Tender Options
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  disabled={posCart.length === 0 || isProcessingExpress}
                  onClick={() => handleExpressCheckout('Cash', total)}
                  className="py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 rounded-xl text-[11px] sm:text-xs font-black transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  Exact Cash
                </button>

                {[20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    disabled={posCart.length === 0 || isProcessingExpress || total > amt}
                    onClick={() => handleExpressCheckout('Cash', amt)}
                    className="py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-[11px] sm:text-xs font-black transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
                  >
                    ${amt} Cash
                  </button>
                ))}
              </div>
            </div>

            {/* BIG ACTION CHECKOUT BUTTONS */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={posCart.length === 0 || isProcessingExpress}
                onClick={() => handleExpressCheckout('Credit Card')}
                className="py-2.5 sm:py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl sm:rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>Card / Tap</span>
              </button>

              <button
                type="button"
                disabled={posCart.length === 0 || isProcessingExpress}
                onClick={() => handleExpressCheckout('Cash', total)}
                className="py-2.5 sm:py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <Banknote className="w-4 h-4" />
                <span>Express Cash</span>
              </button>
            </div>

            {/* Clear Cart */}
            {posCart.length > 0 && (
              <button
                onClick={clearPosCart}
                className="w-full text-center text-[10px] text-slate-400 hover:text-rose-400 font-bold uppercase tracking-wider cursor-pointer"
              >
                Clear Cart
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. MOBILE FLOATING EXPRESS CHECKOUT BOTTOM BAR (When on Tiles or Keypad tab with items) */}
      {mobileTab !== 'cart' && posCart.length > 0 && (
        <div className="lg:hidden bg-slate-900 border-t border-slate-800 p-2.5 flex items-center justify-between gap-2 shadow-2xl shrink-0 animate-in slide-in-from-bottom-2">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Total</span>
            <span className="text-sm font-black text-amber-400 font-mono">
              {totalItemCount} items • {formatCurrency(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
          >
            <span>Express Pay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5. COMPLETED ORDER & CHANGE DUE EXPRESS MODAL OVERLAY */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in zoom-in-95">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl text-center space-y-4 sm:space-y-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg animate-bounce">
              <CheckCircle2 className="w-8 h-8 sm:w-9 sm:h-9" />
            </div>

            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                EXPRESS TRANSACTION SUCCESSFUL
              </span>
              <h3 className="text-lg sm:text-xl font-black text-white mt-1">Receipt #{completedOrder.orderNumber}</h3>
              <p className="text-xs text-slate-400 mt-1">Order processed in Quick Sale Register Mode.</p>
            </div>

            {/* Change Due Highlight Box */}
            <div className="p-3.5 sm:p-4 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-2 font-mono">
              <div className="flex justify-between text-slate-400 text-xs">
                <span>Total Charge:</span>
                <span>{formatCurrency(completedOrder.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs">
                <span>Tender Amount:</span>
                <span>{formatCurrency(lastTendered || completedOrder.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-base sm:text-lg font-black text-emerald-400 pt-2 border-t border-slate-700">
                <span>CHANGE DUE:</span>
                <span>{formatCurrency(lastChangeDue || 0)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenReceipt(completedOrder)}
                className="py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
              >
                <Receipt className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletedOrder(null);
                  setLastChangeDue(null);
                  setLastTendered(null);
                }}
                className="py-2.5 sm:py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Next Customer</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 6. BARCODE & QR CODE SCANNER MODAL */}
      <BarcodeQrScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanResult={handleBarcodeOrQrScan}
      />
    </div>
  );
};
