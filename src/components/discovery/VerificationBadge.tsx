import React from 'react';
import { ShieldCheck, ShieldAlert, Shield, Clock } from 'lucide-react';
import type { DiscoveryVerificationStatus } from '../../types/discovery';

interface VerificationBadgeProps {
  status?: DiscoveryVerificationStatus | string | null;
  showText?: boolean;
  className?: string;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  status = 'UNVERIFIED',
  showText = true,
  className = '',
}) => {
  const normalized = (status || 'UNVERIFIED').toUpperCase() as DiscoveryVerificationStatus;

  switch (normalized) {
    case 'VERIFIED':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 transition-colors ${className}`}
          title="Verified Business: Authenticated by AbaCha platform"
          aria-label="Verification status: Verified business"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          {showText && <span>Verified</span>}
        </span>
      );

    case 'PENDING':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 transition-colors ${className}`}
          title="Verification Pending: Under review"
          aria-label="Verification status: Pending review"
        >
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
          {showText && <span>Pending</span>}
        </span>
      );

    case 'REJECTED':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 transition-colors ${className}`}
          title="Verification Rejected"
          aria-label="Verification status: Rejected"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
          {showText && <span>Unverified</span>}
        </span>
      );

    case 'UNVERIFIED':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 transition-colors ${className}`}
          title="Unverified Listing: Community or self-registered"
          aria-label="Verification status: Unverified listing"
        >
          <Shield className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
          {showText && <span>Unverified</span>}
        </span>
      );
  }
};
