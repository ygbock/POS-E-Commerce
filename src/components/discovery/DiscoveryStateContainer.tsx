import React from 'react';
import type { DiscoveryDataState, DiscoverySearchType } from '../../types/discovery';
import { DiscoveryLoadingState } from './DiscoveryLoadingState';
import { DiscoveryEmptyState } from './DiscoveryEmptyState';
import { DiscoveryErrorState } from './DiscoveryErrorState';
import { DiscoveryRateLimitState } from './DiscoveryRateLimitState';
import { AlertCircle, Lock, MapPinOff, Archive } from 'lucide-react';

interface DiscoveryStateContainerProps {
  state: DiscoveryDataState;
  searchType?: DiscoverySearchType;
  errorMessage?: string;
  errorCode?: string;
  status?: number;
  onRetry?: () => void;
  onClearFilters?: () => void;
  onRequestService?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  children: React.ReactNode;
  className?: string;
}

export const DiscoveryStateContainer: React.FC<DiscoveryStateContainerProps> = ({
  state,
  searchType = 'all',
  errorMessage,
  errorCode,
  status,
  onRetry,
  onClearFilters,
  onRequestService,
  emptyTitle,
  emptyDescription,
  children,
  className = '',
}) => {
  switch (state) {
    // 1. Loading state
    case 'loading':
      return <DiscoveryLoadingState type={searchType} className={className} />;

    // 2. Loaded with results
    case 'loaded':
      return <div className={className}>{children}</div>;

    // 3. Loaded with zero results
    case 'empty':
      return (
        <DiscoveryEmptyState
          title={emptyTitle}
          description={emptyDescription}
          onClearFilters={onClearFilters}
          onRequestService={onRequestService}
          className={className}
        />
      );

    // 4. API generic error
    case 'error':
      return (
        <DiscoveryErrorState
          message={errorMessage || 'An error occurred while loading discovery data. Please try again.'}
          code={errorCode}
          status={status}
          onRetry={onRetry}
          className={className}
        />
      );

    // 5. Network failure
    case 'network_error':
      return (
        <DiscoveryErrorState
          message="Unable to reach AbaCha discovery services. Please verify your internet connection."
          code="NETWORK_ERROR"
          status={0}
          onRetry={onRetry}
          className={className}
        />
      );

    // 6. Unauthorized (401)
    case 'unauthorized':
      return (
        <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center ${className}`}>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-850 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Authentication Required</h3>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Please log in to your AbaCha account to access this discovery feature.
          </p>
        </div>
      );

    // 7. Forbidden (403)
    case 'forbidden':
      return (
        <div className={`rounded-3xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-8 text-center ${className}`}>
          <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 mx-auto flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-rose-950 dark:text-rose-100">Access Restricted</h3>
          <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-300 max-w-md mx-auto">
            You do not have administrative or ownership permissions to manage this discovery resource.
          </p>
        </div>
      );

    // 8. Rate limited (429)
    case 'rate_limited':
      return <DiscoveryRateLimitState onRetry={onRetry} className={className} />;

    // 9. Invalid search/filter input (422)
    case 'invalid_input':
      return (
        <div className={`rounded-3xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-8 text-center ${className}`}>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 mx-auto flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-amber-950 dark:text-amber-100">Invalid Search Criteria</h3>
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto">
            {errorMessage || 'One or more search parameters or coordinates were outside valid ranges.'}
          </p>
          {onClearFilters && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onClearFilters}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                Reset Search
              </button>
            </div>
          )}
        </div>
      );

    // 10. Location unavailable
    case 'location_unavailable':
      return (
        <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center ${className}`}>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-850 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <MapPinOff className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Location Services Unavailable</h3>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            We could not determine your geographical coordinates. Please pick a city manually.
          </p>
        </div>
      );

    // 11. Location permission denied
    case 'location_denied':
      return (
        <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center ${className}`}>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-850 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <MapPinOff className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Location Permission Blocked</h3>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Location access was denied in your browser settings. You can browse all areas or select a city manually.
          </p>
        </div>
      );

    // 12. Business/listing unavailable (404)
    case 'not_found':
      return (
        <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center ${className}`}>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Listing Not Found</h3>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            The requested business, product, or service listing is no longer published or does not exist.
          </p>
        </div>
      );

    // 13. Suspended/archived listing
    case 'suspended':
      return (
        <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center ${className}`}>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-850 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <Archive className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Listing Inactive</h3>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            This business listing has been archived or temporarily suspended by administration.
          </p>
        </div>
      );

    default:
      return <div className={className}>{children}</div>;
  }
};
