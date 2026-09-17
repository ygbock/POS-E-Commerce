import React from 'react';
import { Store, MapPin, Phone, MessageSquare, Navigation, ArrowUpRight } from 'lucide-react';
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
  const locationString = [business.city, business.district, business.region].filter(Boolean).join(', ');

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(business);
    }
  };

  const businessUrl = `/discover/business/${encodeURIComponent(business.slug || business.id)}`;

  return (
    <article
      className={`group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between ${className}`}
      aria-labelledby={`business-title-${business.id}`}
    >
      <div>
        {/* Cover banner */}
        <div className="relative h-28 sm:h-32 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-850 overflow-hidden">
          {business.cover_image_url ? (
            <img
              src={business.cover_image_url}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center opacity-30 text-slate-400">
              <Store className="w-12 h-12" aria-hidden="true" />
            </div>
          )}

          {/* Verification Badge overlay */}
          <div className="absolute top-2.5 right-2.5 z-10">
            <VerificationBadge status={business.verification_status} />
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 sm:p-5 space-y-3">
          {/* Logo + Title block */}
          <div className="flex items-start gap-3 -mt-8 sm:-mt-9 relative z-10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white dark:bg-slate-900 border-2 border-white dark:border-slate-800 shadow-md flex items-center justify-center overflow-hidden shrink-0">
              {business.logo_url ? (
                <img
                  src={business.logo_url}
                  alt={`${business.name} logo`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-bold text-base">
                  {business.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-4 sm:pt-5">
              <h3
                id={`business-title-${business.id}`}
                className="font-black text-base sm:text-lg text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
              >
                {business.name}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {business.category_name || business.business_type || 'Local Business'}
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
            {business.short_description || business.description || 'Discover products, services, and local offerings from this business.'}
          </p>

          {/* Meta indicators: Location & Rating */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80">
            {locationString ? (
              <span className="inline-flex items-center gap-1 truncate max-w-[170px]" title={locationString}>
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                <span className="truncate">{locationString}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sierra Leone</span>
              </span>
            )}

            <DiscoveryRating
              rating={business.rating}
              reviewCount={business.review_count}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="p-4 sm:p-5 pt-0 flex items-center gap-2 mt-auto">
        <a
          href={businessUrl}
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault();
              handleCardClick();
            }
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs"
        >
          <span>View Business</span>
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
        </a>

        {/* Quick Contact buttons if available */}
        {business.phone && (
          <a
            href={`tel:${business.phone}`}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={`Call ${business.name}`}
            aria-label={`Call ${business.name}`}
          >
            <Phone className="w-4 h-4" aria-hidden="true" />
          </a>
        )}

        {business.whatsapp && (
          <a
            href={`https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
            title="Chat on WhatsApp"
            aria-label={`Chat with ${business.name} on WhatsApp`}
          >
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
          </a>
        )}

        {business.latitude != null && business.longitude != null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Get Directions"
            aria-label={`Get directions to ${business.name}`}
          >
            <Navigation className="w-4 h-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
};
