import React, { useState, useEffect } from 'react';
import {
  Product,
  ProductVariant,
} from '../../types';
import { useCommerce } from '../../context/CommerceContext';
import {
  Star,
  ShieldCheck,
  Truck,
  ArrowRight,
  X,
  ShoppingCart,
  Heart,
  RotateCcw,
  Sparkles,
  Flame,
  Check,
  Building2,
  Zap,
  Eye,
  Plus,
  Minus,
  CheckCircle2,
} from 'lucide-react';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, variant: ProductVariant, qty: number) => void;
  onBuyNow: (product: Product, variant: ProductVariant, qty: number) => void;
  onOpenFullDetail?: (product: Product) => void;
  onViewFullDetails?: (product: Product) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
  onBuyNow,
  onOpenFullDetail,
  onViewFullDetails,
}) => {
  const {
    formatCurrency,
    getTotalStockForVariant,
    locations,
    wishlist,
    toggleWishlist,
    isInWishlist,
  } = useCommerce();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addedAnimation, setAddedAnimation] = useState(false);

  // Sync state when product changes
  useEffect(() => {
    if (product && product.variants.length > 0) {
      setSelectedVariant(product.variants[0]);
      setActiveImageIndex(0);
      setQuantity(1);
      setAddedAnimation(false);
    }
  }, [product]);

  if (!isOpen || !product || !selectedVariant) return null;

  const availableStock = getTotalStockForVariant(selectedVariant);
  const isOutOfStock = availableStock <= 0;
  const isWishlisted = isInWishlist(product.id);

  // Price calculations
  const price = selectedVariant.retailPrice;
  const compareAtPrice = selectedVariant.compareAtPrice || (product.compareAtPrice ? product.compareAtPrice : null);
  const discountPercent =
    compareAtPrice && compareAtPrice > price
      ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
      : null;

  const handleAdd = () => {
    if (isOutOfStock) return;
    onAddToCart(product, selectedVariant, quantity);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 2000);
  };

  const handleBuy = () => {
    if (isOutOfStock) return;
    onBuyNow(product, selectedVariant, quantity);
  };

  return (
    <div
      id="modal-product-quick-view"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-black uppercase tracking-wider text-sky-400">{product.brand}</span>
            <span>•</span>
            <span>{product.category}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline font-mono text-[11px]">SKU: {selectedVariant.sku}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                if (onOpenFullDetail) {
                  onOpenFullDetail(product);
                } else if (onViewFullDetails) {
                  onViewFullDetails(product);
                }
              }}
              className="text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 transition-colors"
            >
              <span>Full Details & Specs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-7 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8">
            {/* Left Column: Image Gallery Preview */}
            <div className="md:col-span-6 space-y-3.5">
              <div className="relative aspect-square w-full rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden group">
                <img
                  src={product.images[activeImageIndex] || product.images[0]}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
                  {discountPercent && discountPercent > 0 && (
                    <span className="inline-flex items-center gap-1 bg-rose-600 text-slate-900 dark:text-white text-xs font-black px-2.5 py-1 rounded-lg shadow-lg">
                      <Flame className="w-3.5 h-3.5" />
                      <span>-{discountPercent}% OFF</span>
                    </span>
                  )}
                  {product.featured && (
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-sky-500 to-indigo-500 text-slate-950 text-xs font-black px-2.5 py-1 rounded-lg shadow-lg">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>FEATURED</span>
                    </span>
                  )}
                </div>

                {/* Wishlist button */}
                <button
                  onClick={() => toggleWishlist(product.id)}
                  className={`absolute top-3 right-3 p-2.5 rounded-xl backdrop-blur-md transition-all z-10 ${
                    isWishlisted
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                      : 'bg-slate-100/80 dark:bg-slate-900/80 border border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800'
                  }`}
                  title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                >
                  <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-400 text-rose-400' : ''}`} />
                </button>
              </div>

              {/* Gallery Row: Thumbnails and Trust Badges in the exact same row */}
              <div className="flex items-center justify-between gap-3 pt-1">
                {product.images.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar snap-x flex-1 min-w-0">
                    {product.images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImageIndex(idx)}
                        className={`w-14 h-14 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950 border-2 flex-shrink-0 transition-all cursor-pointer ${
                          activeImageIndex === idx ? 'border-sky-400 shadow-md shadow-sky-500/20 scale-105' : 'border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1" />
                )}

                {/* Trust Badges - In the same row as gallery */}
                <div className="flex items-center justify-end flex-nowrap gap-2.5 sm:gap-4 text-[10px] sm:text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap flex-shrink-0 ml-auto">
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                    <Truck className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                    <span>Free Express Dispatch</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                    <span>2-Year Warranty</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Configuration & Purchase Actions */}
            <div className="md:col-span-6 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex items-center text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${
                          i < Math.floor(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{product.rating.toFixed(1)}</span>
                  <span className="text-xs text-slate-500">({product.reviewCount} customer reviews)</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug">
                  {product.name}
                </h1>
              </div>

              {/* Price Row */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(price)}</span>
                    {compareAtPrice && compareAtPrice > price && (
                      <span className="text-sm text-slate-500 line-through">
                        {formatCurrency(compareAtPrice)}
                      </span>
                    )}
                  </div>
                  {discountPercent && discountPercent > 0 && (
                    <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                      You save {formatCurrency(compareAtPrice! - price)} ({discountPercent}% discount)
                    </p>
                  )}
                </div>

                {/* Live Stock Badge */}
                <div className="text-right">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                      availableStock > 5
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        : availableStock > 0
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${availableStock > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>{availableStock > 0 ? `${availableStock} in stock` : 'Out of Stock'}</span>
                  </span>
                </div>
              </div>

              {/* Description preview */}
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {product.shortDescription || product.description}
              </p>

              {/* Variant Selector */}
              {product.variants.length > 1 && (
                <div className="space-y-2 pt-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center justify-between">
                    <span>Select Variant / Model</span>
                    <span className="text-sky-400 font-normal">{selectedVariant.name}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {product.variants.map((v) => {
                      const vStock = getTotalStockForVariant(v);
                      const isSelected = selectedVariant.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVariant(v);
                            setQuantity(1);
                          }}
                          className={`p-2.5 rounded-xl text-left border transition-all ${
                            isSelected
                              ? 'bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border-sky-400 text-slate-900 dark:text-white ring-1 ring-sky-400/30'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="truncate">{v.name}</span>
                            <span className="text-sky-300 ml-1">{formatCurrency(v.retailPrice)}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {vStock > 0 ? `${vStock} available` : 'Backorder'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Multi-Location Stock Info */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <Building2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                  <span>Omnichannel Stock Availability</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
                  {locations.map((loc) => {
                    const stockAtLoc = selectedVariant.stockByLocation[loc.id] || 0;
                    return (
                      <div key={loc.id} className="flex items-center justify-between p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 min-w-0">
                        <span className="truncate mr-1 text-slate-700 dark:text-slate-300 font-medium">{loc.name}:</span>
                        <strong className={`flex-shrink-0 font-bold ${stockAtLoc > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {stockAtLoc > 0 ? `${stockAtLoc} units` : '0 units'}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quantity & CTA Buttons */}
              <div className="pt-2 space-y-3">
                <div className="flex items-center gap-3">
                  {/* Quantity Counter */}
                  <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
                    <button
                      type="button"
                      disabled={quantity <= 1 || isOutOfStock}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center font-bold text-xs text-slate-900 dark:text-white">{quantity}</span>
                    <button
                      type="button"
                      disabled={quantity >= availableStock || isOutOfStock}
                      onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                      className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Add To Cart */}
                  <button
                    id="btn-quickview-add-cart"
                    type="button"
                    disabled={isOutOfStock}
                    onClick={handleAdd}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                      addedAnimation
                        ? 'bg-emerald-600 text-slate-900 dark:text-white ring-2 ring-emerald-400'
                        : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-slate-900 dark:text-white disabled:opacity-30 shadow-lg shadow-sky-600/20'
                    }`}
                  >
                    {addedAnimation ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Added to Cart!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        <span>{isOutOfStock ? 'Sold Out' : `Add ${quantity} to Cart`}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Buy Now Button */}
                <button
                  id="btn-quickview-buy-now"
                  type="button"
                  disabled={isOutOfStock}
                  onClick={handleBuy}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-500/20 disabled:opacity-30"
                >
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>Instant Buy Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
