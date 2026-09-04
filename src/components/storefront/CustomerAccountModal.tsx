import React, { useState, useEffect } from 'react';
import {
  User,
  X,
  Award,
  CreditCard,
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Phone,
  Mail,
  LogOut,
  UserPlus,
  LogIn,
  Heart,
  Truck,
  Search,
  Lock,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Bell,
  ChevronRight,
  MessageSquare,
  Smartphone,
  Tag,
  ShoppingBag,
  Gift,
  Key,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Customer, Order, OrderStatus, Product, ProductVariant } from '../../types';

export type AccountPortalTab = 'profile' | 'orders' | 'tracking' | 'wishlist';

interface CustomerAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AccountPortalTab;
  initialOrderNumber?: string;
  initialTrackingEmail?: string;
  onSelectProduct?: (product: Product) => void;
  onOpenCart?: () => void;
  onOpenNotificationHub?: (order: Order) => void;
  onOpenClaimModal?: (email: string) => void;
}

const STATUS_STEPS: { status: OrderStatus; label: string; description: string }[] = [
  { status: 'Stock Reserved', label: 'Order Placed', description: 'Order received & payment authorized' },
  { status: 'Payment Confirmed', label: 'Processing', description: 'Payment verified & inventory allocated' },
  { status: 'Picking', label: 'Packing at Warehouse', description: 'Items picked and securely packaged' },
  { status: 'Dispatched', label: 'In Transit', description: 'Handed over to carrier for delivery' },
  { status: 'Delivered', label: 'Delivered', description: 'Package successfully arrived at destination' },
];

export const CustomerAccountModal: React.FC<CustomerAccountModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'profile',
  initialOrderNumber = '',
  initialTrackingEmail = '',
  onSelectProduct,
  onOpenCart,
  onOpenNotificationHub,
  onOpenClaimModal,
}) => {
  const {
    customers,
    activeCustomerUser,
    setActiveCustomerUser,
    orders,
    formatCurrency,
    wishlist,
    products,
    toggleWishlist,
    addToStoreCart,
    getTotalStockForVariant,
    simulateAdvanceOrderStatus,
    registerNewCustomer,
    applyCoupon,
    appliedCoupon,
  } = useCommerce();

  const [selectedTab, setSelectedTab] = useState<AccountPortalTab>(initialTab);

  // Auth sub-mode for guests: 'signup' vs 'signin'
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');

  // Sign Up Form State
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupStreet, setSignupStreet] = useState('');
  const [signupCity, setSignupCity] = useState('');
  const [signupState, setSignupState] = useState('');
  const [signupZip, setSignupZip] = useState('');
  const [signupCountry, setSignupCountry] = useState('USA');
  const [signupError, setSignupError] = useState('');
  const [signupSuccessMsg, setSignupSuccessMsg] = useState('');

  // Sign In Form State
  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [signinError, setSigninError] = useState('');

  // Tracking state
  const [orderQuery, setOrderQuery] = useState(initialOrderNumber);
  const [emailQuery, setEmailQuery] = useState(initialTrackingEmail || activeCustomerUser?.email || '');
  const [searchedOrder, setSearchedOrder] = useState<Order | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedMagicLink, setCopiedMagicLink] = useState(false);
  const [copiedCouponCode, setCopiedCouponCode] = useState(false);
  const [trackingErrorMessage, setTrackingErrorMessage] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Sync initialTab when props change
  useEffect(() => {
    if (isOpen) {
      setSelectedTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Sync initialOrderNumber
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

  // Update emailQuery default when activeCustomerUser changes
  useEffect(() => {
    if (activeCustomerUser?.email) {
      setEmailQuery(activeCustomerUser.email);
    }
  }, [activeCustomerUser]);

  if (!isOpen) return null;

  // Filter orders for active customer
  const customerOrders = activeCustomerUser
    ? orders.filter(
        (o) =>
          o.customerName?.toLowerCase() === activeCustomerUser.name.toLowerCase() ||
          o.customerEmail?.toLowerCase() === activeCustomerUser.email.toLowerCase() ||
          o.customerId === activeCustomerUser.id
      )
    : orders.slice(0, 4);

  // Wishlist products
  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  // --- Handlers ---
  const handleLogout = () => {
    setActiveCustomerUser(null);
    setSignupSuccessMsg('');
    setSignupError('');
    setSigninError('');
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setSignupSuccessMsg('');

    if (!signupName.trim()) {
      setSignupError('Please enter your full name');
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setSignupError('Please enter a valid email address');
      return;
    }
    if (!signupPhone.trim()) {
      setSignupError('Please enter your phone number for delivery and order notifications');
      return;
    }

    // Check if customer email is already registered
    const existing = customers.find((c) => c.email.toLowerCase() === signupEmail.trim().toLowerCase());
    if (existing) {
      setActiveCustomerUser(existing);
      setSignupSuccessMsg(`Welcome back, ${existing.name}! Switched to your registered account.`);
      applyCoupon('WELCOME20');
      return;
    }

    // Create the customer
    const result = registerNewCustomer({
      name: signupName.trim(),
      email: signupEmail.trim(),
      phone: signupPhone.trim(),
      street: signupStreet.trim() || '100 Commerce Way',
      city: signupCity.trim() || 'Seattle',
      state: signupState.trim() || 'WA',
      zip: signupZip.trim() || '98101',
      country: signupCountry || 'USA',
    });

    // Auto-apply WELCOME20 coupon code to cart!
    applyCoupon('WELCOME20');

    setSignupSuccessMsg(
      `🎉 Welcome ${result.customer.name}! Account created with ${result.pointsAdded} reward points. Coupon WELCOME20 ($20 OFF) has been activated!`
    );

    // Clear signup form
    setSignupName('');
    setSignupEmail('');
    setSignupPhone('');
    setSignupPassword('');
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setSigninError('');

    if (!signinEmail.trim()) {
      setSigninError('Please enter your account email');
      return;
    }

    const cleanEmail = signinEmail.trim().toLowerCase();
    const found = customers.find((c) => c.email.toLowerCase() === cleanEmail);

    if (found) {
      setActiveCustomerUser(found);
      setSigninEmail('');
      setSigninPassword('');
    } else {
      // If not found in customers list, check if orders exist with this email
      const matchingOrders = orders.filter((o) => o.customerEmail?.toLowerCase() === cleanEmail);
      if (matchingOrders.length > 0) {
        // Auto-register from existing guest orders
        const reg = registerNewCustomer({
          name: matchingOrders[0].customerName || 'Shopper',
          email: cleanEmail,
          phone: matchingOrders[0].customerPhone || '+1 (555) 019-2834',
        });
        setActiveCustomerUser(reg.customer);
      } else {
        setSigninError(`No customer found with email "${signinEmail}". Create an account below to claim WELCOME20!`);
      }
    }
  };

  const handleSearchTracking = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTrackingErrorMessage('');
    const cleanOrder = orderQuery.trim().toLowerCase();
    const cleanEmail = emailQuery.trim().toLowerCase();

    if (!cleanOrder) {
      setTrackingErrorMessage('Please enter a valid Order Number (e.g. ORD-2026-001)');
      return;
    }

    const matchingOrder = orders.find(
      (o) => o.orderNumber.toLowerCase() === cleanOrder || o.id.toLowerCase() === cleanOrder
    );

    if (!matchingOrder) {
      setHasSearched(true);
      setSearchedOrder(null);
      setTrackingErrorMessage(`No order found matching "${orderQuery.trim()}". Please verify your order number.`);
      return;
    }

    // Dual email check if provided
    if (cleanEmail && matchingOrder.customerEmail) {
      const orderEmail = matchingOrder.customerEmail.toLowerCase().trim();
      if (!orderEmail.includes(cleanEmail) && !cleanEmail.includes(orderEmail)) {
        setHasSearched(true);
        setSearchedOrder(null);
        setTrackingErrorMessage(
          `Security & Privacy: The email "${emailQuery.trim()}" does not match the billing email on file for ${matchingOrder.orderNumber}.`
        );
        return;
      }
    }

    setHasSearched(true);
    setSearchedOrder(matchingOrder);
    setTrackingErrorMessage('');
  };

  const handleTrackSpecificOrder = (order: Order) => {
    setOrderQuery(order.orderNumber);
    setEmailQuery(order.customerEmail || '');
    setSearchedOrder(order);
    setHasSearched(true);
    setTrackingErrorMessage('');
    setSelectedTab('tracking');
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  const handleCopyCoupon = (code: string) => {
    navigator.clipboard.writeText(code);
    applyCoupon(code);
    setCopiedCouponCode(true);
    setTimeout(() => setCopiedCouponCode(false), 2000);
  };

  const handleMoveAllWishlistToCart = () => {
    let movedCount = 0;
    wishlistedProducts.forEach((p) => {
      const variant = p.variants[0];
      const stock = getTotalStockForVariant(variant);
      if (stock > 0) {
        addToStoreCart(p, variant, 1);
        movedCount++;
      }
    });
    if (onOpenCart && movedCount > 0) {
      onClose();
      onOpenCart();
    }
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
      id="modal-customer-account-portal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200 text-slate-900 dark:text-white"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 p-0.5 shadow-lg shadow-indigo-600/20 flex-shrink-0">
              <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[14px] flex items-center justify-center font-black text-indigo-600 dark:text-indigo-400 text-sm">
                {activeCustomerUser ? activeCustomerUser.name.charAt(0) : <User className="w-5 h-5" />}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  {activeCustomerUser ? activeCustomerUser.name : 'Customer Account Portal'}
                </h3>
                {activeCustomerUser ? (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                    {activeCustomerUser.tier} Member
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Guest Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeCustomerUser
                  ? `${activeCustomerUser.email} • ${activeCustomerUser.loyaltyPoints.toLocaleString()} Reward Points`
                  : 'Sign up to unlock WELCOME20 coupon ($20 OFF) or track guest orders'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {activeCustomerUser && (
              <button
                id="btn-portal-logout"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-500/40 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all"
                title="Log out of customer account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            )}

            <button
              id="btn-close-account-portal"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors"
              title="Close Portal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex space-x-2 sm:space-x-6 text-xs font-semibold bg-white dark:bg-slate-900 overflow-x-auto custom-scrollbar flex-shrink-0">
          <button
            id="tab-account-overview"
            onClick={() => setSelectedTab('profile')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>{activeCustomerUser ? 'Account & Rewards' : 'Sign In / Sign Up'}</span>
          </button>

          <button
            id="tab-account-tracking"
            onClick={() => setSelectedTab('tracking')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedTab === 'tracking'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Track Order</span>
            {searchedOrder && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>

          <button
            id="tab-account-wishlist"
            onClick={() => setSelectedTab('wishlist')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedTab === 'wishlist'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-200'
            }`}
          >
            <Heart className={`w-4 h-4 ${wishlist.length > 0 ? 'fill-rose-500 text-rose-500' : 'text-rose-500'}`} />
            <span>Saved Wishlist</span>
            {wishlist.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {wishlist.length}
              </span>
            )}
          </button>

          <button
            id="tab-account-orders"
            onClick={() => setSelectedTab('orders')}
            className={`py-3.5 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedTab === 'orders'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Order History ({customerOrders.length})</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar text-xs flex-1">
          {/* ======================================================================== */}
          {/* TAB 1: PROFILE OVERVIEW / CREATE ACCOUNT / SIGN IN */}
          {/* ======================================================================== */}
          {selectedTab === 'profile' && (
            <div className="space-y-6">
              {activeCustomerUser ? (
                <>
                  {/* Tier & Loyalty Perks Card */}
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Award className="w-3 h-3" />
                          <span>{activeCustomerUser.tier} Membership Tier</span>
                        </span>
                        <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white pt-1">
                          {activeCustomerUser.name}
                        </h4>
                        <p className="text-slate-600 dark:text-slate-400 text-xs">
                          {activeCustomerUser.notes || 'Exclusive member pricing & priority same-day fulfillment.'}
                        </p>
                      </div>

                      <div className="text-left sm:text-right bg-slate-100/80 dark:bg-slate-900/80 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-slate-200 dark:border-slate-800 sm:border-0">
                        <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Reward Points</span>
                        <span className="text-xl sm:text-2xl font-black text-sky-400">
                          {activeCustomerUser.loyaltyPoints.toLocaleString()} pts
                        </span>
                        <p className="text-[10px] text-emerald-400">Worth {formatCurrency(activeCustomerUser.loyaltyPoints * 0.05)} store credit</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 block">Total Lifetime Spend</span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-400">
                          {formatCurrency(activeCustomerUser.totalSpent)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 block">Store Credit Balance</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {formatCurrency(activeCustomerUser.storeCredit)}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 block">Customer ID</span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          {activeCustomerUser.id}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Member Coupon Voucher Highlight: WELCOME20 */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <Gift className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">Member Voucher: WELCOME20</span>
                          <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200">
                            $20 OFF ($100+ Orders)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                          Claim your $20 discount at checkout. Applies automatically to active carts.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopyCoupon('WELCOME20')}
                      className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all flex-shrink-0"
                    >
                      {copiedCouponCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCouponCode ? 'Applied to Cart!' : 'Apply WELCOME20'}</span>
                    </button>
                  </div>

                  {/* Portal Quick-Action Hub Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Quick Tracking Tile */}
                    <div
                      onClick={() => setSelectedTab('tracking')}
                      className="p-4 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 rounded-2xl cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs">Live Order Tracking</p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">
                            {customerOrders.length > 0
                              ? `Latest: ${customerOrders[0].orderNumber} (${customerOrders[0].status})`
                              : 'Track courier & delivery milestone'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all" />
                    </div>

                    {/* Quick Wishlist Tile */}
                    <div
                      onClick={() => setSelectedTab('wishlist')}
                      className="p-4 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-rose-500/40 rounded-2xl cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Heart className={`w-5 h-5 ${wishlist.length > 0 ? 'fill-rose-400' : ''}`} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs">Saved Wishlist</p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">
                            {wishlist.length > 0 ? `${wishlist.length} products saved` : '0 saved items'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  {/* Contact & Address Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-400">Contact Details</p>
                      <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                          <span className="truncate">{activeCustomerUser.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                          <span>{activeCustomerUser.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-400">Default Shipping Address</p>
                      {activeCustomerUser.addresses[0] ? (
                        <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p>{activeCustomerUser.addresses[0].street}</p>
                            <p>
                              {activeCustomerUser.addresses[0].city}, {activeCustomerUser.addresses[0].state} {activeCustomerUser.addresses[0].zip}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-500">No saved address yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Logout Button inside profile */}
                  <div className="pt-2">
                    <button
                      onClick={handleLogout}
                      className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white rounded-2xl text-xs font-bold border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2 transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>Sign Out to Guest Mode</span>
                    </button>
                  </div>
                </>
              ) : (
                /* GUEST NOT SIGNED IN: DUAL CREATE ACCOUNT / SIGN IN HUB */
                <div className="space-y-5">
                  {/* Welcome Incentive Hero Banner */}
                  <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border border-sky-500/30 relative overflow-hidden shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          <span>Account Creation Special Offer</span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                          Create an Account & Get $20 OFF with <span className="text-amber-300 underline underline-offset-4 decoration-amber-400">WELCOME20</span>
                        </h3>
                        <p className="text-xs text-slate-700 dark:text-slate-300 max-w-xl">
                          Sign up in 30 seconds to unlock your $20 welcome voucher, earn 50 reward points, track orders in real-time, and link previous guest purchases automatically.
                        </p>
                        <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="text-emerald-400 font-bold">Guest Checkout Alternative:</span>
                          <span>Use coupon <strong className="text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">GUEST5</strong> for $5 OFF on any quick guest order.</span>
                        </div>
                      </div>

                      <div className="hidden md:flex w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 items-center justify-center text-sky-400 flex-shrink-0">
                        <Gift className="w-8 h-8" />
                      </div>
                    </div>
                  </div>

                  {/* Auth Mode Toggle (Create Account vs Sign In) */}
                  <div className="flex bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signup');
                        setSignupError('');
                        setSigninError('');
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                        authMode === 'signup'
                          ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-slate-900 dark:text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'
                      }`}
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Create New Account ($20 Bonus)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setSignupError('');
                        setSigninError('');
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                        authMode === 'signin'
                          ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-slate-900 dark:text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'
                      }`}
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Sign In to Existing Account</span>
                    </button>
                  </div>

                  {/* Success Banner */}
                  {signupSuccessMsg && (
                    <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                      <span>{signupSuccessMsg}</span>
                    </div>
                  )}

                  {/* SIGN UP FORM */}
                  {authMode === 'signup' && (
                    <form onSubmit={handleCreateAccount} className="p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">Create Customer Profile</h4>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">Unlock WELCOME20 coupon code and express checkout</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          +50 Free Points
                        </span>
                      </div>

                      {signupError && (
                        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{signupError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Full Name <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Sarah Jenkins"
                            value={signupName}
                            onChange={(e) => setSignupName(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Email Address <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="email"
                            placeholder="e.g. sarah.j@example.com"
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Phone Number <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="tel"
                            placeholder="e.g. +1 (555) 234-5678"
                            value={signupPhone}
                            onChange={(e) => setSignupPhone(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Password / PIN <span className="text-slate-500 font-normal">(Optional)</span>
                          </label>
                          <input
                            type="password"
                            placeholder="Create a secure password"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Optional Delivery Address info */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Default Shipping Address (Optional)
                        </p>
                        <div>
                          <input
                            type="text"
                            placeholder="Street Address (e.g. 742 Evergreen Terrace)"
                            value={signupStreet}
                            onChange={(e) => setSignupStreet(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="City"
                            value={signupCity}
                            onChange={(e) => setSignupCity(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="State"
                            value={signupState}
                            onChange={(e) => setSignupState(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Zip Code"
                            value={signupZip}
                            onChange={(e) => setSignupZip(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        id="btn-submit-create-account"
                        className="w-full py-3.5 bg-gradient-to-r from-sky-500 via-indigo-600 to-sky-500 hover:opacity-95 text-slate-900 dark:text-white rounded-xl text-xs font-black shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all"
                      >
                        <Gift className="w-4 h-4 text-amber-300" />
                        <span>Create Account & Unlock WELCOME20</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>
                  )}

                  {/* SIGN IN FORM */}
                  {authMode === 'signin' && (
                    <form onSubmit={handleSignIn} className="p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">Sign In to Your Account</h4>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">Access saved orders, membership discounts & points</p>
                        </div>
                        <Lock className="w-4 h-4 text-sky-400" />
                      </div>

                      {signinError && (
                        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{signinError}</span>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Registered Email Address
                          </label>
                          <input
                            type="email"
                            placeholder="e.g. taylor.reed@example.com"
                            value={signinEmail}
                            onChange={(e) => setSigninEmail(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Password
                          </label>
                          <input
                            type="password"
                            placeholder="Enter your account password"
                            value={signinPassword}
                            onChange={(e) => setSigninPassword(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white placeholder:text-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        id="btn-submit-signin"
                        className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 text-slate-900 dark:text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign In</span>
                      </button>

                      {/* Instant Autofill Helper for Testing */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
                        <p className="text-[10px] text-slate-500 mb-1.5">Quick Demo Sign-In (Registered Customers):</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {customers.slice(0, 3).map((cust) => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => {
                                setActiveCustomerUser(cust);
                                setSigninEmail('');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-[10px] font-medium transition-colors"
                            >
                              {cust.name} ({cust.tier})
                            </button>
                          ))}
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ======================================================================== */}
          {/* TAB 2: LIVE ORDER TRACKING */}
          {/* ======================================================================== */}
          {selectedTab === 'tracking' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Lookup Form */}
              <form onSubmit={handleSearchTracking} className="bg-slate-50 dark:bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-sky-400" />
                    <span>Real-Time Order Status & GPS Logistics</span>
                  </span>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">Method 1: Secure Order + Email Dual Verification</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Order Number / Order ID <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id="input-account-portal-track-number"
                      type="text"
                      placeholder="e.g. ORD-8801 or ORD-8802"
                      value={orderQuery}
                      onChange={(e) => setOrderQuery(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-750 hover:border-slate-600 focus:border-sky-500 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Customer Email <span className="text-slate-500 font-normal">(Optional for privacy check)</span>
                    </label>
                    <input
                      id="input-account-portal-track-email"
                      type="email"
                      placeholder="e.g. customer@example.com"
                      value={emailQuery}
                      onChange={(e) => setEmailQuery(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-750 hover:border-slate-600 focus:border-sky-500 rounded-xl p-2.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    <span>Quick Select:</span>
                    {orders.slice(0, 3).map((ord) => (
                      <button
                        key={ord.id}
                        type="button"
                        onClick={() => handleTrackSpecificOrder(ord)}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-sky-400 font-mono text-[10px] transition-colors"
                      >
                        {ord.orderNumber}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    id="btn-account-portal-track-search"
                    className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-slate-900 dark:text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all text-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Track Order</span>
                  </button>
                </div>
              </form>

              {/* Error state */}
              {trackingErrorMessage && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-300">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-xs">{trackingErrorMessage}</p>
                    <p className="text-[11px] text-rose-400/80">
                      Need assistance? Try selecting an order from your Order History tab or ensure email matches your receipt.
                    </p>
                  </div>
                </div>
              )}

              {/* TRACKING DETAILS DISPLAY */}
              {searchedOrder && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* Status Banner */}
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Order #{searchedOrder.orderNumber}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            searchedOrder.status === 'Delivered' || searchedOrder.status === 'Completed'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : searchedOrder.status === 'Dispatched'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : isCancelled
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {searchedOrder.status}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>
                          {searchedOrder.status === 'Delivered'
                            ? 'Package Successfully Delivered!'
                            : searchedOrder.status === 'Dispatched'
                            ? 'Package In Transit to Destination'
                            : searchedOrder.status === 'Picking'
                            ? 'Order Being Packed at Central Warehouse'
                            : searchedOrder.status === 'Payment Confirmed'
                            ? 'Payment Verified — Preparing Dispatch'
                            : 'Order Placed & Stock Reserved'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Placed on {new Date(searchedOrder.createdAt).toLocaleDateString()} • {searchedOrder.fulfillmentMethod}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAdvanceStatus}
                        disabled={isSimulating || searchedOrder.status === 'Delivered'}
                        className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 disabled:opacity-40 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors"
                        title="Simulate advance fulfillment milestone"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin text-sky-400' : ''}`} />
                        <span>Advance Demo Milestone</span>
                      </button>

                      {onOpenNotificationHub && (
                        <button
                          onClick={() => onOpenNotificationHub(searchedOrder)}
                          className="px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <Bell className="w-3.5 h-3.5" />
                          <span>Alerts Hub</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 5-STAGE PROGRESS TIMELINE */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Fulfillment Milestone Pipeline
                    </p>

                    <div className="relative">
                      {/* Line connector */}
                      <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-100 dark:bg-slate-800 hidden sm:block">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 relative">
                        {STATUS_STEPS.map((step, idx) => {
                          const isDone = currentStep > idx || searchedOrder.status === 'Delivered';
                          const isCurrent = currentStep === idx && searchedOrder.status !== 'Delivered';

                          return (
                            <div key={step.status} className="flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all z-10 ${
                                  isDone
                                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                                    : isCurrent
                                    ? 'bg-sky-500 text-slate-900 dark:text-white ring-4 ring-sky-500/20 animate-pulse'
                                    : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-500'
                                }`}
                              >
                                {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                              </div>

                              <div className="text-left sm:text-center">
                                <p className={`text-xs font-bold ${isCurrent ? 'text-sky-400' : isDone ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                                  {step.label}
                                </p>
                                <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight sm:mt-0.5">
                                  {step.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* CARRIER & LOGISTICS INFO */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-bold block">Carrier & Service</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-sky-400" />
                        <span>{searchedOrder.carrierName || 'OmniTrack Express / DHL'}</span>
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-bold block">Carrier Tracking Code</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-sky-400 truncate max-w-[130px]">
                          {searchedOrder.trackingNumber || `TRK-OMNI-${searchedOrder.orderNumber}`}
                        </span>
                        <button
                          onClick={() => copyToClipboard(searchedOrder.trackingNumber || `TRK-OMNI-${searchedOrder.orderNumber}`)}
                          className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
                          title="Copy tracking code"
                        >
                          {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-bold block">Estimated Arrival</span>
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {searchedOrder.status === 'Delivered'
                            ? 'Delivered'
                            : new Date(Date.now() + 86400000 * 2).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* ITEMS IN SHIPMENT */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Items in this Package ({searchedOrder.items.length})</p>
                      <span className="text-xs font-bold text-emerald-400">Total: {formatCurrency(searchedOrder.totalAmount)}</span>
                    </div>

                    <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                      {searchedOrder.items.map((it, idx) => (
                        <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-xs flex-shrink-0">
                              {it.quantity}×
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-xs">{it.productName}</p>
                              <p className="text-[10px] text-slate-600 dark:text-slate-400">{it.variantName} • SKU: {it.sku}</p>
                            </div>
                          </div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{formatCurrency(it.price * it.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================================== */}
          {/* TAB 3: WISHLIST */}
          {/* ======================================================================== */}
          {selectedTab === 'wishlist' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {wishlistedProducts.length === 0 ? (
                <div className="py-16 text-center space-y-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
                  <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto text-slate-600">
                    <Heart className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Your Saved Wishlist is Empty</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                      Explore our high-performance hardware catalog and click the heart icon on any product to save it for later.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-slate-900 dark:text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all"
                    >
                      Browse Catalog
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Wishlist Header & Actions */}
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {wishlistedProducts.length} Saved {wishlistedProducts.length === 1 ? 'Product' : 'Products'}
                    </span>

                    <button
                      onClick={handleMoveAllWishlistToCart}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-slate-900 dark:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Move All to Cart</span>
                    </button>
                  </div>

                  {/* Wishlist Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {wishlistedProducts.map((p) => {
                      const variant = p.variants[0];
                      const stock = getTotalStockForVariant(variant);

                      return (
                        <div
                          key={p.id}
                          className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 flex items-center justify-between gap-3 transition-all group"
                        >
                          <div
                            onClick={() => {
                              if (onSelectProduct) {
                                onClose();
                                onSelectProduct(p);
                              }
                            }}
                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                          >
                            <div className="w-14 h-14 rounded-xl bg-white dark:bg-slate-900 overflow-hidden border border-slate-200 dark:border-slate-800 flex-shrink-0">
                              <img
                                src={p.images[0]}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] text-sky-400 font-bold uppercase block truncate">
                                {p.brand}
                              </span>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[170px] sm:max-w-[200px]">
                                {p.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-bold text-emerald-400 text-xs">
                                  {formatCurrency(variant.retailPrice)}
                                </span>
                                <span className="text-[10px] text-slate-600 dark:text-slate-400">
                                  {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                addToStoreCart(p, variant, 1);
                                if (onOpenCart) {
                                  onClose();
                                  onOpenCart();
                                }
                              }}
                              disabled={stock === 0}
                              className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-slate-900 dark:text-white transition-colors"
                              title="Add to cart"
                            >
                              <ShoppingCart className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleWishlist(p.id)}
                              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/20 text-slate-600 dark:text-slate-400 hover:text-rose-400 transition-colors"
                              title="Remove from wishlist"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================================== */}
          {/* TAB 4: ORDER HISTORY */}
          {/* ======================================================================== */}
          {selectedTab === 'orders' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Showing historical orders for {activeCustomerUser ? activeCustomerUser.name : 'guest session'}:
                </p>
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{customerOrders.length} records</span>
              </div>

              {customerOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-500 space-y-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                  <Package className="w-10 h-10 mx-auto text-slate-700" />
                  <p className="text-xs">No orders recorded for this account yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sky-400 text-xs">{order.orderNumber}</span>
                            <span
                              className={`px-2 py-0.2 rounded-full text-[10px] font-black uppercase ${
                                order.status === 'Delivered' || order.status === 'Completed'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : order.status === 'Dispatched'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString()} • {order.items.length} items • {order.fulfillmentMethod}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <div className="text-right">
                            <span className="font-black text-emerald-400 text-xs sm:text-sm">{formatCurrency(order.totalAmount)}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleTrackSpecificOrder(order)}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-slate-900 dark:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Track Live</span>
                          </button>
                        </div>
                      </div>

                      {/* Items preview */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-wrap gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                        {order.items.map((it, idx) => (
                          <span key={idx} className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                            {it.productName} ({it.variantName}) × {it.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
