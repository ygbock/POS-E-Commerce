import React, { useState } from 'react';
import {
  Star,
  Heart,
  ShoppingCart,
  Eye,
  Plus,
  Check,
  Flame,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

interface ProductCardProps {
  product: Product;
  onSelectProduct: (product: Product) => void;
  onQuickView?: (product: Product) => void;
  onQuickAdd?: (product: Product, variant: ProductVariant) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelectProduct,
  onQuickView,
  onQuickAdd,
}) => {
  const {
    formatCurrency,
    getTotalStockForVariant,
    addToStoreCart,
    wishlist,
    toggleWishlist,
    isInWishlist,
  } = useCommerce();

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const primaryVariant = product.variants[0];
  const totalStock = getTotalStockForVariant(primaryVariant);
  const isOutOfStock = totalStock <= 0;
  const isWishlisted = isInWishlist(product.id);

  // Price calculations
  const price = primaryVariant.retailPrice;
  const compareAtPrice = primaryVariant.compareAtPrice || (product.compareAtPrice ? product.compareAtPrice : null);
  const discountPercent = compareAtPrice && compareAtPrice > price
    ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
    : null;

  const handleCardClick = () => {
    onSelectProduct(product);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    if (onQuickAdd) {
      onQuickAdd(product, primaryVariant);
    } else {
      addToStoreCart(product, primaryVariant, 1);
    }
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  return (
    <div
      onClick={handleCardClick}
      onMouseEnter={() => {
        setIsHovered(true);
        if (product.images.length > 1) setActiveImageIndex(1);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setActiveImageIndex(0);
      }}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-slate-100 dark:hover:shadow-indigo-950/20 hover:-translate-y-1 flex flex-col justify-between cursor-pointer"
    >
      <div>
        {/* Image Container with Badges */}
        <div className="relative aspect-square w-full bg-slate-50 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800/60">
          <img
            src={product.images[activeImageIndex] || product.images[0]}
            alt={product.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />

          {/* Hover Details & Specs Pill in Center */}
          <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-950/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none duration-300">
            <span className="px-4 py-2 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 text-xs font-bold shadow-xl flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Full Specs & Details</span>
            </span>
          </div>

          {/* Top Left Badges: Upgraded to soft transparent premium styles */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
            {discountPercent && discountPercent > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-rose-50/95 dark:bg-rose-950/95 border border-rose-200/85 dark:border-rose-900/85 text-rose-600 dark:text-rose-400 text-[10px] font-bold px-2.5 py-0.5 rounded shadow-sm backdrop-blur-md">
                <Flame className="w-3 h-3 text-rose-500" />
                <span className="whitespace-nowrap">-{discountPercent}% OFF</span>
              </span>
            )}
            {product.featured && (
              <span className="inline-flex items-center gap-1.5 bg-indigo-50/95 dark:bg-indigo-950/95 border border-indigo-200/85 dark:border-indigo-900/85 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold px-2.5 py-0.5 rounded shadow-sm backdrop-blur-md">
                <Sparkles className="w-3 h-3 text-indigo-500" />
                <span className="whitespace-nowrap">FEATURED</span>
              </span>
            )}
            {product.salesCount && product.salesCount > 80 && (
              <span className="inline-flex items-center gap-1.5 bg-amber-50/95 dark:bg-amber-950/95 border border-amber-200/85 dark:border-amber-900/85 text-amber-800 dark:text-amber-400 text-[10px] font-bold px-2.5 py-0.5 rounded shadow-sm backdrop-blur-md">
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="whitespace-nowrap">BESTSELLER</span>
              </span>
            )}
          </div>

          {/* Top Right Wishlist Toggle: Touch target minimum 44px on mobile, responsive transition */}
          <button
            onClick={handleToggleWishlist}
            className={`absolute top-3 right-3 h-11 w-11 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-xl backdrop-blur-md transition-all duration-200 z-10 flex items-center justify-center border hover:scale-105 active:scale-95 shadow-sm ${
              isWishlisted
                ? 'bg-rose-50/90 dark:bg-rose-950/90 border-rose-200 dark:border-rose-500/30 text-rose-500'
                : 'bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-white hover:bg-white'
            }`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
            aria-label={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          >
            <Heart className={`w-4 h-4 transition-transform duration-200 ${isWishlisted ? 'fill-rose-500 text-rose-500 scale-110' : ''}`} />
          </button>

          {/* Stock Level Tag Bottom Left */}
          <div className="absolute bottom-3 left-3 z-10">
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded backdrop-blur-md shadow-xs flex items-center gap-1.5 border ${
                totalStock > 5
                  ? 'bg-emerald-50/90 dark:bg-slate-900/95 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20'
                  : totalStock > 0
                  ? 'bg-amber-50/90 dark:bg-amber-950/90 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20'
                  : 'bg-rose-50/90 dark:bg-rose-950/90 text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${totalStock > 0 ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
              <span className="whitespace-nowrap">{totalStock > 0 ? `${totalStock} In Stock` : 'Sold Out'}</span>
            </span>
          </div>

          {/* Rating Badge Bottom Right */}
          <div className="absolute bottom-3 right-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-amber-500 dark:text-amber-400 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-slate-800 shadow-sm">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{product.rating.toFixed(1)}</span>
            <span className="text-slate-500 dark:text-slate-400 text-[10px] font-normal">({product.reviewCount})</span>
          </div>
        </div>

        {/* Product Details */}
        <div className="p-3.5 sm:p-4 space-y-1 sm:space-y-1.5 pb-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 whitespace-nowrap overflow-hidden text-ellipsis">
              {product.brand}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
              {product.category}
            </span>
          </div>

          <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
            {product.name}
          </h3>

          <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1 leading-relaxed hidden xs:block">
            {product.shortDescription}
          </p>

          <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap pt-1">
            <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {formatCurrency(price)}
            </span>
            {compareAtPrice && compareAtPrice > price && (
              <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 line-through">
                {formatCurrency(compareAtPrice)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer: Quick Action */}
      <div className="p-3.5 sm:p-4 pt-0 mt-auto">
        <div className="flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div>
            {product.variants.length > 1 ? (
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                {product.variants.length} configurations
              </span>
            ) : (
              <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 block font-medium">
                Standard Edition
              </span>
            )}
          </div>

          {/* Quick Action buttons: Touch targets set to 44px min on mobile, scaling down on desktop */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectProduct(product);
              }}
              className="h-11 w-11 sm:h-9 sm:w-9 md:h-10 md:w-10 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white rounded-xl text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:scale-105 active:scale-95 shadow-sm"
              title="View full details & specs"
              aria-label={`View full details and specs for ${product.name}`}
            >
              <Eye className="w-4 h-4" />
            </button>

            <button
              disabled={isOutOfStock}
              onClick={handleAddToCart}
              className={`h-11 w-11 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center hover:scale-105 active:scale-95 shadow-md ${
                justAdded
                  ? 'bg-emerald-600 text-white shadow-emerald-600/10'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-30 shadow-indigo-600/20'
              }`}
              title="Add to cart"
              aria-label={`Add ${product.name} to cart`}
            >
              {justAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
