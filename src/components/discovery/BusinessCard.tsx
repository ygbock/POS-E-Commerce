import React, { useState } from 'react';
import {
  Store,
  MapPin,
  Phone,
  MessageSquare,
  Navigation,
  ArrowUpRight,
  ShoppingBag,
  Building2,
} from 'lucide-react';
import type { DiscoveryBusiness } from '../../types/discovery';
import { VerificationBadge } from './VerificationBadge';
import { DiscoveryRating } from './DiscoveryRating';

interface BusinessCardProps {
  business: DiscoveryBusiness;
  onSelect?: (business: DiscoveryBusiness) => void;
  className?: string;
}

export const BusinessCard: React.FC<BusinessCardProps> = ({
  business,
  onSelect,
  className = '',
}) => {
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [logoImageFailed, setLogoImageFailed] = useState(false);

  const locationString = [business.city, business.district, business.region]
    .filter(Boolean)
    .join(', ');
  const distanceKm =
    business.distance_km != null && Number.isFinite(Number(business.distance_km))
      ? Number(business.distance_km)
      : null;

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(business);
    }
  };

  const businessUrl = `/discover/business/${encodeURIComponent(business.slug || business.id)}`;
  const storeUrl =
    business.business_mode === 'DISCOVERY_AND_STORE' && business.tenant_slug
      ? `/store/${encodeURIComponent(business.tenant_slug)}`
      : null;

  const categoryLabel = business.category_name || business.business_type || 'Local Business';

  return (
    <article
      className={`group relative rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-0.5 hover:border-indigo-300/80 dark:hover:border-indigo-800/80 transition-all duration-300 flex flex-col justify-between ${className}`}
      aria-labelledby={`business-title-${business.id}`}
    >
      <div>
        {/* Cover Banner Header */}
        <div className="relative h-32 sm:h-36 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 overflow-hidden">
          {business.cover_image_url && !coverImageFailed ? (
            <>
              <img
                src={business.cover_image_url}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                loading="lazy"
                onError={() => setCoverImageFailed(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none" />
              <div className="absolute -left-8 -bottom-8 w-28 h-28 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />
              <Building2 className="w-10 h-10 text-indigo-300/25" aria-hidden="true" />
            </div>
          )}

          {/* Top Bar Overlays: Category Tag & Verification Status */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-950/65 text-white backdrop-blur-md border border-white/15 truncate max-w-[60%]">
              {categoryLabel}
            </span>
            <VerificationBadge status={business.verification_status} />
          </div>

          {/* Online Storefront Indicator Pill */}
          {storeUrl && (
            <div className="absolute bottom-2.5 right-3 z-10">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-600/90 text-white backdrop-blur-xs shadow-xs">
                <ShoppingBag className="w-2.5 h-2.5" aria-hidden="true" />
                <span>Online Store</span>
              </span>
            </div>
          )}
        </div>

        {/* Card Content Body */}
        <div className="px-4 sm:px-5 pt-3 pb-4 space-y-3">
          {/* Avatar + Business Name + Rating */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 -mt-8 sm:-mt-9 relative z-10 rounded-xl bg-white dark:bg-slate-900 border-2 border-white dark:border-slate-800 shadow-md flex items-center justify-center overflow-hidden shrink-0">
              {business.logo_url && !logoImageFailed ? (
                <img
                  src={business.logo_url}
                  alt={`${business.name} logo`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => setLogoImageFailed(true)}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base tracking-tight">
                  {business.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                id={`business-title-${business.id}`}
                className="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug"
              >
                {business.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-2">
                <DiscoveryRating
                  rating={business.rating}
                  reviewCount={business.review_count}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed min-h-[2.25rem]">
            {business.short_description ||
              business.description ||
              'Discover products, services, and local offerings from this business.'}
          </p>

          {/* Location & Distance Bar */}
          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
            <div
              className="flex items-center gap-1.5 min-w-0 truncate"
              title={locationString || 'Sierra Leone'}
            >
              <MapPin
                className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0"
                aria-hidden="true"
              />
              <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
                {locationString || 'Sierra Leone'}
              </span>
            </div>

            {distanceKm != null && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0"
                title="Distance from your selected location"
              >
                <Navigation className="w-3 h-3" aria-hidden="true" />
                {distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="px-4 sm:px-5 pb-4 pt-1 flex items-center gap-1.5 sm:gap-2 mt-auto">
        <a
          href={businessUrl}
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault();
              handleCardClick();
            }
          }}
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-indigo-600 active:scale-[0.98] dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-all shadow-2xs min-h-[40px]"
        >
          <span className="truncate">View Profile</span>
          <ArrowUpRight className="w-3.5 h-3.5 opacity-80 shrink-0" aria-hidden="true" />
        </a>

        {/* Storefront button strictly for DISCOVERY_AND_STORE */}
        {storeUrl && (
          <a
            href={storeUrl}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-950/70 transition-colors min-h-[40px] shrink-0"
            aria-label={`Visit ${business.name} storefront`}
            title={`Visit ${business.name} Storefront`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
            <span className="hidden xs:inline">Store</span>
          </a>
        )}

        {/* Quick Contact Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 transition-colors"
              title={`Call ${business.name}`}
              aria-label={`Call ${business.name}`}
            >
              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}

          {business.whatsapp && (
            <a
              href={`https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
              title="Chat on WhatsApp"
              aria-label={`Chat with ${business.name} on WhatsApp`}
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}

          {business.latitude != null && business.longitude != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 transition-colors"
              title="Get Directions"
              aria-label={`Get directions to ${business.name}`}
            >
              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
};
