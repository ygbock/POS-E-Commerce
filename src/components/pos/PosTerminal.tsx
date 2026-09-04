import React, { useState } from 'react';
import {
  Search,
  Barcode,
  Camera,
  Plus,
  Minus,
  Trash2,
  Pause,
  Play,
  User,
  UserPlus,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Receipt,
  RotateCcw,
  Tag,
  CheckCircle2,
  X,
  Calculator,
  Store,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  ShieldCheck,
  ShoppingBag,
  Filter,
  Lock,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Product, PaymentMethod, PaymentRecord, Order, Customer, CartItem } from '../../types';
import { ReceiptModal } from './ReceiptModal';
import { ShiftModal } from './ShiftModal';
import { PriceOverrideModal } from './PriceOverrideModal';
import { CashMovementModal } from './CashMovementModal';
import { QuickSaleView } from './QuickSaleView';
import { BarcodeQrScannerModal } from './BarcodeQrScannerModal';

export const PosTerminal: React.FC = () => {
  const {
    products,
    posCart,
    addToPosCart,
    updatePosCartItemQty,
    updatePosCartItemDiscount,
    updatePosCartItemPriceAndDiscount,
    removeFromPosCart,
    clearPosCart,
    selectedPosCustomer,
    setSelectedPosCustomer,
    customers,
    addCustomer,
    heldCarts,
    holdCurrentPosCart,
    resumeHeldPosCart,
    removeHeldPosCart,
    processPosCheckout,
    processPosReturn,
    posShift,
    currentLocation,
    currentLocationId,
    formatCurrency,
    getLocationStockForVariant,
    orders,
  } = useCommerce();

  // Mobile/Tablet Tab Switcher state ('catalog' vs 'cart')
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');
  const [posMode, setPosMode] = useState<'standard' | 'quick_sale'>('standard');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);

  // Scan Toast feedback state
  const [scanToast, setScanToast] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<boolean>(false);

  // Modals & UI States
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCashMovementModal, setShowCashMovementModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [selectedOverrideItem, setSelectedOverrideItem] = useState<CartItem | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [appliedPromoCode, setAppliedPromoCode] = useState('');

  // Quick Add Customer Form State
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    tier: 'Bronze' as 'Bronze' | 'Silver' | 'Gold' | 'VIP',
    customerGroup: 'Retail' as 'Retail' | 'Wholesale' | 'Corporate' | 'VIP Member',
  });

  // Payment Form States inside Checkout Modal
  const [primaryPaymentMethod, setPrimaryPaymentMethod] = useState<PaymentMethod>('Cash');
  const [tenderCashAmount, setTenderCashAmount] = useState<string>('');
  const [isSplitPayment, setIsSplitPayment] = useState<boolean>(false);
  const [splitCash, setSplitCash] = useState<string>('0');
  const [splitCard, setSplitCard] = useState<string>('0');
  const [splitMobile, setSplitMobile] = useState<string>('0');

  // Return Form State
  const [returnOrderNumber, setReturnOrderNumber] = useState('');
  const [foundReturnOrder, setFoundReturnOrder] = useState<Order | null>(null);
  const [returnItemsState, setReturnItemsState] = useState<{ [variantId: string]: { qty: number; restock: boolean; reason: string } }>({});

  const categories = ['All', 'Electronics', 'Home & Kitchen', 'Food & Beverage', 'Apparel'];

  // Calculations
  let cartSubtotal = 0;
  let cartTax = 0;
  let cartTotalItemCount = 0;

  posCart.forEach((item) => {
    const lineTotal = item.price * item.quantity * (1 - (item.discountPercentage || 0) / 100);
    cartSubtotal += lineTotal;
    cartTax += lineTotal * (item.taxRate / 100);
    cartTotalItemCount += item.quantity;
  });

  const cartTotal = cartSubtotal + cartTax;

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.variants.some((v) => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.barcode.includes(searchTerm));
    return matchesCategory && matchesSearch && p.status === 'active';
  });

  const triggerScanToast = (msg: string, isSuccess = true) => {
    setScanToast(msg);
    if (isSuccess) {
      setScanFlash(true);
      setTimeout(() => {
        setScanFlash(false);
      }, 700);
    }
    setTimeout(() => {
      setScanToast(null);
    }, 3000);
  };

  // Fast Barcode & QR Code Lookup (Supports products, customers, and orders)
  const handleBarcodeOrQrScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // 1. Product Barcode / SKU match
    for (const prod of products) {
      for (const variant of prod.variants) {
        if (
          (variant.barcode && variant.barcode.toUpperCase() === trimmed.toUpperCase()) ||
          variant.sku.toUpperCase() === trimmed.toUpperCase() ||
          prod.id.toUpperCase() === trimmed.toUpperCase()
        ) {
          addToPosCart(prod, variant);
          triggerScanToast(`Added item: ${prod.name} (${variant.name})`);
          setBarcodeInput('');
          setSearchTerm('');
          return;
        }
      }
    }

    // 2. Customer ID / Loyalty QR match
    const matchedCustomer = customers.find(
      (c) => c.id.toUpperCase() === trimmed.toUpperCase() || c.email.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchedCustomer) {
      setSelectedPosCustomer(matchedCustomer);
      triggerScanToast(`Attached customer: ${matchedCustomer.name}`);
      setBarcodeInput('');
      setSearchTerm('');
      return;
    }

    // 3. Order Receipt QR match
    const matchedOrder = orders.find(
      (o) => o.id.toUpperCase() === trimmed.toUpperCase() || o.orderNumber.toUpperCase() === trimmed.toUpperCase()
    );
    if (matchedOrder) {
      setCompletedOrder(matchedOrder);
      triggerScanToast(`Opened Order #${matchedOrder.orderNumber}`);
      setBarcodeInput('');
      setSearchTerm('');
      return;
    }

    triggerScanToast(`No product, customer, or order match for: ${trimmed}`, false);
    setBarcodeInput('');
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchTerm.trim() || barcodeInput.trim();
    if (!query) return;
    handleBarcodeOrQrScan(query);
  };

  // Quick Add Customer Handler
  const handleCreateQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim()) return;

    const newCust: Customer = {
      id: `CUST-${Date.now().toString().slice(-4)}`,
      name: newCustomerForm.name.trim(),
      email: newCustomerForm.email.trim() || `${newCustomerForm.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: newCustomerForm.phone.trim() || '+1 (555) 000-0000',
      tier: newCustomerForm.tier,
      loyaltyPoints: 0,
      storeCreditBalance: 0,
      creditLimit: 1000,
      totalSpent: 0,
      ordersCount: 0,
      addresses: [],
      customerGroup: newCustomerForm.customerGroup,
      registeredAt: new Date().toISOString(),
    };

    addCustomer(newCust);
    setSelectedPosCustomer(newCust);
    triggerScanToast(`Customer "${newCust.name}" added & attached!`);
    setShowAddCustomerModal(false);
    setNewCustomerForm({
      name: '',
      phone: '',
      email: '',
      tier: 'Bronze',
      customerGroup: 'Retail',
    });
  };

  // Quick product click handler
  const handleProductCardClick = (product: Product) => {
    if (product.variants.length === 1) {
      addToPosCart(product, product.variants[0]);
      triggerScanToast(`Added: ${product.name}`);
    } else {
      setSelectedProductForVariant(product);
    }
  };

  // Open Checkout Modal
  const openCheckout = () => {
    if (posCart.length === 0) return;
    setTenderCashAmount(cartTotal.toFixed(2));
    setSplitCash((cartTotal / 2).toFixed(2));
    setSplitCard((cartTotal / 2).toFixed(2));
    setShowCheckoutModal(true);
  };

  // Quick Tender Cash Preset buttons ($5, $10, $20, $50, $100, Exact)
  const setExactTenderCash = () => {
    setTenderCashAmount(cartTotal.toFixed(2));
  };

  const setTenderPreset = (val: number) => {
    setTenderCashAmount(val.toFixed(2));
  };

  // Execute Checkout
  const handleExecuteCheckout = () => {
    const payments: PaymentRecord[] = [];
    const now = new Date().toISOString();

    if (!isSplitPayment) {
      payments.push({
        method: primaryPaymentMethod,
        amount: cartTotal,
        reference: primaryPaymentMethod === 'Credit Card' ? 'POS-CHIP-EMV' : primaryPaymentMethod === 'Mobile Money' ? 'M-PESA-TX' : undefined,
        timestamp: now,
      });
    } else {
      const c = parseFloat(splitCash) || 0;
      const cd = parseFloat(splitCard) || 0;
      const m = parseFloat(splitMobile) || 0;
      if (c > 0) payments.push({ method: 'Cash', amount: c, timestamp: now });
      if (cd > 0) payments.push({ method: 'Credit Card', amount: cd, reference: 'SPLIT-CARD', timestamp: now });
      if (m > 0) payments.push({ method: 'Mobile Money', amount: m, reference: 'SPLIT-MOMO', timestamp: now });
    }

    const order = processPosCheckout(payments, appliedPromoCode);
    setShowCheckoutModal(false);
    setAppliedPromoCode('');
    setCompletedOrder(order);
  };

  // Handle Search Return Order
  const handleSearchReturnOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const ord = orders.find((o) => o.orderNumber.toUpperCase() === returnOrderNumber.trim().toUpperCase());
    if (ord) {
      setFoundReturnOrder(ord);
      const init: { [variantId: string]: { qty: number; restock: boolean; reason: string } } = {};
      ord.items.forEach((item) => {
        init[item.variantId] = { qty: 0, restock: true, reason: 'Customer Changed Mind' };
      });
      setReturnItemsState(init);
    } else {
      alert('Order not found. Please verify the order number on the receipt.');
    }
  };

  const handleConfirmReturn = () => {
    if (!foundReturnOrder) return;
    const itemsToReturn = (Object.entries(returnItemsState) as [string, { qty: number; restock: boolean; reason: string }][])
      .filter(([_, data]) => data.qty > 0)
      .map(([variantId, data]) => ({
        variantId,
        quantity: data.qty,
        reason: data.reason,
        restock: data.restock,
      }));

    if (itemsToReturn.length === 0) {
      alert('Please select at least 1 item and quantity to return.');
      return;
    }

    let refundVal = 0;
    itemsToReturn.forEach((r) => {
      const origItem = foundReturnOrder.items.find((i) => i.variantId === r.variantId);
      if (origItem) {
        refundVal += origItem.price * r.quantity * (1 + origItem.taxRate / 100);
      }
    });

    processPosReturn(foundReturnOrder.id, itemsToReturn, refundVal);
    setShowReturnModal(false);
    setFoundReturnOrder(null);
    setReturnOrderNumber('');
  };

  if (posMode === 'quick_sale') {
    return (
      <div className="h-[calc(100vh-100px)] min-h-[500px]">
        <QuickSaleView
          onSwitchToStandard={() => setPosMode('standard')}
          onOpenReceipt={(order) => setCompletedOrder(order)}
          onOpenShift={() => setShowShiftModal(true)}
          onOpenCashMovement={() => setShowCashMovementModal(true)}
        />
        <ReceiptModal order={completedOrder} onClose={() => setCompletedOrder(null)} />
        <ShiftModal isOpen={showShiftModal} onClose={() => setShowShiftModal(false)} />
        <CashMovementModal isOpen={showCashMovementModal} onClose={() => setShowCashMovementModal(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] min-h-[640px] space-y-3 lg:space-y-4 pb-2">
      
      {/* 1. TOP RESPONSIVE HEADER & REGISTER CONTROLS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Branch & Register Status Info */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight">
                POS Register #01
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                posShift.status === 'Open'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
              }`}>
                ● {posShift.status} Shift
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Location: <strong className="text-slate-800 dark:text-slate-200">{currentLocation.name}</strong> • Cashier: <strong className="text-slate-800 dark:text-slate-200">{posShift.cashierName}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls - Quick Sale Mode restricted to Mobile and Tablet viewports (< 1280px / xl:hidden) */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setPosMode('quick_sale')}
            className="xl:hidden px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer min-h-[38px]"
            title="Tablet & Mobile Quick Sale Mode for fast line-busting"
          >
            <Zap className="w-3.5 h-3.5 fill-slate-950" />
            <span className="hidden sm:inline">Tablet Quick Sale</span>
            <span className="sm:hidden">Quick Sale</span>
          </button>
          {heldCarts.length > 0 && (
            <button
              onClick={() => setShowHeldModal(true)}
              className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Held Carts ({heldCarts.length})</span>
            </button>
          )}

          <button
            onClick={() => {
              const targetOrder = completedOrder || orders.find(o => o.source === 'POS') || orders[0] || {
                id: 'ORD-DEMO-99',
                orderNumber: 'POS-88421',
                source: 'POS',
                channel: 'Main Retail Register #01',
                locationId: currentLocationId,
                locationName: currentLocation.name,
                customerName: 'Astra Vance',
                customerEmail: 'astra.vance@example.com',
                customerTier: 'VIP',
                fulfillmentMethod: 'POS Walk-in',
                items: [
                  {
                    productId: 'p1',
                    variantId: 'v1',
                    productName: 'Aero-Mesh Ergonomic Desk Chair',
                    variantName: 'Obsidian Black',
                    sku: 'CHAIR-AERO-BLK',
                    price: 249.99,
                    costPrice: 120,
                    quantity: 1,
                    taxRate: 10,
                    unit: 'pcs'
                  },
                  {
                    productId: 'p2',
                    variantId: 'v2',
                    productName: 'Precision Mechanical Keyboard',
                    variantName: 'Tactile Switches',
                    sku: 'KEY-MECH-TAC',
                    price: 89.50,
                    costPrice: 40,
                    quantity: 2,
                    discountPercentage: 10,
                    taxRate: 10,
                    unit: 'pcs'
                  }
                ],
                subtotal: 411.09,
                discountAmount: 17.90,
                taxAmount: 39.32,
                shippingFee: 0,
                totalAmount: 432.51,
                totalCostAmount: 200,
                payments: [
                  { method: 'Credit Card', amount: 432.51, reference: 'AUTH-892104', timestamp: new Date().toISOString() }
                ],
                paymentStatus: 'Paid',
                status: 'Completed',
                cashierName: posShift.cashierName || 'Terminal 01',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                loyaltyPointsEarned: 43,
                loyaltyPointsRedeemed: 0
              };
              setCompletedOrder(targetOrder as Order);
            }}
            className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
            title="Design & test thermal receipt templates and QR code printing"
          >
            <Receipt className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Receipt Studio & QR</span>
            <span className="sm:hidden">Receipts</span>
          </button>

          <button
            onClick={() => setShowCashMovementModal(true)}
            className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
            title="Record Cash In or Cash Out movements from the register drawer"
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Cash In / Out</span>
            <span className="sm:hidden">Cash Mov</span>
          </button>

          <button
            onClick={() => setShowReturnModal(true)}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden xs:inline">Process Return</span>
          </button>

          <button
            onClick={() => setShowShiftModal(true)}
            className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
          >
            <Calculator className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Shift & Reconciliation</span>
            <span className="sm:hidden">Reconcile</span>
          </button>
        </div>
      </div>

      {/* 2. MOBILE & TABLET VIEW TOGGLE TABS (Visible only below lg breakpoint) */}
      <div className="flex lg:hidden bg-slate-200/70 dark:bg-slate-800 p-1 rounded-2xl border border-slate-300/60 dark:border-slate-700 shrink-0">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            mobileTab === 'catalog'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Product Catalog & Scanner</span>
        </button>

        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 relative ${
            mobileTab === 'cart'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Register Cart</span>
          {cartTotalItemCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-black">
              {cartTotalItemCount} • {formatCurrency(cartTotal)}
            </span>
          )}
        </button>
      </div>

      {/* 3. DUAL-PANEL REGISTER WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* LEFT PANEL: BARCODE SCANNER & PRODUCT CATALOG */}
        <div
          className={`flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs overflow-hidden ${
            mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Unified Single Search Bar & Camera Scanner */}
          <div className="relative pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
            {/* Visual Flash Glow Aura Effect on Recognized Scan */}
            {scanFlash && (
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 rounded-2xl opacity-90 blur-sm animate-pulse z-0 pointer-events-none" />
            )}
            <form onSubmit={handleBarcodeSubmit} className="relative flex items-center z-10">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${scanFlash ? 'text-emerald-500 font-bold' : 'text-sky-500'}`} />
              <input
                id="input-pos-unified-search"
                type="text"
                placeholder="Search catalog or scan barcode / SKU / order #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full border rounded-xl py-2 sm:py-2.5 pl-9 pr-28 text-xs font-bold placeholder:text-slate-400 focus:outline-none shadow-xs transition-all duration-200 ${
                  scanFlash
                    ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500 text-emerald-900 dark:text-emerald-100 ring-4 ring-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.45)] scale-[1.01]'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-850'
                }`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-24 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowScannerModal(true)}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                  scanFlash
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.6)] scale-105'
                    : 'bg-sky-600 hover:bg-sky-500'
                }`}
                title="Open Camera Barcode & QR Scanner"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan</span>
              </button>
            </form>
          </div>

          {/* Barcode Feedback Toast Banner */}
          {scanToast && (
            <div
              className={`my-2 p-2 rounded-xl text-xs font-black text-center flex items-center justify-center gap-2 transition-all duration-200 shrink-0 shadow-sm ${
                scanFlash
                  ? 'bg-emerald-500 text-slate-950 border-2 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-102 animate-bounce'
                  : 'bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400'
              }`}
            >
              <CheckCircle2 className={`w-4 h-4 ${scanFlash ? 'text-slate-950' : 'text-sky-500'}`} />
              <span>{scanToast}</span>
            </div>
          )}

          {/* Category Chips Bar */}
          <div className="flex items-center space-x-2 py-2.5 overflow-x-auto custom-scrollbar shrink-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-750'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="flex-1 overflow-y-auto pr-1 pt-1 grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-3.5 custom-scrollbar">
            {filteredProducts.map((product) => {
              const hasMultipleVariants = product.variants.length > 1;
              const primaryVariant = product.variants[0];
              const localStock = getLocationStockForVariant(primaryVariant, currentLocationId);
              const priceToDisplay =
                selectedPosCustomer?.tier === 'VIP'
                  ? primaryVariant.memberPrice || primaryVariant.retailPrice
                  : primaryVariant.retailPrice;

              return (
                <div
                  key={product.id}
                  onClick={() => handleProductCardClick(product)}
                  className="bg-white dark:bg-slate-850 hover:bg-slate-50/80 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-750 rounded-2xl p-3 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md hover:border-sky-500/40 group text-left"
                >
                  <div>
                    <div className="aspect-square sm:aspect-video w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 mb-2 relative border border-slate-100 dark:border-slate-800">
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-1.5 right-1.5">
                        <span
                          className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-xs border ${
                            localStock > 5
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : localStock > 0
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {localStock} in store
                        </span>
                      </div>
                    </div>

                    <p className="text-[9px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider truncate">
                      {product.brand}
                    </p>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {product.name}
                    </h4>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">
                        {formatCurrency(priceToDisplay)}
                      </span>
                      {hasMultipleVariants && (
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-semibold">
                          {product.variants.length} options
                        </span>
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:bg-sky-600 group-hover:text-white flex items-center justify-center transition-all">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL: REGISTER CART & CHECKOUT TENDER */}
        <div
          className={`w-full lg:w-96 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between overflow-hidden ${
            mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="flex-1 flex flex-col min-h-0">
            {/* Cart Header & Customer Selector */}
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">Active Register Cart</h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{cartTotalItemCount} item(s) selected</p>
                  </div>
                </div>

                {posCart.length > 0 && (
                  <button
                    onClick={() => {
                      const note = prompt('Enter a note for held cart (optional):') || undefined;
                      holdCurrentPosCart(note);
                    }}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Pause className="w-3 h-3" />
                    <span>Hold</span>
                  </button>
                )}
              </div>

              {/* Customer Attachment Select */}
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  aria-label="Attach Customer"
                  value={selectedPosCustomer?.id || ''}
                  onChange={(e) => {
                    const cust = customers.find((c) => c.id === e.target.value) || null;
                    setSelectedPosCustomer(cust);
                  }}
                  className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white rounded-xl py-1.5 px-2 focus:outline-none focus:border-sky-500 font-medium truncate"
                >
                  <option value="">Walk-in Retail Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.tier} • {c.loyaltyPoints} pts)
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  id="btn-pos-quick-add-customer"
                  onClick={() => setShowAddCustomerModal(true)}
                  className="px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                  title="Quick Add New Customer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">+ New</span>
                </button>

                {selectedPosCustomer && (
                  <button
                    onClick={() => setSelectedPosCustomer(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer shrink-0"
                    title="Remove attached customer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {selectedPosCustomer && (
                <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-[11px] text-sky-700 dark:text-sky-300 flex justify-between font-bold">
                  <span>Tier: <strong>{selectedPosCustomer.tier}</strong></span>
                  <span>Points: <strong>{selectedPosCustomer.loyaltyPoints}</strong></span>
                  <span>Credit: <strong>{formatCurrency(selectedPosCustomer.storeCreditBalance)}</strong></span>
                </div>
              )}
            </div>

            {/* Cart Items Scrollable List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 py-2 custom-scrollbar">
              {posCart.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                  <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 stroke-1" />
                  <p className="font-bold text-slate-600 dark:text-slate-400">Register cart is empty</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Scan product barcodes or click items from the catalog</p>
                </div>
              ) : (
                posCart.map((item) => {
                  const lineTotal = item.price * item.quantity * (1 - (item.discountPercentage || 0) / 100);
                  return (
                    <div key={item.variantId} className="py-2.5 flex items-start justify-between text-xs gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{item.productName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {item.variantName} • {formatCurrency(item.price)}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedOverrideItem(item)}
                            className="text-[10px] bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 font-bold cursor-pointer transition-colors"
                            title="Edit Unit Price or Line Discount"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            <span>
                              {item.discountPercentage
                                ? `Disc: ${item.discountPercentage}%`
                                : item.price !== (item.originalPrice || item.price)
                                ? `Custom: ${formatCurrency(item.price)}`
                                : 'Price / Disc'}
                            </span>
                          </button>

                          {item.overrideApproved && (
                            <span
                              className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-md font-extrabold flex items-center gap-1"
                              title={`Approved by ${item.overrideApprovedBy}. Reason: ${item.overrideReason || 'Manager Approval'}`}
                            >
                              <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Mgr Approved</span>
                            </span>
                          )}

                          {!item.overrideApproved &&
                            item.minSellingPrice &&
                            item.price * (1 - (item.discountPercentage || 0) / 100) < item.minSellingPrice && (
                              <span className="text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5 text-amber-600" />
                                <span>Below MSP</span>
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Quantity Control Buttons */}
                      <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/80 dark:border-slate-700">
                        <button
                          onClick={() => updatePosCartItemQty(item.variantId, item.quantity - 1)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-black text-slate-900 dark:text-white text-xs">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updatePosCartItemQty(item.variantId, item.quantity + 1)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Price & Delete */}
                      <div className="text-right min-w-[65px]">
                        <p className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(lineTotal)}</p>
                        <button
                          onClick={() => removeFromPosCart(item.variantId)}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors mt-1 cursor-pointer"
                          title="Remove Item"
                        >
                          <Trash2 className="w-3.5 h-3.5 ml-auto" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cart Footer Totals & Checkout Button */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Tax (VAT/Sales):</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(cartTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>Total Due:</span>
                <span className="text-sky-600 dark:text-sky-400 font-mono text-xl font-black">
                  {formatCurrency(cartTotal)}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                id="btn-pos-clear"
                disabled={posCart.length === 0}
                onClick={clearPosCart}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 disabled:opacity-40 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl text-xs font-bold border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer"
              >
                Clear Cart
              </button>
              <button
                id="btn-pos-hold-alt"
                disabled={posCart.length === 0}
                onClick={() => {
                  const note = prompt('Enter note for held cart:') || undefined;
                  holdCurrentPosCart(note);
                }}
                className="py-2.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Hold Sale
              </button>
            </div>

            <button
              id="btn-pos-checkout"
              disabled={posCart.length === 0}
              onClick={openCheckout}
              className="w-full py-3.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-95 disabled:opacity-40 text-white rounded-2xl text-sm font-extrabold shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Banknote className="w-5 h-5" />
              <span>PAY / TENDER {formatCurrency(cartTotal)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: VARIANT SELECTOR */}
      {selectedProductForVariant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-5 text-slate-900 dark:text-white shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">{selectedProductForVariant.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Select product variant to add to cart</p>
              </div>
              <button
                onClick={() => setSelectedProductForVariant(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {selectedProductForVariant.variants.map((v) => {
                const stock = getLocationStockForVariant(v, currentLocationId);
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      addToPosCart(selectedProductForVariant, v);
                      triggerScanToast(`Added: ${selectedProductForVariant.name} (${v.name})`);
                      setSelectedProductForVariant(null);
                    }}
                    className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-left transition-all cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-xs text-slate-900 dark:text-white">{v.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">SKU: {v.sku}</p>
                      <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">{stock} in store stock</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                        {formatCurrency(v.retailPrice)}
                      </span>
                      <div className="mt-1 px-2.5 py-1 bg-sky-600 text-white rounded-lg text-[10px] font-bold">
                        Add +
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CHECKOUT / MULTI-TENDER & QUICK CASH DENOMINATIONS */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg p-6 text-slate-900 dark:text-white shadow-2xl animate-in zoom-in-95 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white tracking-tight">POS Payment Tender</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Payable: <strong className="text-sky-600 dark:text-sky-400 font-black">{formatCurrency(cartTotal)}</strong></p>
              </div>
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher: Single vs Split */}
            <div className="py-4 space-y-4 text-xs">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300">Tender Strategy:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setIsSplitPayment(false)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      !isSplitPayment ? 'bg-sky-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Single Method
                  </button>
                  <button
                    onClick={() => setIsSplitPayment(true)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSplitPayment ? 'bg-sky-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Split Payment
                  </button>
                </div>
              </div>

              {!isSplitPayment ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['Cash', 'Credit Card', 'Mobile Money', 'Fintech Wallet'] as PaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        onClick={() => setPrimaryPaymentMethod(method)}
                        className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          primaryPaymentMethod === method
                            ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400 shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                        }`}
                      >
                        {method === 'Cash' && <Banknote className="w-5 h-5 text-emerald-500" />}
                        {method === 'Credit Card' && <CreditCard className="w-5 h-5 text-sky-500" />}
                        {method === 'Mobile Money' && <Smartphone className="w-5 h-5 text-amber-500" />}
                        {method === 'Fintech Wallet' && <Wallet className="w-5 h-5 text-indigo-500" />}
                        <span className="text-[11px] font-bold">{method}</span>
                      </button>
                    ))}
                  </div>

                  {/* Cash Tender Input & Denominations */}
                  {primaryPaymentMethod === 'Cash' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="flex justify-between items-center">
                        <label className="text-slate-700 dark:text-slate-300 font-bold">Cash Tendered:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={tenderCashAmount}
                          onChange={(e) => setTenderCashAmount(e.target.value)}
                          className="w-36 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-right font-black text-slate-900 dark:text-white text-base"
                        />
                      </div>

                      {/* Quick Cash Presets */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={setExactTenderCash}
                          className="px-2.5 py-1 bg-sky-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Exact (${cartTotal.toFixed(2)})
                        </button>
                        {[10, 20, 50, 100].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setTenderPreset(amt)}
                            className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>

                      {parseFloat(tenderCashAmount) >= cartTotal && (
                        <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-black text-sm pt-2 border-t border-slate-200 dark:border-slate-700">
                          <span>Change Due to Customer:</span>
                          <span className="text-lg font-mono">{formatCurrency(parseFloat(tenderCashAmount) - cartTotal)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">
                    Split Method Breakdown
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Cash Tender:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={splitCash}
                      onChange={(e) => setSplitCash(e.target.value)}
                      className="w-32 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-1.5 text-right font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Card Tender:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={splitCard}
                      onChange={(e) => setSplitCard(e.target.value)}
                      className="w-32 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-1.5 text-right font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Mobile Money:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={splitMobile}
                      onChange={(e) => setSplitMobile(e.target.value)}
                      className="w-32 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-1.5 text-right font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Optional Coupon Code */}
            <div className="pt-2 pb-4">
              <input
                type="text"
                placeholder="Optional Promo / Voucher Code (e.g. WELCOME20)"
                value={appliedPromoCode}
                onChange={(e) => setAppliedPromoCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 uppercase font-mono"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-2xl font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-pos-payment"
                onClick={handleExecuteCheckout}
                className="flex-2 py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-95 text-white rounded-2xl font-black shadow-md shadow-sky-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Complete & Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: HELD / SUSPENDED CARTS QUEUE */}
      {showHeldModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-5 text-slate-900 dark:text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Suspended / Held Sales Queue</h3>
              <button
                onClick={() => setShowHeldModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {heldCarts.map((h) => (
                <div
                  key={h.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{h.cartId} • {h.customerName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {h.items.length} items • Held at {new Date(h.heldAt).toLocaleTimeString()}
                    </p>
                    {h.note && <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">"{h.note}"</p>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        resumeHeldPosCart(h.id);
                        setShowHeldModal(false);
                      }}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => removeHeldPosCart(h.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: POS RETURN / REFUND */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg p-5 text-slate-900 dark:text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">POS Return & Refund</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Lookup receipt and adjust inventory automatically</p>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 space-y-3 text-xs">
              <form onSubmit={handleSearchReturnOrder} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Receipt/Order # (e.g. ORD-8801)"
                  value={returnOrderNumber}
                  onChange={(e) => setReturnOrderNumber(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs uppercase font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold cursor-pointer"
                >
                  Lookup
                </button>
              </form>

              {foundReturnOrder && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{foundReturnOrder.orderNumber}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {foundReturnOrder.customerName} • {new Date(foundReturnOrder.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="font-black font-mono text-sky-600 dark:text-sky-400">{formatCurrency(foundReturnOrder.totalAmount)}</span>
                  </div>

                  <div className="space-y-2">
                    <p className="font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Select Items to Return:
                    </p>
                    {foundReturnOrder.items.map((item) => (
                      <div
                        key={item.variantId}
                        className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="flex-1">
                          <p className="font-bold text-slate-900 dark:text-white">{item.productName}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.variantName} (Purchased: {item.quantity})</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={returnItemsState[item.variantId]?.qty || 0}
                            onChange={(e) => {
                              const q = parseInt(e.target.value, 10);
                              setReturnItemsState((prev) => ({
                                ...prev,
                                [item.variantId]: { ...prev[item.variantId], qty: q },
                              }));
                            }}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-white text-xs font-bold"
                          >
                            {Array.from({ length: item.quantity + 1 }, (_, i) => (
                              <option key={i} value={i}>
                                Return: {i}
                              </option>
                            ))}
                          </select>

                          <label className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={returnItemsState[item.variantId]?.restock ?? true}
                              onChange={(e) => {
                                setReturnItemsState((prev) => ({
                                  ...prev,
                                  [item.variantId]: { ...prev[item.variantId], restock: e.target.checked },
                                }));
                              }}
                              className="rounded"
                            />
                            <span>Restock</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleConfirmReturn}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-colors shadow-xs cursor-pointer"
                  >
                    Confirm Return & Issue Refund
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: QUICK ADD CUSTOMER */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-5 text-slate-900 dark:text-white shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Quick Add Customer</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Add customer profile and attach to current sale</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickCustomer} className="py-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-2 px-3 focus:outline-none focus:border-sky-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +1 (555) 234-5678"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-2 px-3 focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. sarah@example.com"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-2 px-3 focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Membership Tier
                  </label>
                  <select
                    value={newCustomerForm.tier}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, tier: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-2 px-3 focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="Bronze">Bronze Tier</option>
                    <option value="Silver">Silver Tier</option>
                    <option value="Gold">Gold Tier</option>
                    <option value="VIP">VIP Tier</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Customer Group
                  </label>
                  <select
                    value={newCustomerForm.customerGroup}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, customerGroup: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-2 px-3 focus:outline-none focus:border-sky-500 font-medium"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Corporate">Corporate</option>
                    <option value="VIP Member">VIP Member</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-quick-customer"
                  className="flex-2 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-black shadow-md shadow-sky-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create & Attach</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Price Override & Manager Approval Modal */}
      <PriceOverrideModal
        item={selectedOverrideItem}
        isOpen={!!selectedOverrideItem}
        onClose={() => setSelectedOverrideItem(null)}
        onApplyOverride={(variantId, newPrice, disc, overrideInfo) => {
          updatePosCartItemPriceAndDiscount(variantId, newPrice, disc, overrideInfo);
        }}
      />

      {/* Receipts, Cash Movement & Shift Operations Modals */}
      <ReceiptModal order={completedOrder} onClose={() => setCompletedOrder(null)} />
      <ShiftModal isOpen={showShiftModal} onClose={() => setShowShiftModal(false)} />
      <CashMovementModal isOpen={showCashMovementModal} onClose={() => setShowCashMovementModal(false)} />
      <BarcodeQrScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanResult={handleBarcodeOrQrScan}
      />
    </div>
  );
};
