import React, { useState, useEffect } from 'react';
import {
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  CreditCard,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
  ArrowRight,
  Boxes,
  Sparkles,
  Mail,
  Smartphone,
  MessageSquare,
  UserPlus,
  Play,
  Lock,
} from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderNumber?: string;
  initialEmail?: string;
  onOpenNotificationHub?: (order: Order) => void;
  onOpenClaimModal?: (email: string) => void;
  onOpenClaimAccount?: (email: string) => void;
}

const STATUS_STEPS: { status: OrderStatus; label: string; description: string }[] = [
  { status: 'Pending', label: 'Order Placed', description: 'Order logged & payment verified' },
  { status: 'Payment Confirmed', label: 'Processing', description: 'Warehouse allocation confirmed' },
  { status: 'Picking', label: 'Picking & Packing', description: 'Items packed in warehouse' },
  { status: 'Dispatched', label: 'In Transit', description: 'Carrier tracking active on route' },
  { status: 'Delivered', label: 'Delivered', description: 'Delivered to address or pickup' },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  initialOrderNumber = '',
  initialEmail = '',
  onOpenNotificationHub,
  onOpenClaimModal,
  onOpenClaimAccount,
}) => {
  const { orders, formatCurrency, activeCustomerUser, simulateAdvanceOrderStatus } = useCommerce();

  const handleClaimAccount = (email: string) => {
    onClose();
    if (onOpenClaimModal) onOpenClaimModal(email);
    else if (onOpenClaimAccount) onOpenClaimAccount(email);
  };

  const [orderQuery, setOrderQuery] = useState(initialOrderNumber);
  const [emailQuery, setEmailQuery] = useState(initialEmail || activeCustomerUser?.email || '');
  const [searchedOrder, setSearchedOrder] = useState<Order | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Auto-search if initialOrderNumber is passed
  useEffect(() => {
    if (isOpen && initialOrderNumber) {
      setOrderQuery(initialOrderNumber);
      const found = orders.find(
        (o) =>
          o.orderNumber.toLowerCase() === initialOrderNumber.trim().toLowerCase() ||
          o.id.toLowerCase() === initialOrderNumber.trim().toLowerCase()
      );
      if (found) {
        setSearchedOrder(found);
        if (found.customerEmail) setEmailQuery(found.customerEmail);
        setHasSearched(true);
      }
    }
  }, [isOpen, initialOrderNumber, orders]);

  if (!isOpen) return null;

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    const cleanOrder = orderQuery.trim().toLowerCase();
    const cleanEmail = emailQuery.trim().toLowerCase();

    if (!cleanOrder) {
      setErrorMessage('Please enter a valid Order Number (e.g. ORD-2026-001)');
      return;
    }

    // Lookup order by number
    const matchingOrder = orders.find(
      (o) => o.orderNumber.toLowerCase() === cleanOrder || o.id.toLowerCase() === cleanOrder
    );

    if (!matchingOrder) {
      setHasSearched(true);
      setSearchedOrder(null);
      setErrorMessage(`No order found matching "${orderQuery.trim()}". Please verify your order number.`);
      return;
    }

    // Dual validation: check email match if provided or prompt if order has customer email
    if (cleanEmail && matchingOrder.customerEmail) {
      const orderEmail = matchingOrder.customerEmail.toLowerCase().trim();
      if (!orderEmail.includes(cleanEmail) && !cleanEmail.includes(orderEmail)) {
        setHasSearched(true);
        setSearchedOrder(null);
        setErrorMessage(
          `Security & Privacy: The email "${emailQuery.trim()}" does not match the billing email on file for ${matchingOrder.orderNumber}. Please check your spelling or use your magic tracking email link.`
        );
        return;
      }
    }

    setHasSearched(true);
    setSearchedOrder(matchingOrder);
    setErrorMessage('');
  };

  const handleSelectQuickOrder = (order: Order) => {
    setOrderQuery(order.orderNumber);
    setEmailQuery(order.customerEmail || '');
    setSearchedOrder(order);
    setHasSearched(true);
    setErrorMessage('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  const handleAdvanceStatus = () => {
    if (!searchedOrder) return;
    setIsSimulating(true);
    const updated = simulateAdvanceOrderStatus(searchedOrder.id);
    if (updated) {
      setSearchedOrder(updated);
    }
    setTimeout(() => setIsSimulating(false), 300);
  };

  const getStepIndex = (status: OrderStatus) => {
    if (status === 'Pending' || status === 'Stock Reserved') return 0;
    if (status === 'Payment Confirmed') return 1;
    if (status === 'Picking' || status === 'Packed') return 2;
    if (status === 'Dispatched') return 3;
    if (status === 'Delivered' || status === 'Completed') return 4;
    return 0;
  };

  const currentStep = searchedOrder ? getStepIndex(searchedOrder.status) : 0;
  const isCancelled = searchedOrder?.status === 'Cancelled' || searchedOrder?.status === 'Refunded';

  return (
    <div
      id="modal-order-tracking"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 overflow-y-auto animate-in fade-in duration-200 text-slate-900 dark:text-white"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-3.5 sm:p-6 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shadow-md shadow-sky-500/10 flex-shrink-0">
              <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-xl font-black text-slate-900 dark:text-white truncate">Live Order Tracking</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Secure Self-Service
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 truncate">
                Order Number + Email Verification (Zero password required)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1 custom-scrollbar">
          {/* Method 1: Self-Service Order Number + Email Lookup Form */}
          <form onSubmit={handleSearch} className="bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                <span>Self-Service Order Lookup</span>
              </span>
              <span className="text-[10px] sm:text-[11px] text-slate-500">Requires matching billing email for privacy</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Order Number / Order ID <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Package className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    id="input-tracking-ordernumber"
                    type="text"
                    required
                    placeholder="e.g. ORD-2026-001"
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Checkout Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    id="input-tracking-email"
                    type="email"
                    required
                    placeholder="e.g. customer@example.com"
                    value={emailQuery}
                    onChange={(e) => setEmailQuery(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <span className="text-[10px] sm:text-[11px] text-slate-500">
                🔒 Security Note: Order number + email ensures private lookup.
              </span>
              <button
                id="btn-submit-order-tracking"
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 flex items-center justify-center gap-1.5 transition-all flex-shrink-0 min-h-[38px] cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Track My Order</span>
              </button>
            </div>
          </form>

          {/* Quick Demo Selector for immediate testing */}
          {orders.length > 0 && !searchedOrder && (
            <div className="bg-slate-850/60 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                <span className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Test Sample Orders (1-Click Fill):</span>
                </span>
                <span className="text-sky-400 font-mono text-[10px]">Preloaded sample orders</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {orders.slice(0, 6).map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => handleSelectQuickOrder(ord)}
                    className="p-2.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-750 hover:border-sky-500/50 rounded-xl text-left transition-all group cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sky-400 text-xs">{ord.orderNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:text-white">
                        {ord.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">{ord.customerName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{ord.customerEmail}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 sm:p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-xs">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <p>{errorMessage}</p>
            </div>
          )}

          {/* Tracked Order Result View */}
          {searchedOrder && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
              {/* Order Status Banner */}
              <div className="p-3.5 sm:p-5 bg-gradient-to-r from-slate-100 dark:from-slate-850 to-slate-200 dark:to-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-600 dark:text-slate-400">Order</span>
                    <strong className="text-sm sm:text-lg font-black text-slate-900 dark:text-white font-mono">{searchedOrder.orderNumber}</strong>
                    <span
                      className={`text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        searchedOrder.status === 'Delivered' || searchedOrder.status === 'Completed'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : searchedOrder.status === 'Dispatched'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : searchedOrder.status === 'Cancelled' || searchedOrder.status === 'Refunded'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {searchedOrder.status}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Placed {new Date(searchedOrder.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • Via {searchedOrder.channel}
                  </p>
                </div>

                {/* Quick Interactive Actions Banner */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {onOpenNotificationHub && (
                    <button
                      type="button"
                      onClick={() => onOpenNotificationHub(searchedOrder)}
                      className="flex-1 sm:flex-initial justify-center px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sky-500 dark:text-sky-300 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors min-h-[38px] cursor-pointer"
                      title="View Magic Links & SMS simulator"
                    >
                      <Mail className="w-3.5 h-3.5 text-sky-400" />
                      <span>Emails & SMS</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleAdvanceStatus}
                    disabled={isSimulating}
                    className="flex-1 sm:flex-initial justify-center px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all min-h-[38px] cursor-pointer active:scale-98"
                    title="Advance to next fulfillment milestone"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Advance Milestone</span>
                  </button>
                </div>
              </div>

              {/* Multi-step Visual Progress Timeline - Responsive Grid for tablet/desktop, smooth card flow */}
              {!isCancelled ? (
                <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-sky-400" />
                      <span>Live Fulfillment Lifecycle</span>
                    </h3>
                    <span className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400">Carrier & Warehouse sync</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 pt-1">
                    {STATUS_STEPS.map((step, idx) => {
                      const isComplete = idx < currentStep;
                      const isCurrent = idx === currentStep;

                      return (
                        <div
                          key={step.label}
                          className={`p-3 sm:p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                            isComplete
                              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                              : isCurrent
                              ? 'bg-sky-950/40 border-sky-500 text-sky-200 ring-1 ring-sky-500/30'
                              : 'bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 opacity-60'
                          } ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Step 0{idx + 1}</span>
                            {isComplete ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : isCurrent ? (
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                            ) : (
                              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold leading-tight truncate">{step.label}</p>
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">{step.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold">This order has been {searchedOrder.status.toLowerCase()}</p>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">Please contact customer support if you need further assistance with your refund.</p>
                  </div>
                </div>
              )}

              {/* 4 Methods Hub Spotlight Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {/* Method 2: Magic Link in Email */}
                <div
                  onClick={() => onOpenNotificationHub && onOpenNotificationHub(searchedOrder)}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 cursor-pointer transition-all space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      <span>Method 2: Email Magic Link</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400">
                    View simulated Confirmation & Shipping emails with 1-click magic auth.
                  </p>
                </div>

                {/* Method 3: SMS & WhatsApp */}
                <div
                  onClick={() => onOpenNotificationHub && onOpenNotificationHub(searchedOrder)}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-all space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Method 3: SMS / WhatsApp</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400">
                    Live mobile text alerts sent to {searchedOrder.customerPhone || 'mobile'}.
                  </p>
                </div>

                {/* Method 4: Retroactive Claiming */}
                <div
                  onClick={() => handleClaimAccount(searchedOrder.customerEmail || '')}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Method 4: Claim Order</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400">
                    Link guest order to permanent account & earn {searchedOrder.loyaltyPointsEarned || 20} points.
                  </p>
                </div>
              </div>

              {/* Shipping & Delivery Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Logistics info */}
                <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-sky-400" />
                      <span>Carrier & Shipping</span>
                    </span>
                    <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-850 text-sky-400 font-semibold">
                      {searchedOrder.fulfillmentMethod}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Carrier:</span>
                      <span className="text-slate-900 dark:text-white font-semibold truncate max-w-[180px] sm:max-w-none text-right">{searchedOrder.carrierName || 'OmniTrack / FedEx Ground'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Tracking Code:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sky-400 font-bold truncate max-w-[150px] sm:max-w-none">
                          {searchedOrder.trackingNumber || `TRK-OMNI-${searchedOrder.id.slice(0, 8).toUpperCase()}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(searchedOrder.trackingNumber || `TRK-OMNI-${searchedOrder.id.slice(0, 8).toUpperCase()}`)}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                          title="Copy tracking number"
                        >
                          {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Estimated Delivery:</span>
                      <span className="text-emerald-400 font-bold">
                        {new Date(Date.now() + 86400000 * 2).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recipient / Pickup address */}
                <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-sky-400" />
                    <span>Destination & Customer</span>
                  </span>

                  <div className="space-y-1 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white">{searchedOrder.customerName}</p>
                    {searchedOrder.customerEmail && <p className="text-slate-600 dark:text-slate-400 truncate">{searchedOrder.customerEmail}</p>}
                    {searchedOrder.customerPhone && <p className="text-slate-600 dark:text-slate-400">{searchedOrder.customerPhone}</p>}
                    {searchedOrder.shippingAddress ? (
                      <p className="text-slate-700 dark:text-slate-300 pt-1 leading-relaxed text-[11px] sm:text-xs">
                        {searchedOrder.shippingAddress.street}, {searchedOrder.shippingAddress.city},{' '}
                        {searchedOrder.shippingAddress.state} {searchedOrder.shippingAddress.zip}
                      </p>
                    ) : (
                      <p className="text-sky-300 pt-1">Pickup Warehouse: {searchedOrder.locationName}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Items Breakdown */}
              <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-3 sm:p-3.5 bg-slate-100 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Items in this shipment ({searchedOrder.items.length})</span>
                  <span>Line Total</span>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 p-2">
                  {searchedOrder.items.map((item, i) => (
                    <div key={i} className="p-2.5 sm:p-3 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt={item.productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Boxes className="w-5 h-5 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.productName}</p>
                          <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 truncate">
                            {item.variantName} • Qty: <strong className="text-slate-900 dark:text-white">{item.quantity}</strong> @ {formatCurrency(item.price)}
                          </p>
                          <span className="text-[9px] font-mono text-slate-500">SKU: {item.sku}</span>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-slate-900 dark:text-white flex-shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                {/* Subtotal / Payment breakdown footer */}
                <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(searchedOrder.subtotal)}</span>
                  </div>
                  {searchedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Discount ({searchedOrder.discountCode || 'Applied'}):</span>
                      <span>-{formatCurrency(searchedOrder.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Shipping Fee:</span>
                    <span>{searchedOrder.shippingFee > 0 ? formatCurrency(searchedOrder.shippingFee) : 'FREE'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Estimated Tax:</span>
                    <span>{formatCurrency(searchedOrder.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span>Total Amount Paid:</span>
                    <span className="text-emerald-400">{formatCurrency(searchedOrder.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSearchedOrder(null);
              setHasSearched(false);
              setErrorMessage('');
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors text-center cursor-pointer min-h-[38px]"
          >
            Track Another Order
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-bold transition-all text-center cursor-pointer min-h-[38px]"
          >
            Close Tracking
          </button>
        </div>
      </div>
    </div>
  );
};
