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
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 dark:hover:border-indigo-500/50 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 flex flex-col justify-between cursor-pointer"
    >
      <div>
        {/* Image Container with Badges */}
        <div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <img
            src={product.images[activeImageIndex] || product.images[0]}
            alt={product.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />

          {/* Hover Details & Specs Pill in Center */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <span className="px-3 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 text-xs font-bold shadow-xl flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
              <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Full Details & Specs</span>
            </span>
          </div>

          {/* Top Left Badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-10">
            {discountPercent && discountPercent > 0 && (
              <span className="inline-flex items-center gap-1 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                <Flame className="w-3 h-3" />
                <span>-{discountPercent}% OFF</span>
              </span>
            )}
            {product.featured && (
              <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                <Sparkles className="w-3 h-3" />
                <span>FEATURED</span>
              </span>
            )}
            {product.salesCount && product.salesCount > 80 && (
              <span className="inline-flex items-center gap-1 bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded shadow">
                <Zap className="w-3 h-3" />
                <span>BESTSELLER</span>
              </span>
            )}
          </div>

          {/* Top Right Wishlist Toggle */}
          <button
            onClick={handleToggleWishlist}
            className={`absolute top-2.5 right-2.5 p-2 rounded-xl backdrop-blur-md transition-all z-10 ${
              isWishlisted
                ? 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-500'
                : 'bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-white hover:bg-white'
            }`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>

          {/* Stock Level Tag Bottom Left */}
          <div className="absolute bottom-2.5 left-2.5 z-10">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-md shadow-xs flex items-center gap-1 ${
                totalStock > 5
                  ? 'bg-emerald-50 dark:bg-slate-900/90 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                  : totalStock > 0
                  ? 'bg-amber-50 dark:bg-amber-950/90 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                  : 'bg-rose-50 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${totalStock > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span>{totalStock > 0 ? `${totalStock} In Stock` : 'Sold Out'}</span>
            </span>
          </div>

          {/* Rating Badge Bottom Right */}
          <div className="absolute bottom-2.5 right-2.5 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md text-amber-500 dark:text-amber-400 text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-slate-200 dark:border-slate-800 shadow-xs">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{product.rating.toFixed(1)}</span>
            <span className="text-slate-500 dark:text-slate-400 text-[10px]">({product.reviewCount})</span>
          </div>
        </div>

        {/* Product Details */}
        <div className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              {product.brand}
            </span>
            <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400">
              {product.category}
            </span>
          </div>

          <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {product.name}
          </h3>

          <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed hidden xs:block">
            {product.shortDescription}
          </p>
        </div>
      </div>

      {/* Card Footer: Price & Quick Action */}
      <div className="p-3 sm:p-4 pt-0">
        <div className="flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap">
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {formatCurrency(price)}
              </span>
              {compareAtPrice && compareAtPrice > price && (
                <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 line-through">
                  {formatCurrency(compareAtPrice)}
                </span>
              )}
            </div>
            {product.variants.length > 1 && (
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 block">
                {product.variants.length} options
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectProduct(product);
              }}
              className="p-2 sm:p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white rounded-xl text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700 flex items-center justify-center min-w-[36px] min-h-[36px]"
              title="View full details & specs"
              aria-label={`View full details and specs for ${product.name}`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button
              disabled={isOutOfStock}
              onClick={handleAddToCart}
              className={`p-2 sm:p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center min-w-[36px] min-h-[36px] ${
                justAdded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-30 shadow-md shadow-indigo-600/20'
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
