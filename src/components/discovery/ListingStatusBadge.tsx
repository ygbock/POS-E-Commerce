import React from 'react';
import type { DiscoveryListingStatus } from '../../types/discovery';

interface ListingStatusBadgeProps {
  status: DiscoveryListingStatus | string;
  className?: string;
}

export const ListingStatusBadge: React.FC<ListingStatusBadgeProps> = ({ status, className = '' }) => {
  const norm = String(status || '').toUpperCase() as DiscoveryListingStatus;

  const config: Record<DiscoveryListingStatus, { label: string; style: string }> = {
    PUBLISHED: {
      label: 'Published',
      style: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
    },
    APPROVED: {
      label: 'Approved',
      style: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
    },
    SUBMITTED: {
      label: 'Under Review',
      style: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
    },
    DRAFT: {
      label: 'Draft',
      style: 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    },
    PAUSED: {
      label: 'Paused',
      style: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    },
    SUSPENDED: {
      label: 'Suspended',
      style: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    },
    ARCHIVED: {
      label: 'Archived',
      style: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
    },
  };

  const item = config[norm] || { label: status, style: 'bg-slate-100 text-slate-700 border-slate-200' };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${item.style} ${className}`}
      aria-label={`Listing lifecycle status: ${item.label}`}
    >
      {item.label}
    </span>
  );
};
