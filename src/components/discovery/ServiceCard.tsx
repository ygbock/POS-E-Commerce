import React from 'react';
import { Wrench, Clock3, MapPin, Send, User } from 'lucide-react';
import type { DiscoveryService } from '../../types/discovery';
import { VerificationBadge } from './VerificationBadge';

interface ServiceCardProps {
  service: DiscoveryService;
  onRequestService?: (service: DiscoveryService) => void;
  className?: string;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onRequestService,
  className = '',
}) => {
  const priceDisplay =
    service.price_from != null
      ? `From ${Number(service.price_from).toLocaleString()} ${service.currency || 'SLE'}`
      : 'Quote on request';

  return (
    <article
      className={`group rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between shadow-2xs hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all ${className}`}
      aria-labelledby={`service-title-${service.id}`}
    >
      <div>
        {/* Header: Icon + Title + Provider */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3
                id={`service-title-${service.id}`}
                className="font-bold text-base text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
              >
                {service.name}
              </h3>
              {service.verification_status && (
                <VerificationBadge status={service.verification_status} showText={false} />
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Offered by <a href={`/discover/business/${encodeURIComponent(service.business_slug || service.business_id)}`} className="font-semibold text-slate-700 dark:text-slate-300 hover:underline">{service.business_name}</a>
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed min-h-[2.75rem]">
          {service.description || 'Professional service offered by this local verified business on the AbaCha discovery network.'}
        </p>

        {/* Meta badges: Area & Duration */}
        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[150px]">
              {service.service_area_text || [service.city, service.district].filter(Boolean).join(', ') || 'Local area'}
            </span>
          </span>

          <span className="inline-flex items-center gap-1">
            <Clock3 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span>{service.duration_minutes ? `${service.duration_minutes} min` : 'Flexible duration'}</span>
          </span>
        </div>
      </div>

      {/* Pricing & CTA Footer */}
      <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
        <div>
          <span className="block text-[10px] uppercase font-bold text-slate-400">Estimate</span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
            {priceDisplay}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onRequestService && onRequestService(service)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs active:scale-95"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Request Quote</span>
        </button>
      </div>
    </article>
  );
};
