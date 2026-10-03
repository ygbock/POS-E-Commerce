import React, { useState, useRef } from 'react';
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
import { useStorefrontContext } from '../../context/StorefrontContext';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

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
  const { storeCart, updateStoreCartQty, removeFromStoreCart, formatCurrency } = useStorefrontContext();


  const drawerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, drawerRef);

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
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-cart-drawer-title"
        tabIndex={-1}
        className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md h-full flex flex-col justify-between p-5 text-slate-900 dark:text-white shadow-2xl animate-in slide-in-from-right duration-200 focus:outline-none"
      >
        {/* Drawer Header */}
        <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 id="store-cart-drawer-title" className="text-sm font-bold text-slate-900 dark:text-white">Your Shopping Cart</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{cartItemsCount} items in cart</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close cart drawer"
            className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                    alt={item.productName || item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 dark:text-white truncate text-xs">{item.productName || item.name}</h4>
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
            {/* Server-authoritative totals */}
            <div className="space-y-1.5 text-xs bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Items</span><span className="font-semibold text-slate-900 dark:text-white">{cartItemsCount}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Final price, discounts, tax, shipping, and total are validated by the server at checkout.</p>
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
