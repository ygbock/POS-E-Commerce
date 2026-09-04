import React, { useState } from 'react';
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  Trash2,
  Tag,
  ArrowRight,
  Truck,
  Sparkles,
  Check,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface StoreCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout: () => void;
}

export const StoreCartDrawer: React.FC<StoreCartDrawerProps> = ({
  isOpen,
  onClose,
  onProceedToCheckout,
}) => {
  const {
    storeCart,
    updateStoreCartQty,
    removeFromStoreCart,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    formatCurrency,
  } = useCommerce();

  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  // Cart math
  let cartSubtotal = 0;
  let cartItemsCount = 0;
  storeCart.forEach((item) => {
    cartSubtotal += item.price * item.quantity;
    cartItemsCount += item.quantity;
  });

  let couponDiscount = 0;
  if (appliedCoupon) {
    couponDiscount =
      appliedCoupon.discountType === 'fixed'
        ? appliedCoupon.value
        : (cartSubtotal * appliedCoupon.value) / 100;
  }

  const freeShippingThreshold = 75;
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - cartSubtotal);
  const freeShippingProgress = Math.min(100, (cartSubtotal / freeShippingThreshold) * 100);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    const res = applyCoupon(couponInput.trim());
    setCouponMsg({ text: res.message, isError: !res.success });
    if (res.success) setCouponInput('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md h-full flex flex-col justify-between p-5 text-slate-900 dark:text-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Your Shopping Cart</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{cartItemsCount} items in cart</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Shipping Progress Bar */}
        {cartItemsCount > 0 && (
          <div className="py-2.5 px-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 my-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                <Truck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {amountToFreeShipping > 0
                  ? `Add ${formatCurrency(amountToFreeShipping)} more for FREE Dispatch`
                  : 'You unlocked FREE Express Dispatch!'}
              </span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{Math.round(freeShippingProgress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-500"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 py-2 custom-scrollbar">
          {storeCart.length === 0 ? (
            <div className="py-24 text-center text-slate-500 text-xs space-y-3">
              <ShoppingCart className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
              <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Your shopping bag is empty</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Explore our catalog of precision electronics, kitchen craft, and provisions.
              </p>
            </div>
          ) : (
            storeCart.map((item) => (
              <div key={item.variantId} className="py-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="w-14 h-14 rounded-xl bg-slate-50 dark:bg-slate-950 overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-800">
                  <img
                    src={item.image}
                    alt={item.productName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 dark:text-white truncate text-xs">{item.productName}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.variantName}</p>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {formatCurrency(item.price)}
                  </p>
                </div>

                {/* Qty Stepper */}
                <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => updateStoreCartQty(item.variantId, item.quantity - 1)}
                    className="w-8 h-8 sm:w-7 sm:h-7 rounded flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold"
                  >
                    <Minus className="w-4 h-4 sm:w-3 sm:h-3" />
                  </button>
                  <span className="w-6 sm:w-5 text-center font-bold text-slate-900 dark:text-white text-xs">{item.quantity}</span>
                  <button
                    onClick={() => updateStoreCartQty(item.variantId, item.quantity + 1)}
                    className="w-8 h-8 sm:w-7 sm:h-7 rounded flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold"
                  >
                    <Plus className="w-4 h-4 sm:w-3 sm:h-3" />
                  </button>
                </div>

                <button
                  onClick={() => removeFromStoreCart(item.variantId)}
                  className="text-slate-400 hover:text-rose-500 transition-colors p-2 sm:p-1 ml-1"
                  title="Remove item"
                >
                  <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Cart Drawer Footer */}
        {storeCart.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            {/* Coupon Code Form & Quick Selectors */}
            <form onSubmit={handleApplyCoupon} className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Coupon code (e.g. WELCOME20, GUEST5)"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white uppercase placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-900 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Apply
                </button>
              </div>

              {/* Quick Coupon Chips */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-500 font-semibold">Available:</span>
                <button
                  type="button"
                  onClick={() => {
                    setCouponInput('WELCOME20');
                    applyCoupon('WELCOME20');
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold transition-colors"
                >
                  WELCOME20 ($20 OFF)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCouponInput('GUEST5');
                    applyCoupon('GUEST5');
                  }}
                  className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold transition-colors"
                >
                  GUEST5 ($5 OFF)
                </button>
              </div>

              {appliedCoupon && (
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-500/30 px-3 py-1.5 rounded-xl">
                  <span className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      Coupon <strong>{appliedCoupon.code}</strong> applied (-{formatCurrency(couponDiscount)})
                    </span>
                  </span>
                  <button type="button" onClick={removeCoupon} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
                    ✕
                  </button>
                </div>
              )}

              {couponMsg && !appliedCoupon && (
                <p className={`text-[11px] ${couponMsg.isError ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {couponMsg.text}
                </p>
              )}
            </form>

            {/* Totals Breakdown */}
            <div className="space-y-1.5 text-xs bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Cart Subtotal</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(cartSubtotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Coupon Savings</span>
                  <span>-{formatCurrency(couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Estimated Total</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(Math.max(0, cartSubtotal - couponDiscount))}
                </span>
              </div>
            </div>

            {/* Checkout Action */}
            <button
              id="btn-store-proceed-checkout"
              onClick={() => {
                onClose();
                onProceedToCheckout();
              }}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
