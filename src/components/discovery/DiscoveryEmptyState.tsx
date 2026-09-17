import React from 'react';
import { Search, RotateCcw, Send } from 'lucide-react';

interface DiscoveryEmptyStateProps {
  title?: string;
  description?: string;
  onClearFilters?: () => void;
  onRequestService?: () => void;
  className?: string;
}

export const DiscoveryEmptyState: React.FC<DiscoveryEmptyStateProps> = ({
  title = 'No matches found',
  description = 'We could not find any businesses, products, or services matching your current filters and location.',
  onClearFilters,
  onRequestService,
  className = '',
}) => {
  return (
    <div
      className={`rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center bg-white/50 dark:bg-slate-900/50 ${className}`}
      role="status"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mx-auto flex items-center justify-center mb-4">
        <Search className="w-7 h-7" aria-hidden="true" />
      </div>

      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
        {title}
      </h3>

      <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
        {description}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Reset filters</span>
          </button>
        )}

        {onRequestService && (
          <button
            type="button"
            onClick={onRequestService}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Post a service request</span>
          </button>
        )}
      </div>
    </div>
  );
};
