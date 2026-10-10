import React from 'react';
import {
  Wrench,
  Clock3,
  MapPin,
  Send,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  Sparkles,
} from 'lucide-react';
import type { DiscoveryService } from '../../types/discovery';
import { VerificationBadge } from './VerificationBadge';

interface ServiceCardProps {
  service: DiscoveryService;
  onRequestService?: (service: DiscoveryService) => void;
  onOpenService?: (service: DiscoveryService) => void;
  className?: string;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onRequestService,
  onOpenService,
  className = '',
}) => {
  const hasPriceRange =
    service.price_from != null &&
    service.price_to != null &&
    Number(service.price_to) > Number(service.price_from);

  const priceDisplay =
    service.price_from != null
      ? hasPriceRange
        ? `${Number(service.price_from).toLocaleString()} – ${Number(service.price_to).toLocaleString()} ${service.currency || 'SLE'}`
        : `From ${Number(service.price_from).toLocaleString()} ${service.currency || 'SLE'}`
      : 'Custom Quote';

  const bookingModeLabel =
    service.booking_mode === 'BOOKING'
      ? 'Direct Booking'
      : service.booking_mode === 'REQUEST'
      ? 'Service Request'
      : 'Quote Available';

  const areaLabel =
    service.service_area_text ||
    [service.city, service.district].filter(Boolean).join(', ') ||
    'Local Service Area';

  return (
    <article
      onClick={() => onOpenService?.(service)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenService?.(service);
        }
      }}
      role={onOpenService ? 'link' : undefined}
      tabIndex={onOpenService ? 0 : undefined}
      className={`group relative rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-0.5 hover:border-indigo-300/80 dark:hover:border-indigo-800/80 transition-all duration-300 flex flex-col justify-between ${
        onOpenService ? 'cursor-pointer' : ''
      } ${className}`}
      aria-labelledby={`service-title-${service.id}`}
    >
      {/* Top Accent Strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500" />

      <div className="p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          {/* Top Row: Category/Type Pill & Booking Mode */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 text-[10px] font-bold uppercase tracking-wider truncate">
              <Wrench className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{service.service_type || 'Professional Service'}</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold shrink-0">
              <CalendarCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{bookingModeLabel}</span>
            </span>
          </div>

          {/* Service Title & Provider Row */}
          <div>
            <h3
              id={`service-title-${service.id}`}
              className="font-black text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug line-clamp-1"
            >
              {service.name}
            </h3>

            {service.business_name && (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 text-xs text-slate-500 dark:text-slate-400">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    By{' '}
                    <a
                      href={`/discover/business/${encodeURIComponent(
                        service.business_slug || service.business_id
                      )}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                    >
                      {service.business_name}
                    </a>
                  </span>
                </div>
                {service.verification_status && (
                  <VerificationBadge status={service.verification_status} showText={false} />
                )}
              </div>
            )}
          </div>

          {/* Service Description */}
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed min-h-[2.25rem]">
            {service.description ||
              'Professional service offered by this local verified business on the AbaCha discovery network.'}
          </p>
        </div>

        {/* Service Metadata Pills (Coverage Area & Duration) */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 min-w-0"
            title={areaLabel}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" aria-hidden="true" />
            <span className="truncate font-semibold text-[11px]">{areaLabel}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 min-w-0">
            <Clock3 className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
            <span className="truncate font-semibold text-[11px]">
              {service.duration_minutes ? `${service.duration_minutes} mins` : 'Flexible time'}
            </span>
          </div>
        </div>
      </div>

      {/* Pricing & CTA Footer */}
      <div className="px-4 sm:px-5 py-3.5 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
            Estimated Rate
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
            {priceDisplay}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenService && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenService(service);
              }}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="View Service Details"
              aria-label={`View details for ${service.name}`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestService?.(service);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Request Quote</span>
          </button>
        </div>
      </div>
    </article>
  );
};
