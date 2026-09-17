import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { DiscoverySortOption } from '../../types/discovery';

interface DiscoverySortProps {
  value: DiscoverySortOption;
  onChange: (sort: DiscoverySortOption) => void;
  className?: string;
}

export const DiscoverySort: React.FC<DiscoverySortProps> = ({
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <label htmlFor="discovery-sort-select" className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
        <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Sort:</span>
      </label>
      <select
        id="discovery-sort-select"
        value={value}
        onChange={(e) => onChange(e.target.value as DiscoverySortOption)}
        aria-label="Sort discovery results"
        className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
      >
        <option value="relevance">Relevance</option>
        <option value="rating">Highest Rated</option>
        <option value="review_count">Most Reviews</option>
        <option value="name_asc">Name (A-Z)</option>
        <option value="newest">Recently Added</option>
      </select>
    </div>
  );
};
