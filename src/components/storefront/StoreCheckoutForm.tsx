import React from 'react';
import * as Icons from 'lucide-react';

interface StoreCheckoutFormProps { checkout: Record<string, any>; }

export const StoreCheckoutForm: React.FC<StoreCheckoutFormProps> = ({ checkout }) => {
  const { activeCustomerUser, customers, setActiveCustomerUser, isGuestMode, setIsGuestMode, customerName, setCustomerName, customerEmail, setCustomerEmail, customerPhone, setCustomerPhone, street, setStreet, apartment, setApartment, city, setCity, state, setState, zip, setZip, setCountry, selectedAddressIndex, setSelectedAddressIndex, fulfillmentMethod, setFulfillmentMethod, paymentMethod, setPaymentMethod, cardNumber, setCardNumber, cardHolder, setCardHolder, cardExpiry, setCardExpiry, cardCvc, setCardCvc, saveCard, setSaveCard, discountCode, smsOptIn, setSmsOptIn, whatsappOptIn, setWhatsappOptIn, isGift, setIsGift, giftMessage, setGiftMessage, orderNotes, setOrderNotes, agreeTerms, setAgreeTerms, isSubmitting, errorMsg, storeCart, total, subtotal, displayCurrency, currentBrand, handleExpressPay, handleSubmit } = checkout;
  return (
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
                            setState('');
                            setZip(addr.zip);
                            setCountry('');
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
                          <p className="text-[11px] text-slate-500">{addr.city}, {addr.zip}</p>
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
                      {subtotal >= 75 || discountCode?.code === 'FREESHIP' ? (
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
                    disabled={!activeCustomerUser || (activeCustomerUser.storeCreditBalance || 0) < 1}
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
                      Pay 4 equal bi-weekly payments of <strong>{displayCurrency(total / 4)}</strong> with zero fees when paid on time. First payment due today.
                    </p>
                  </div>
                )}

                {/* Store Credit Option */}
                {paymentMethod === 'Store Credit' && activeCustomerUser && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs space-y-1">
                    <p className="font-bold text-amber-700 dark:text-amber-300">
                      Store Credit Balance: {displayCurrency(activeCustomerUser.storeCreditBalance || 0)}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                      Your order total of {displayCurrency(total)} will be deducted directly from your store credit balance upon confirmation.
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

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-rose-600 dark:text-rose-400 text-xs">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit Main Order Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting || !agreeTerms || storeCart.length === 0}
                  className="w-full py-4 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:opacity-95 text-white rounded-2xl text-sm font-black shadow-xl shadow-sky-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSubmitting ? 'Processing Secure Checkout...' : `Confirm & Pay ${displayCurrency(total)}`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </form>
  );
};
