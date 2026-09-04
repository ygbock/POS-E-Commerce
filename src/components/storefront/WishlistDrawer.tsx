import React from 'react';
import {
  Heart,
  X,
  ShoppingCart,
  Trash2,
  ArrowRight,
  Plus,
  Check,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Product } from '../../types';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onOpenCart: () => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
  onOpenCart,
}) => {
  const {
    wishlist,
    products,
    toggleWishlist,
    addToStoreCart,
    getTotalStockForVariant,
    formatCurrency,
  } = useCommerce();

  if (!isOpen) return null;

  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  const handleMoveAllToCart = () => {
    wishlistedProducts.forEach((p) => {
      const variant = p.variants[0];
      const stock = getTotalStockForVariant(variant);
      if (stock > 0) {
        addToStoreCart(p, variant, 1);
      }
    });
    onClose();
    onOpenCart();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md h-full flex flex-col justify-between p-5 text-slate-900 dark:text-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="pb-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Heart className="w-4 h-4 fill-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Your Saved Wishlist</h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">{wishlistedProducts.length} saved items</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wishlist Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800/80 py-3 custom-scrollbar">
          {wishlistedProducts.length === 0 ? (
            <div className="py-24 text-center text-slate-500 text-xs space-y-3">
              <Heart className="w-12 h-12 mx-auto text-slate-700 stroke-1" />
              <p className="font-semibold text-slate-600 dark:text-slate-400 text-sm">Your wishlist is empty</p>
              <p className="text-[11px] max-w-xs mx-auto text-slate-500">
                Click the heart icon on any product to save your favorite items for later.
              </p>
            </div>
          ) : (
            wishlistedProducts.map((product) => {
              const primaryVariant = product.variants[0];
              const totalStock = getTotalStockForVariant(primaryVariant);
              const isOutOfStock = totalStock <= 0;

              return (
                <div key={product.id} className="py-3.5 flex items-center justify-between gap-3 group">
                  {/* Thumbnail */}
                  <div
                    onClick={() => {
                      onSelectProduct(product);
                      onClose();
                    }}
                    className="w-14 h-14 rounded-xl bg-slate-50 dark:bg-slate-950 overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-800 cursor-pointer relative"
                  >
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">{product.brand}</p>
                    <h4
                      onClick={() => {
                        onSelectProduct(product);
                        onClose();
                      }}
                      className="font-semibold text-xs text-slate-900 dark:text-white truncate cursor-pointer hover:text-sky-300 transition-colors"
                    >
                      {product.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {formatCurrency(primaryVariant.retailPrice)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          totalStock > 0
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-rose-400 bg-rose-500/10'
                        }`}
                      >
                        {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    <button
                      disabled={isOutOfStock}
                      onClick={() => {
                        addToStoreCart(product, primaryVariant, 1);
                      }}
                      className="p-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-30 text-slate-900 dark:text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow transition-colors"
                      title="Add to cart"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => toggleWishlist(product.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                      title="Remove from wishlist"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Wishlist Drawer Footer */}
        {wishlistedProducts.length > 0 && (
          <div className="pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <button
              onClick={handleMoveAllToCart}
              className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-slate-900 dark:text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center justify-center gap-2 transition-all"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Move Available Items to Cart</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
