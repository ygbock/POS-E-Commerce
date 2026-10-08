import React, { useState, useEffect, useRef } from 'react';
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
import { useStorefrontContext } from '../../context/StorefrontContext';
import { Customer, Order, OrderStatus, Product } from '../../types';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import { storefrontApi } from '../../services/storefrontApi';
import { authClient } from '../../services/authClient';

export type AccountPortalTab = 'profile' | 'orders' | 'tracking' | 'wishlist';

interface CustomerAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AccountPortalTab;
  initialOrderNumber?: string;
  initialTrackingEmail?: string;
  products?: Product[];
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
  products = [],
  onSelectProduct,
  onOpenCart,
  onOpenNotificationHub,
  onOpenClaimModal,
}) => {
  const { tenant, formatCurrency, wishlistIds, toggleWishlist, addToStoreCart, orders } = useStorefrontContext();

  const [activeCustomerUser, setActiveCustomerUser] = useState<Customer | null>(null);
  const [selectedTab, setSelectedTab] = useState<AccountPortalTab>(initialTab);

  // Auth sub-mode for guests: 'signup' vs 'signin'
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signin');

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
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [orderHistoryError, setOrderHistoryError] = useState('');

  // Load customer profile when modal opens or user login changes
  useEffect(() => {
    if (!isOpen || !tenant?.slug) return;
    const authUser = authClient.getUser();
    if (authUser && authUser.role === 'customer') {
      setOrderHistoryLoading(true);
      storefrontApi.getCustomerProfile(tenant.slug)
        .then((response: any) => {
          const profile = response?.data || response;
          setActiveCustomerUser({
            id: profile.id,
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            tier: profile.tier || 'Bronze',
            loyaltyPoints: Number(profile.loyaltyPoints || 0),
            storeCreditBalance: Number(profile.storeCreditBalance || 0),
            creditLimit: Number(profile.creditLimit || 0),
            addresses: profile.addresses || [],
            customerGroup: profile.customerGroup || 'Retail',
            registeredAt: profile.registeredAt,
          } as any);
        })
        .catch((err: any) => {
          console.error('[Customer Profile Load] Failed:', err);
          setActiveCustomerUser(null);
        })
        .finally(() => {
          setOrderHistoryLoading(false);
        });
    } else {
      setActiveCustomerUser(null);
    }
  }, [isOpen, tenant?.slug]);

  // Sync initialTab when props change
  useEffect(() => {
    if (isOpen) {
      setSelectedTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Sync initialOrderNumber by fetching the authoritative server record.
  useEffect(() => {
    if (!isOpen || !initialOrderNumber || !tenant?.slug) return;
    setOrderQuery(initialOrderNumber);
    setTrackingErrorMessage('');
    void storefrontApi.getCustomerOrder(tenant.slug, initialOrderNumber.trim())
      .then((response: any) => {
        const source = response?.data || response;
        setSearchedOrder({ ...source, items: Array.isArray(source?.items) ? source.items : [] } as Order);
        if (source?.customerEmail) setEmailQuery(source.customerEmail);
        setHasSearched(true);
      })
      .catch(() => {
        setSearchedOrder(null);
        setHasSearched(true);
        setTrackingErrorMessage('Order not found for this customer account.');
      });
  }, [isOpen, initialOrderNumber, tenant?.slug]);

  // Update emailQuery default when activeCustomerUser changes
  useEffect(() => {
    if (activeCustomerUser?.email) {
      setEmailQuery(activeCustomerUser.email);
    }
  }, [activeCustomerUser]);

  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen) return null;

  // Wishlist products
  const wishlist = wishlistIds || [];
  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  // Assertions require:
  const customerOrders = activeCustomerUser ? orders : [];

  // --- Handlers ---
  const handleLogout = () => {
    authClient.logout()
      .then(() => {
        setActiveCustomerUser(null);
        setSignupSuccessMsg('');
        setSignupError('');
        setSigninError('');
      })
      .catch((err) => {
        console.error('[Customer Logout Failed]:', err);
        setActiveCustomerUser(null);
      });
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
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
    if (!signupPassword || signupPassword.length < 12) {
      setSignupError('Password must be at least 12 characters.');
      return;
    }

    try {
      await authClient.registerCustomer({
        name: signupName.trim(),
        email: signupEmail.trim(),
        phone: signupPhone.trim() || undefined,
        password: signupPassword,
      });
      setSignupSuccessMsg('🎉 Account created successfully! Please verify your email and sign in.');
      setSignupName('');
      setSignupEmail('');
      setSignupPhone('');
      setSignupPassword('');
      setAuthMode('signin');
    } catch (err: any) {
      setSignupError(err instanceof Error ? err.message : 'Registration failed.');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninError('');

    if (!signinEmail.trim()) {
      setSigninError('Please enter your account email');
      return;
    }

    try {
      const authUser = await authClient.login(signinEmail.trim(), signinPassword);
      if (authUser.role !== 'customer') {
        setSigninError('Please use the business owner portal to sign in with non-customer roles.');
        await authClient.logout();
        return;
      }

      if (tenant?.slug) {
        const response = await storefrontApi.getCustomerProfile(tenant.slug);
        const profile = response?.data || response;
        setActiveCustomerUser({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          tier: profile.tier || 'Bronze',
          loyaltyPoints: Number(profile.loyaltyPoints || 0),
          storeCreditBalance: Number(profile.storeCreditBalance || 0),
          creditLimit: Number(profile.creditLimit || 0),
          addresses: profile.addresses || [],
          customerGroup: profile.customerGroup || 'Retail',
          registeredAt: profile.registeredAt,
        } as any);
      }
      setSigninEmail('');
      setSigninPassword('');
    } catch (err: any) {
      setSigninError(err instanceof Error ? err.message : 'Invalid email or password.');
    }
  };

  const handleSearchTracking = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTrackingErrorMessage('');
    const cleanOrder = orderQuery.trim().toLowerCase();
    const cleanEmail = emailQuery.trim().toLowerCase();

    if (!cleanOrder) {
      setTrackingErrorMessage('Please enter a valid Order Number (e.g. ORD-2026-001)');
      return;
    }

    if (!tenant?.slug) {
      setTrackingErrorMessage('Storefront context is unavailable. Please try again.');
      return;
    }

    try {
      const response = await storefrontApi.trackOrder(tenant.slug, cleanOrder, cleanEmail || undefined);
      const matchingOrder = (response as any)?.data || response;
      if (!matchingOrder) throw new Error('Order not found');

      setSearchedOrder({
        ...matchingOrder,
        items: Array.isArray(matchingOrder?.items) ? matchingOrder.items : [],
      } as Order);
      setHasSearched(true);
    } catch (error) {
      setSearchedOrder(null);
      setHasSearched(true);
      setTrackingErrorMessage('No matching order record found. Please verify Order Number & email combination.');
    }
  };

  const handleCopyTracking = (num: string) => {
    void navigator.clipboard.writeText(num);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  return (
    <div
      id="modal-customer-account-portal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200 text-slate-900 dark:text-white"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-account-modal-title"
        tabIndex={-1}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col focus:outline-none"
      >
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
                <h3 id="customer-account-modal-title" className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
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
                  : 'Sign up to unlock rewards or track guest orders'}
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
            <span>Order Details</span>
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
            <Heart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Wishlist ({wishlist.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-950">
          {selectedTab === 'profile' && (
            <div>
              {activeCustomerUser ? (
                /* Profile & Rewards Section */
                <div className="space-y-6">
                  {/* Rewards Snapshot */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl text-white shadow-xl flex flex-col justify-between">
                      <div className="flex justify-between items-center">
                        <Award className="w-8 h-8 text-indigo-200" />
                        <span className="text-xs uppercase bg-indigo-700/50 px-2 py-0.5 rounded-full font-black">
                          {activeCustomerUser.tier} Tier
                        </span>
                      </div>
                      <div className="mt-4">
                        <span className="text-xs text-indigo-200 block">Available Rewards Balance</span>
                        <span className="text-2xl font-black">{activeCustomerUser.loyaltyPoints.toLocaleString()} pts</span>
                        <p className="text-[10px] text-indigo-200 mt-1">
                          Eligible promotions and fulfillment offers are verified by the store server
                        </p>
                      </div>
                    </div>

                    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col justify-between">
                      <CreditCard className="w-8 h-8 text-indigo-500" />
                      <div className="mt-4">
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">Store Credit Balance</span>
                        <span className="text-2xl font-black">{formatCurrency(activeCustomerUser.storeCreditBalance)}</span>
                      </div>
                    </div>

                    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col justify-between">
                      <Package className="w-8 h-8 text-emerald-500" />
                      <div className="mt-4">
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">Completed Orders</span>
                        <span className="text-2xl font-black">{customerOrders.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
                    <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <User className="w-5 h-5 text-indigo-500" />
                      <span>Profile Information</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-slate-400 block">Full Name</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{activeCustomerUser.name}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Email Address</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{activeCustomerUser.email}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Phone Number</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{activeCustomerUser.phone}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Primary Delivery Address</span>
                        {activeCustomerUser.addresses[0] ? (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {activeCustomerUser.addresses[0].street}, {activeCustomerUser.addresses[0].city}, {activeCustomerUser.addresses[0].zip}
                          </span>
                        ) : (
                          <span className="text-slate-400">No primary address registered</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Auth Form (SignIn / SignUp) */
                <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden">
                  <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                    <button
                      type="button"
                      onClick={() => setAuthMode('signin')}
                      className={`flex-1 py-4 text-center font-bold text-sm border-b-2 transition-all ${
                        authMode === 'signin'
                          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                      }`}
                    >
                      <LogIn className="w-4 h-4 inline-block mr-1.5" />
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('signup')}
                      className={`flex-1 py-4 text-center font-bold text-sm border-b-2 transition-all ${
                        authMode === 'signup'
                          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                      }`}
                    >
                      <UserPlus className="w-4 h-4 inline-block mr-1.5" />
                      Create Account
                    </button>
                  </div>

                  <div className="p-6">
                    {authMode === 'signin' ? (
                      <form onSubmit={handleSignIn} className="space-y-4">
                        <h4 className="font-bold text-slate-900 dark:text-white text-base">Sign in to your Customer Account</h4>
                        <p className="text-xs text-slate-500">View orders, redeem loyalty rewards, and manage billing profiles.</p>

                        {signinError && (
                          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2 animate-shake">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{signinError}</span>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Email Address</label>
                          <input
                            type="email"
                            required
                            placeholder="you@example.com"
                            value={signinEmail}
                            onChange={(e) => setSigninEmail(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Password</label>
                          <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={signinPassword}
                            onChange={(e) => setSigninPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/20"
                        >
                          Sign In
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleCreateAccount} className="space-y-4">
                        <h4 className="font-bold text-slate-900 dark:text-white text-base">Register Customer Account</h4>
                        <p className="text-xs text-slate-500">Sign up and get custom perks with security-verified server-side checks.</p>

                        {signupError && (
                          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2 animate-shake">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{signupError}</span>
                          </div>
                        )}

                        {signupSuccessMsg && (
                          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{signupSuccessMsg}</span>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Full Name</label>
                          <input
                            type="text"
                            required
                            placeholder="John Doe"
                            value={signupName}
                            onChange={(e) => setSignupName(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Email Address</label>
                          <input
                            type="email"
                            required
                            placeholder="you@example.com"
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Phone Number (optional)</label>
                          <input
                            type="text"
                            placeholder="+1 (555) 019-9234"
                            value={signupPhone}
                            onChange={(e) => setSignupPhone(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Password</label>
                          <input
                            type="password"
                            required
                            placeholder="••••••••••••"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/20"
                        >
                          Create Account
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTab === 'tracking' && (
            <div className="space-y-6">
              {/* Search Form */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm">
                <form onSubmit={handleSearchTracking} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Order Number</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ORD-2026-001"
                      value={orderQuery}
                      onChange={(e) => setOrderQuery(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Email Contact</label>
                    <input
                      type="email"
                      placeholder="customer@example.com"
                      value={emailQuery}
                      onChange={(e) => setEmailQuery(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-950 dark:text-slate-50"
                    />
                  </div>

                  <button
                    type="submit"
                    className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer h-[42px]"
                  >
                    <Search className="w-4 h-4" />
                    <span>Track Order</span>
                  </button>
                </form>

                {trackingErrorMessage && (
                  <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{trackingErrorMessage}</span>
                  </div>
                )}
              </div>

              {/* Search Result */}
              {hasSearched && searchedOrder && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6">
                  {/* Status Steps */}
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-4">Fulfillment Status Flow</h4>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {STATUS_STEPS.map((step) => {
                        const isCompleted = searchedOrder.status === step.status ||
                          (STATUS_STEPS.findIndex((s) => s.status === searchedOrder.status) >=
                            STATUS_STEPS.findIndex((s) => s.status === step.status));
                        return (
                          <div
                            key={step.status}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              isCompleted
                                ? 'bg-indigo-50/50 dark:bg-indigo-950/25 border-indigo-200 dark:border-indigo-900/50'
                                : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              {isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Clock className="w-4 h-4 text-slate-300 dark:text-slate-600 animate-pulse" />
                              )}
                              <span className={`text-[11px] font-black uppercase tracking-wider ${
                                isCompleted ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                              }`}>{step.label}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{step.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Order Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl">
                        <div>
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Tracking Number</span>
                          <span className="font-black text-sm text-slate-800 dark:text-slate-100">{searchedOrder.orderNumber}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyTracking(searchedOrder.orderNumber)}
                          className="p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-sm transition-all"
                        >
                          {copiedTracking ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>

                      <div className="p-4 rounded-2xl border border-slate-150 dark:border-slate-800 text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Items Count</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {searchedOrder.items.reduce((sum, item) => sum + Number(item.quantity), 0)} units
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Subtotal Amount</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(searchedOrder.subtotalAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fulfillment Method</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{searchedOrder.fulfillmentMethod}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Payment Status</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{searchedOrder.paymentStatus}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 font-black text-sm text-indigo-600 dark:text-indigo-400">
                          <span>Total Amount Paid</span>
                          <span>{formatCurrency(searchedOrder.totalAmount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Order Line Items */}
                    <div className="space-y-3">
                      <h5 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Purchased Line Items</h5>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                        {searchedOrder.items.map((item, idx) => (
                          <div key={idx} className="flex gap-3 p-3 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800/50 rounded-2xl">
                            {item.imageUrl && (
                              <img src={item.imageUrl} alt={item.productName} className="w-10 h-10 object-cover rounded-xl bg-white" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{item.productName}</p>
                              <p className="text-[10px] text-slate-400 truncate">{item.variantName}</p>
                              <div className="flex justify-between items-center mt-1 text-[11px]">
                                <span className="text-slate-500">{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(item.totalAmount)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTab === 'wishlist' && (
            <div className="space-y-6">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                <span>My Saved Storefront Wishlist</span>
              </h4>

              {wishlistedProducts.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Heart className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                  </div>
                  <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1">Your wishlist is currently empty</h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Explore our catalog to save your favorite products.</p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {wishlistedProducts.map((product) => {
                    const price = product.variants[0]?.retailPrice || 0;
                    return (
                      <div
                        key={product.id}
                        className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col justify-between hover:shadow-lg transition-all"
                      >
                        <div className="relative group">
                          {product.images?.[0] && (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              className="w-full h-32 object-cover rounded-2xl bg-slate-50 mb-3"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => toggleWishlist(product.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-xl bg-white/95 backdrop-blur shadow hover:bg-rose-50 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </button>
                        </div>
                        <div>
                          <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200 line-clamp-1">{product.name}</h5>
                          <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">{product.shortDescription}</p>
                          <div className="flex items-center justify-between mt-3">
                            <span className="font-black text-xs text-indigo-600 dark:text-indigo-400">{formatCurrency(price)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectProduct) {
                                  onSelectProduct(product);
                                  onClose();
                                }
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold text-[10px] rounded-xl transition-all"
                            >
                              Quick View
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
