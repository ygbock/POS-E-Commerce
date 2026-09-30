import React from 'react';
import * as Icons from 'lucide-react';

interface StoreCheckoutSummaryProps { checkout: Record<string, any>; }

export const StoreCheckoutSummary: React.FC<StoreCheckoutSummaryProps> = ({ checkout }) => {
  const { fulfillmentMethod, storeCart, total, subtotal, tax, shippingFee, discount, cartValidation, displayCurrency, handleApplyCoupon } = checkout;
  return (<div className="lg:col-span-5 p-5 sm:p-7 bg-slate-50/80 dark:bg-slate-950/50 space-y-6 flex flex-col justify-between">
              
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h4 className="font-black text-sm text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Icons.Tag className="w-4 h-4 text-sky-500" />
                    <span>Order Summary ({storeCart.reduce((s, i) => s + i.quantity, 0)} Items)</span>
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Availability verified
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
                          {displayCurrency(Number(cartValidation?.items.find((validated) => validated.variantId === item.variantId)?.lineTotal || item.price * item.quantity))}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-slate-400">
                            {displayCurrency(Number(cartValidation?.items.find((validated) => validated.variantId === item.variantId)?.unitPrice || item.price))} ea
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
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
                      <Icons.Info className="w-3.5 h-3.5 text-slate-400" />
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

              {/* Store policy note */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Icons.ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Checkout pricing, availability, and fulfillment fees are verified by the store server.</span>
                </div>
              </div>
            </div>
                  <div className="flex items-center gap-2">
                    <Icons.Truck className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span>Same-Day Dispatch</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.Lock className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span>256-Bit SSL Security</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.CheckCircle2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span>Authentic Guarantee</span>
                  </div>
                </div>
              </div>

            </div>
  );
};
