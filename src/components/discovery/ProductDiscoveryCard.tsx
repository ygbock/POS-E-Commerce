import React, { useState } from 'react';
import { Package, Store, MapPin, ExternalLink } from 'lucide-react';
import type { DiscoveryProduct } from '../../types/discovery';
import { AvailabilityBadge } from './AvailabilityBadge';

interface ProductDiscoveryCardProps {
  product: DiscoveryProduct;
  onSelect?: (product: DiscoveryProduct) => void;
  className?: string;
}

export const ProductDiscoveryCard: React.FC<ProductDiscoveryCardProps> = ({
  product,
  onSelect,
  className = '',
}) => {
  const firstImage = Array.isArray(product.images) && product.images[0] ? product.images[0] : null;
  const [imageFailed, setImageFailed] = useState(false);
  const locationString = [product.city, product.district].filter(Boolean).join(', ');

  const formattedPrice =
    product.show_prices === false
      ? 'Price on request'
      : product.retail_price != null
      ? `${Number(product.retail_price).toLocaleString()} SLE`
      : 'Price on request';

  const businessUrl = `/discover/business/${encodeURIComponent(product.business_slug || product.business_id)}`;

  return (
    <article
      className={`group rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 flex flex-col justify-between shadow-2xs hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all ${className}`}
      aria-labelledby={`prod-title-${product.variant_id}`}
    >
      <div>
        {/* Product Image */}
        <div className="relative aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2.5 sm:mb-3.5">
          {firstImage && !imageFailed ? (
            <img
              src={firstImage}
              alt={product.product_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
              <Package className="w-10 h-10 sm:w-12 sm:h-12" aria-hidden="true" />
            </div>
          )}

          {/* Stock Availability Badge */}
          {product.show_stock_status !== false && (
            <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5">
              <AvailabilityBadge stockCount={product.available_stock} />
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="space-y-1 sm:space-y-1.5">
          <h3
            id={`prod-title-${product.variant_id}`}
            className="font-bold text-xs sm:text-sm md:text-base text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
          >
            {product.product_name}
          </h3>

          {/* Business affiliation */}
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <Store className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate font-medium">{product.business_name}</span>
          </div>

          {locationString && (
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{locationString}</span>
            </div>
          )}
        </div>
      </div>

      {/* Price & Action Footer */}
      <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 sm:gap-2">
        <div className="min-w-0 flex-1">
          <span className="block text-[9px] sm:text-[10px] uppercase font-bold text-slate-400">Price</span>
          <span className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white truncate block">
            {formattedPrice}
          </span>
        </div>

        <a
          href={businessUrl}
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault();
              onSelect(product);
            }
          }}
          className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold text-xs transition-colors shrink-0 min-h-[38px] active:scale-95"
          title="View business & product"
          aria-label={`View ${product.product_name} at ${product.business_name}`}
        >
          <span>View</span>
          <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
};
