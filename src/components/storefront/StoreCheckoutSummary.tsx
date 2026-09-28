import React from 'react';
import * as Icons from 'lucide-react';

interface StoreCheckoutSummaryProps { checkout: Record<string, any>; }

export const StoreCheckoutSummary: React.FC<StoreCheckoutSummaryProps> = ({ checkout }) => {
  const { fulfillmentMethod, couponInput, setCouponInput, couponMsg, discountCode, setDiscountCode, setCouponMsg, storeCart, total, subtotal, tax, shippingFee, displayCurrency, handleApplyCoupon } = checkout;
  return (
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
                          alt={item.productName || item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 right-1 bg-slate-900 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md">
                          {item.quantity}
                        </span>
                      </div>

                      {/* Product details */}
                      <div className="flex-1 min-w-0 text-xs">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{item.productName || item.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.variantName} • SKU: {item.sku}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">In Stock • Allocated</p>
                      </div>

                      {/* Line Price */}
                      <div className="text-right flex-shrink-0 text-xs">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {displayCurrency(item.price * item.quantity)}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-slate-400">
                            {displayCurrency(item.price)} ea
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
                    <span className="text-[10px] text-sky-500 font-semibold">Validated at checkout</span>
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
                    <span className="text-[10px] text-slate-400 font-semibold">Examples:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCouponInput('WELCOME20');

                      }}
                      className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      WELCOME20 ($20 OFF)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCouponInput('FREESHIP');

                      }}
                      className="px-2 py-0.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      FREESHIP
                    </button>
                  </div>

                  {/* Applied Coupon Banner */}
                  {discountCode && (
                    <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-semibold">
                      <span>
                        Coupon <strong>{discountCode}</strong> submitted for server validation
                      </span>
                      <button
                        type="button"
                        onClick={() => { setDiscountCode(''); setCouponMsg(null); }}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer ml-2"
                        aria-label="Remove Coupon"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {couponMsg && (
                    <p className={`text-[11px] ${couponMsg.isError ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {couponMsg.text}
                    </p>
                  )}
                </div>

                {/* Costs Breakdown */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Items Subtotal</span>
                    <span>{displayCurrency(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                      <span>Promotional Discount</span>
                      <span>-{displayCurrency(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <span>Estimated Sales Tax</span>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                    <span>{displayCurrency(tax)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Fulfillment ({fulfillmentMethod})</span>
                    <span>
                      {shippingFee === 0 ? (
                        <strong className="text-emerald-600 dark:text-emerald-400">FREE</strong>
                      ) : (
                        displayCurrency(shippingFee)
                      )}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-baseline">
                    <div>
                      <span className="text-base font-black text-slate-900 dark:text-white">Total Amount</span>
                      <p className="text-[10px] text-slate-400">Includes all taxes & delivery fees</p>
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                      {displayCurrency(total)}
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
  );
};
