import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import type { DiscoveryAvailabilityStatus } from '../../types/discovery';

interface AvailabilityBadgeProps {
  status?: DiscoveryAvailabilityStatus | string | null;
  stockCount?: number | string | null;
  showCount?: boolean;
  className?: string;
}

export const AvailabilityBadge: React.FC<AvailabilityBadgeProps> = ({
  status = 'unknown',
  stockCount,
  showCount = false,
  className = '',
}) => {
  // Normalize string if numeric count was passed
  let resolvedStatus: DiscoveryAvailabilityStatus = 'unknown';
  if (status && typeof status === 'string') {
    const s = status.toLowerCase();
    if (s.includes('avail') || s === 'in_stock') resolvedStatus = 'available';
    else if (s.includes('limit') || s === 'low_stock') resolvedStatus = 'limited';
    else if (s.includes('out') || s === 'out_of_stock') resolvedStatus = 'out_of_stock';
    else if (s.includes('check') || s === 'on_request') resolvedStatus = 'check_stock';
  }

  if (stockCount != null && resolvedStatus === 'unknown') {
    const count = Number(stockCount);
    if (count > 5) resolvedStatus = 'available';
    else if (count > 0) resolvedStatus = 'limited';
    else if (count === 0) resolvedStatus = 'out_of_stock';
  }

  const countDisplay = showCount && stockCount != null && Number(stockCount) > 0 ? ` (${stockCount})` : '';

  switch (resolvedStatus) {
    case 'available':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 transition-colors ${className}`}
          aria-label={`Availability: In stock${countDisplay}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>Available{countDisplay}</span>
        </span>
      );

    case 'limited':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 transition-colors ${className}`}
          aria-label={`Availability: Limited stock${countDisplay}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
          <span>Limited stock{countDisplay}</span>
        </span>
      );

    case 'out_of_stock':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 transition-colors ${className}`}
          aria-label="Availability: Out of stock"
        >
          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
          <span>Out of stock</span>
        </span>
      );

    case 'check_stock':
    case 'unknown':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 transition-colors ${className}`}
          aria-label="Availability: Contact business to confirm stock"
        >
          <HelpCircle className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
          <span>Check stock</span>
        </span>
      );
  }
};
