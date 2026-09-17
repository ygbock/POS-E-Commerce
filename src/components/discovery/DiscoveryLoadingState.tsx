import React from 'react';
import type { DiscoverySearchType } from '../../types/discovery';

interface DiscoveryLoadingStateProps {
  type?: DiscoverySearchType;
  count?: number;
  className?: string;
}

export const DiscoveryLoadingState: React.FC<DiscoveryLoadingStateProps> = ({
  type = 'all',
  count = 6,
  className = '',
}) => {
  // Business Card Skeleton
  const renderBusinessSkeletons = (n: number) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={`biz-skel-${i}`}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs animate-pulse"
        >
          <div className="h-28 sm:h-32 bg-slate-200 dark:bg-slate-800" />
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3 -mt-8 relative">
              <div className="w-12 h-12 rounded-2xl bg-slate-300 dark:bg-slate-700 border-2 border-white dark:border-slate-800" />
              <div className="flex-1 space-y-1.5 pt-4">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-1/2" />
              </div>
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-full" />
              <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-4/5" />
            </div>
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl mt-4" />
          </div>
        </div>
      ))}
    </div>
  );

  // Product Card Skeleton
  const renderProductSkeletons = (n: number) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={`prod-skel-${i}`}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3 shadow-xs animate-pulse"
        >
          <div className="aspect-square bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="space-y-1.5">
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded-md w-4/5" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-1/2" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-1/3" />
            <div className="h-7 w-7 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );

  // Service Card Skeleton
  const renderServiceSkeletons = (n: number) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={`svc-skel-${i}`}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 bg-slate-200 dark:bg-slate-800 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-2/3" />
              <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-1/3" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-full" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-md w-5/6" />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-1/4" />
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`space-y-8 ${className}`} role="status" aria-label="Loading discovery results">
      {type === 'businesses' && renderBusinessSkeletons(count)}
      {type === 'products' && renderProductSkeletons(count)}
      {type === 'services' && renderServiceSkeletons(count)}
      {type === 'all' && (
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-36 animate-pulse" />
            {renderBusinessSkeletons(3)}
          </div>
          <div className="space-y-3">
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-36 animate-pulse" />
            {renderProductSkeletons(5)}
          </div>
          <div className="space-y-3">
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-36 animate-pulse" />
            {renderServiceSkeletons(3)}
          </div>
        </div>
      )}
    </div>
  );
};
