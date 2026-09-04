import React, { useState, useEffect } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import {
  CreditCard,
  Smartphone,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  X,
  Truck,
  Building2,
  Tag,
  User,
  UserCheck,
  Lock,
  ArrowRight,
  Gift,
  Clock,
  Sparkles,
  HelpCircle,
  Info,
  Check,
  FileText,
  ChevronRight,
  MapPin,
  Flame,
  Zap,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Order } from '../../types';

interface StoreCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess: (order: Order) => void;
}

export const StoreCheckoutModal: React.FC<StoreCheckoutModalProps> = ({
  isOpen,
  onClose,
  onOrderSuccess,
}) => {
  const {
    storeCart,
    appliedCoupon,
    placeEcommerceOrder,
    formatCurrency,
    customers,
    activeCustomerUser,
    setActiveCustomerUser,
    applyCoupon,
    removeCoupon,
  } = useCommerce();

  // Mode: Guest checkout vs Customer Account
  const [isGuestMode, setIsGuestMode] = useState<boolean>(!activeCustomerUser);

  // Form Fields
  const [customerName, setCustomerName] = useState(activeCustomerUser?.name || 'Taylor Reed');
  const [customerEmail, setCustomerEmail] = useState(activeCustomerUser?.email || 'taylor.reed@example.com');
  const [customerPhone, setCustomerPhone] = useState(activeCustomerUser?.phone || '+1 (555) 349-8812');
  const [street, setStreet] = useState(activeCustomerUser?.addresses[0]?.street || '742 Evergreen Terrace');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState(activeCustomerUser?.addresses[0]?.city || 'Springfield');
  const [state, setState] = useState(activeCustomerUser?.addresses[0]?.state || 'OR');
  const [zip, setZip] = useState(activeCustomerUser?.addresses[0]?.zip || '97477');
  const [country, setCountry] = useState(activeCustomerUser?.addresses[0]?.country || 'USA');

  // Selected Saved Address Index
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number>(0);

  const [fulfillmentMethod, setFulfillmentMethod] = useState<
    'Standard Delivery' | 'Express Delivery' | 'In-Store Pickup'
  >('Standard Delivery');

  const [paymentMethod, setPaymentMethod] = useState<
    'Credit Card' | 'Mobile Money' | 'Fintech Wallet' | 'Store Credit' | 'BNPL'
  >('Credit Card');

  // Card details
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardHolder, setCardHolder] = useState(activeCustomerUser?.name || 'Taylor Reed');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardCvc, setCardCvc] = useState('982');
  const [saveCard, setSaveCard] = useState(true);

  // Coupon & Extras
  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);

  // Gift Wrap & Notes
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Timer (15 minutes countdown)
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(899);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Synchronize when activeCustomerUser changes
  useEffect(() => {
    if (activeCustomerUser) {
      setCustomerName(activeCustomerUser.name);
      setCustomerEmail(activeCustomerUser.email);
      setCustomerPhone(activeCustomerUser.phone);
      setCardHolder(activeCustomerUser.name);
      if (activeCustomerUser.addresses && activeCustomerUser.addresses.length > 0) {
        const addr = activeCustomerUser.addresses[selectedAddressIndex] || activeCustomerUser.addresses[0];
        setStreet(addr.street);
        setCity(addr.city);
        setState(addr.state);
        setZip(addr.zip);
        setCountry(addr.country);
      }
      setIsGuestMode(false);
    }
  }, [activeCustomerUser, selectedAddressIndex]);

  if (!isOpen) return null;

  // Format time left mm:ss
  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const timerDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  // Card brand detection logic
  const getCardBrand = (numberStr: string) => {
    const cleaned = numberStr.replace(/\D/g, '');
    if (cleaned.startsWith('4')) return { name: 'Visa', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return { name: 'Mastercard', color: 'text-rose-500', bg: 'bg-rose-500/10' };
    if (/^3[47]/.test(cleaned)) return { name: 'Amex', color: 'text-sky-500', bg: 'bg-sky-500/10' };
    if (/^6(?:011|5)/.test(cleaned)) return { name: 'Discover', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    return { name: 'Card', color: 'text-slate-400', bg: 'bg-slate-500/10' };
  };

  const currentBrand = getCardBrand(cardNumber);

  // Calculate totals
  let subtotal = 0;
  let tax = 0;
  storeCart.forEach((item) => {
    const line = item.price * item.quantity;
    subtotal += line;
    tax += line * (item.taxRate / 100);
  });

  let discount = 0;
  if (appliedCoupon) {
    discount =
      appliedCoupon.discountType === 'fixed'
        ? appliedCoupon.value
        : (subtotal * appliedCoupon.value) / 100;
  }

  const shippingFee =
    fulfillmentMethod === 'Express Delivery'
      ? 15
      : fulfillmentMethod === 'Standard Delivery'
      ? subtotal >= 75 || appliedCoupon?.code === 'FREESHIP'
        ? 0
        : 5
      : 0;

  const total = Math.max(0, subtotal - discount + tax + shippingFee);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    const res = applyCoupon(couponInput.trim());
    setCouponMsg({ text: res.message, isError: !res.success });
    if (res.success) setCouponInput('');
  };

  const handleExpressPay = (provider: string) => {
    setIsSubmitting(true);
    setTimeout(() => {
      const order = placeEcommerceOrder({
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          address: { street, city, state, zip, country },
        },
        fulfillmentMethod,
        paymentMethod: 'Fintech Wallet',
        smsOptIn,
        whatsappOptIn,
      });

      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }

      setIsSubmitting(false);
      onOrderSuccess(order);
      onClose();
    }, 1000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) return;

    setIsSubmitting(true);

    setTimeout(() => {
      const selectedPayment: 'Credit Card' | 'Mobile Money' | 'Fintech Wallet' =
        paymentMethod === 'Store Credit' || paymentMethod === 'BNPL' ? 'Fintech Wallet' : paymentMethod;

      const order = placeEcommerceOrder({
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          address: { street, city, state, zip, country },
        },
        fulfillmentMethod,
        paymentMethod: selectedPayment,
        smsOptIn,
        whatsappOptIn,
      });

      try {
        confetti({
          particleCount: 110,
          spread: 85,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }

      setIsSubmitting(false);
      onOrderSuccess(order);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden animate-in zoom-in-95 text-slate-900 dark:text-white max-h-[94vh] flex flex-col">
        {/* Top Header & Security Banner */}
        <div className="px-5 sm:px-8 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-emerald-500 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Lock className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                  Professional Encrypted Checkout
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  <span>256-Bit SSL</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct live inventory allocation & verified instant dispatch
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Live Cart Reservation Timer */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>Items reserved for <strong className="font-mono text-amber-500">{timerDisplay}</strong></span>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Checkout Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content: Responsive 2-Column Layout */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-full">
            
            {/* LEFT COLUMN: Multi-Step Checkout Form (7 cols on lg) */}
            <form onSubmit={handleSubmit} className="lg:col-span-7 p-5 sm:p-7 space-y-7 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
              
              {/* Express One-Touch Checkout Section */}
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Express One-Touch Checkout</span>
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Fastest checkout</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleExpressPay('Apple Pay')}
                    className="py-3 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                  >
                    <span>Pay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExpressPay('Google Pay')}
                    className="py-3 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                  >
                    <span className="text-blue-500 font-extrabold">G</span>
                    <span className="text-slate-700">Pay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExpressPay('Shop Pay')}
                    className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                  >
                    <span>ShopPay</span>
                  </button>
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                  <span className="flex-shrink mx-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Or pay with credit card & shipping details
                  </span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                </div>
              </div>

              {/* STEP 1: Contact Information & Customer Account */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
                      1
                    </span>
                    <span>Contact Information & Account</span>
                  </h4>

                  {/* Account Selector */}
                  <select
                    aria-label="Select Customer Account"
                    value={activeCustomerUser?.id || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setIsGuestMode(true);
                        setActiveCustomerUser(null);
                      } else {
                        const c = customers.find((cust) => cust.id === val);
                        if (c) {
                          setActiveCustomerUser(c);
                          setIsGuestMode(false);
                        }
                      }
                    }}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-1.5 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer font-medium"
                  >
                    <option value="">Guest Checkout Mode</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.tier})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Account Status Card */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center font-bold">
                      {isGuestMode ? <User className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {isGuestMode ? 'Fast Guest Checkout' : `Logged in as ${customerName}`}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isGuestMode
                          ? 'No password required to complete your order'
                          : `Tier Status: ${activeCustomerUser?.tier || 'VIP'} • ${activeCustomerUser?.loyaltyPoints || 0} Reward Points`}
                      </p>
                    </div>
                  </div>
                  {!isGuestMode && activeCustomerUser && (
                    <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-bold border border-sky-500/20">
                      {activeCustomerUser.tier} Member
                    </span>
                  )}
                </div>

                {/* Contact Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Taylor Reed"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="receipts@example.com"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Mobile Phone <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Instant Order Tracking Preferences */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Order Tracking Alerts
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={smsOptIn}
                        onChange={(e) => setSmsOptIn(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                      />
                      <span>SMS Dispatch & Delivery Alerts</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={whatsappOptIn}
                        onChange={(e) => setWhatsappOptIn(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <span>WhatsApp Live Courier Map Link</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* STEP 2: Shipping Destination & Address Selection */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
                      2
                    </span>
                    <span>Shipping Destination</span>
                  </h4>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-500" />
                    <span>Deliver to door</span>
                  </span>
                </div>

                {/* Saved Addresses Chips for Logged In Customer */}
                {!isGuestMode && activeCustomerUser?.addresses && activeCustomerUser.addresses.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Saved Address Book
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeCustomerUser.addresses.map((addr, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedAddressIndex(idx);
                            setStreet(addr.street);
                            setCity(addr.city);
                            setState(addr.state);
                            setZip(addr.zip);
                            setCountry(addr.country);
                          }}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedAddressIndex === idx
                              ? 'bg-sky-500/10 border-sky-500 text-slate-900 dark:text-white font-semibold ring-1 ring-sky-500/30'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white mb-0.5">
                            <span>{addr.isDefault ? 'Primary Address' : `Saved Address #${idx + 1}`}</span>
                            {selectedAddressIndex === idx && <Check className="w-3.5 h-3.5 text-sky-500" />}
                          </div>
                          <p className="truncate text-[11px]">{addr.street}</p>
                          <p className="text-[11px] text-slate-500">{addr.city}, {addr.state} {addr.zip}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Address Form Inputs */}
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Street Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="742 Evergreen Terrace"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Apt / Suite / Bldg (Optional)
                      </label>
                      <input
                        type="text"
                        value={apartment}
                        onChange={(e) => setApartment(e.target.value)}
                        placeholder="Apt 4B"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        City <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Springfield"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        State / Prov <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="OR"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        ZIP / Postal Code <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        placeholder="97477"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 3: Fulfillment & Shipping Options */}
              <div className="space-y-4 pt-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
                    3
                  </span>
                  <span>Delivery Speed & Speed Options</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Standard Shipping */}
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod('Standard Delivery')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                      fulfillmentMethod === 'Standard Delivery'
                        ? 'bg-sky-500/10 border-sky-500 text-slate-900 dark:text-white ring-1 ring-sky-500/30 shadow-md'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <Truck className="w-4 h-4 text-sky-500" />
                        <span>Standard Courier</span>
                      </div>
                      {fulfillmentMethod === 'Standard Delivery' && <Check className="w-4 h-4 text-sky-500" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">3–5 Business Days</p>
                    <span className="text-xs font-bold">
                      {subtotal >= 75 || appliedCoupon?.code === 'FREESHIP' ? (
                        <strong className="text-emerald-600 dark:text-emerald-400">FREE Dispatch</strong>
                      ) : (
                        '$5.00 Flat Rate'
                      )}
                    </span>
                  </button>

                  {/* Express Priority */}
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod('Express Delivery')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                      fulfillmentMethod === 'Express Delivery'
                        ? 'bg-sky-500/10 border-sky-500 text-slate-900 dark:text-white ring-1 ring-sky-500/30 shadow-md'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <span>Priority Overnight</span>
                      </div>
                      {fulfillmentMethod === 'Express Delivery' && <Check className="w-4 h-4 text-sky-500" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">1–2 Business Days</p>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">$15.00 Priority</span>
                  </button>

                  {/* In-Store Pickup */}
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod('In-Store Pickup')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                      fulfillmentMethod === 'In-Store Pickup'
                        ? 'bg-sky-500/10 border-sky-500 text-slate-900 dark:text-white ring-1 ring-sky-500/30 shadow-md'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <Building2 className="w-4 h-4 text-emerald-500" />
                        <span>In-Store Pickup</span>
                      </div>
                      {fulfillmentMethod === 'In-Store Pickup' && <Check className="w-4 h-4 text-sky-500" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Ready in 2 Hours</p>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">FREE Collection</span>
                  </button>
                </div>
              </div>

              {/* STEP 4: Payment Gateway & Details */}
              <div className="space-y-4 pt-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
                    4
                  </span>
                  <span>Payment Gateway</span>
                </h4>

                {/* Payment Method Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Credit Card')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                      paymentMethod === 'Credit Card'
                        ? 'bg-sky-500/15 border-sky-500 text-slate-900 dark:text-white font-bold ring-1 ring-sky-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-sky-500" />
                    <span>Credit Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('BNPL')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                      paymentMethod === 'BNPL'
                        ? 'bg-sky-500/15 border-sky-500 text-slate-900 dark:text-white font-bold ring-1 ring-sky-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-pink-500" />
                    <span>BNPL Pay 4</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Mobile Money')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                      paymentMethod === 'Mobile Money'
                        ? 'bg-sky-500/15 border-sky-500 text-slate-900 dark:text-white font-bold ring-1 ring-sky-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-emerald-500" />
                    <span>Mobile Pay</span>
                  </button>

                  <button
                    type="button"
                    disabled={!activeCustomerUser || (activeCustomerUser.storeCredit || 0) < 1}
                    onClick={() => setPaymentMethod('Store Credit')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 ${
                      paymentMethod === 'Store Credit'
                        ? 'bg-sky-500/15 border-sky-500 text-slate-900 dark:text-white font-bold ring-1 ring-sky-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Gift className="w-4 h-4 text-amber-500" />
                    <span>Store Credit</span>
                  </button>
                </div>

                {/* Credit Card Detailed Form */}
                {paymentMethod === 'Credit Card' && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs animate-in fade-in duration-150">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-slate-700 dark:text-slate-300 font-bold">Card Number</label>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${currentBrand.bg} ${currentBrand.color}`}>
                          {currentBrand.name}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="4242 •••• •••• 4242"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                        />
                        <CreditCard className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Cardholder Name</label>
                        <input
                          type="text"
                          required
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value)}
                          placeholder="Name on Card"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Expires (MM/YY)</label>
                        <input
                          type="text"
                          required
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="08/28"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-center text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Security CVC</label>
                        <input
                          type="text"
                          required
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          placeholder="982"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-center text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveCard}
                          onChange={(e) => setSaveCard(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[11px]">Save encrypted card for future 1-click orders</span>
                      </label>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>PCI-DSS Level 1</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* BNPL Afterpay Option */}
                {paymentMethod === 'BNPL' && (
                  <div className="p-4 bg-pink-500/10 border border-pink-500/30 rounded-2xl text-xs space-y-2">
                    <p className="font-bold text-pink-700 dark:text-pink-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-pink-500" />
                      <span>Klarna & Afterpay 4 Interest-Free Installments</span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Pay 4 equal bi-weekly payments of <strong>{formatCurrency(total / 4)}</strong> with zero fees when paid on time. First payment due today.
                    </p>
                  </div>
                )}

                {/* Store Credit Option */}
                {paymentMethod === 'Store Credit' && activeCustomerUser && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs space-y-1">
                    <p className="font-bold text-amber-700 dark:text-amber-300">
                      Store Credit Balance: {formatCurrency(activeCustomerUser.storeCredit || 0)}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                      Your order total of {formatCurrency(total)} will be deducted directly from your store credit balance upon confirmation.
                    </p>
                  </div>
                )}
              </div>

              {/* STEP 5: Order Notes & Gift Options */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isGift}
                      onChange={(e) => setIsGift(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                    <Gift className="w-4 h-4 text-sky-500" />
                    <span>This order contains a gift (Free Gift Wrap & Greeting Card)</span>
                  </label>
                </div>

                {isGift && (
                  <textarea
                    rows={2}
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    placeholder="Write your personal gift message here..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                  />
                )}

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold mb-1">
                    Special Delivery Instructions / Notes
                  </label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="e.g. Leave package with front desk / Call upon arrival"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Terms Agreement Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      required
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-[11px] leading-relaxed">
                      I agree to the <strong>Terms of Sale</strong>, refund policies, and confirm that my shipping details are accurate.
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit Main Order Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting || !agreeTerms || storeCart.length === 0}
                  className="w-full py-4 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:opacity-95 text-white rounded-2xl text-sm font-black shadow-xl shadow-sky-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSubmitting ? 'Processing Secure Checkout...' : `Confirm & Pay ${formatCurrency(total)}`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </form>

            {/* RIGHT COLUMN: Sticky Order Summary & Coupon Engine (5 cols on lg) */}
            <div className="lg:col-span-5 p-5 sm:p-7 bg-slate-50/80 dark:bg-slate-950/50 space-y-6 flex flex-col justify-between">
              
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h4 className="font-black text-sm text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Tag className="w-4 h-4 text-sky-500" />
                    <span>Order Summary ({storeCart.reduce((s, i) => s + i.quantity, 0)} Items)</span>
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Live Reserved
                  </span>
                </div>

                {/* Line Items List */}
                <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                  {storeCart.map((item) => (
                    <div
                      key={item.variantId}
                      className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3 shadow-xs"
                    >
                      {/* Thumbnail */}
                      <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-950 overflow-hidden flex-shrink-0 relative border border-slate-200 dark:border-slate-800">
                        <img
                          src={item.image}
                          alt={item.productName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 right-1 bg-slate-900 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md">
                          {item.quantity}
                        </span>
                      </div>

                      {/* Product details */}
                      <div className="flex-1 min-w-0 text-xs">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{item.productName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.variantName} • SKU: {item.sku}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">In Stock • Allocated</p>
                      </div>

                      {/* Line Price */}
                      <div className="text-right flex-shrink-0 text-xs">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-slate-400">
                            {formatCurrency(item.price)} ea
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon Code Engine */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">Promo Code or Voucher</span>
                    <span className="text-[10px] text-sky-500 font-semibold">1 Coupon per order</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. WELCOME20, FREESHIP"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white uppercase placeholder:text-slate-400 font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Available Vouchers Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-400 font-semibold">Available:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCouponInput('WELCOME20');
                        applyCoupon('WELCOME20');
                      }}
                      className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      WELCOME20 ($20 OFF)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCouponInput('FREESHIP');
                        applyCoupon('FREESHIP');
                      }}
                      className="px-2 py-0.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      FREESHIP
                    </button>
                  </div>

                  {/* Applied Coupon Banner */}
                  {appliedCoupon && (
                    <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-semibold">
                      <span>
                        Coupon <strong>{appliedCoupon.code}</strong> applied (-{formatCurrency(discount)})
                      </span>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer ml-2"
                        aria-label="Remove Coupon"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {couponMsg && !appliedCoupon && (
                    <p className={`text-[11px] ${couponMsg.isError ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {couponMsg.text}
                    </p>
                  )}
                </div>

                {/* Costs Breakdown */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Items Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                      <span>Promotional Discount</span>
                      <span>-{formatCurrency(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <span>Estimated Sales Tax</span>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                    <span>{formatCurrency(tax)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Fulfillment ({fulfillmentMethod})</span>
                    <span>
                      {shippingFee === 0 ? (
                        <strong className="text-emerald-600 dark:text-emerald-400">FREE</strong>
                      ) : (
                        formatCurrency(shippingFee)
                      )}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-baseline">
                    <div>
                      <span className="text-base font-black text-slate-900 dark:text-white">Total Amount</span>
                      <p className="text-[10px] text-slate-400">Includes all taxes & delivery fees</p>
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Guarantees & Trust Footnote */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>30-Day Money Back</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span>Same-Day Dispatch</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span>256-Bit SSL Security</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span>Authentic Guarantee</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
