import React, { useEffect, useRef, useState } from 'react';
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  Truck,
} from 'lucide-react';
import { storefrontApi, type StorefrontCartValidation } from '../../services/storefrontApi';
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
  const { tenant, storeCart, updateStoreCartQty, removeFromStoreCart, formatCurrency } = useStorefrontContext();

  const [cartValidation, setCartValidation] = useState<StorefrontCartValidation | null>(null);
  const [cartValidationError, setCartValidationError] = useState<string | null>(null);
  const [isValidatingCart, setIsValidatingCart] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, drawerRef);

  useEffect(() => {
    let cancelled = false;

    if (!isOpen || !tenant?.slug || storeCart.length === 0) {
      setCartValidation(null);
      setCartValidationError(null);
      setIsValidatingCart(false);
      return;
    }

    setIsValidatingCart(true);
    setCartValidationError(null);

    storefrontApi
      .validateCart(
        tenant.slug,
        storeCart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      )
      .then((validation) => {
        if (cancelled) return;
        setCartValidation(validation);
      })
      .catch((error) => {
        if (cancelled) return;
        setCartValidation(null);
        setCartValidationError(error instanceof Error ? error.message : 'Unable to validate your cart.');
      })
      .finally(() => {
        if (!cancelled) setIsValidatingCart(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, tenant?.slug, storeCart]);

  if (!isOpen) return null;

  const cartItemsCount = storeCart.reduce((count, item) => count + item.quantity, 0);
  const serverItemsByVariant = new Map<string, StorefrontCartValidation['items'][number]>(
    (cartValidation?.items || []).map((item) => [item.variantId, item]),
  );
  const cartSubtotal = Number(cartValidation?.subtotal || 0);
  const shippingFee = Number(cartValidation?.shippingFee || 0);
  const cartTax = Number(cartValidation?.tax || 0);
  const cartTotal = Number(cartValidation?.total || 0);
  const amountToFreeShipping = Number(cartValidation?.amountToFreeShipping || 0);
  const freeShippingThreshold = Number(cartValidation?.freeShippingThreshold || 0);
  const freeShippingProgress =
    freeShippingThreshold > 0
      ? Math.min(100, Math.max(0, (cartSubtotal / freeShippingThreshold) * 100))
      : 0;
  const canProceedToCheckout =
    storeCart.length > 0 &&
    !isValidatingCart &&
    !!cartValidation &&
    !cartValidationError &&
    cartValidation.items.every((item) => item.isAvailable);

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
                    alt={item.productName || item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 dark:text-white truncate text-xs">{item.productName || item.name}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.variantName}</p>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {formatCurrency(Number(serverItemsByVariant.get(item.variantId)?.unitPrice || item.price))}
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
            {isValidatingCart && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Validating prices, stock, tax, and shipping…</p>
            )}
            {cartValidationError && (
              <p className="text-[11px] text-rose-500 dark:text-rose-400">{cartValidationError}</p>
            )}
            {cartValidation && !cartValidationError && cartValidation.items.some((item) => !item.isAvailable) && (
              <p className="text-[11px] text-rose-500 dark:text-rose-400">
                One or more items are no longer available in the requested quantity. Update your cart before checkout.
              </p>
            )}

            {/* Totals Breakdown */}
            <div className="space-y-1.5 text-xs bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Cart Subtotal</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Shipping</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(shippingFee)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tax</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(cartTax)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Server-Calculated Total</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            {/* Checkout Action */}
            <button
              id="btn-store-proceed-checkout"
              disabled={!canProceedToCheckout}
              onClick={() => {
                if (!canProceedToCheckout) return;
                onClose();
                onProceedToCheckout();
              }}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all"
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
