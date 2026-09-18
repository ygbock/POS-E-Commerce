import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DiscoveryPaginationProps {
  totalItems: number;
  pageSize: number;
  currentOffset: number;
  onOffsetChange: (offset: number) => void;
  /** When the API exposes page-sized results without a reliable total count. */
  hasNext?: boolean;
  className?: string;
}

export const DiscoveryPagination: React.FC<DiscoveryPaginationProps> = ({
  totalItems,
  pageSize,
  currentOffset,
  onOffsetChange,
  hasNext: hasNextOverride,
  className = '',
}) => {
  const currentPage = Math.floor(currentOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const hasNext = hasNextOverride ?? currentPage < totalPages;

  if (totalPages <= 1 && !hasNext) return null;

  const handlePrev = () => {
    onOffsetChange(Math.max(0, currentOffset - pageSize));
  };

  const handleNext = () => {
    onOffsetChange(currentOffset + pageSize);
  };

  const hasPrev = currentOffset > 0;

  return (
    <nav
      aria-label="Discovery search results pagination"
      className={`flex items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs ${className}`}
    >
      <div className="text-slate-500 dark:text-slate-400 font-medium">
        Page <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span>
        {hasNextOverride === undefined && (<> of <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span></>)}
        {hasNextOverride !== undefined && (<span className="hidden sm:inline"> ({totalItems} results on this page)</span>)}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!hasPrev}
          aria-label="Go to previous page"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 disabled:pointer-events-none hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!hasNext}
          aria-label="Go to next page"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40 disabled:pointer-events-none hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};
