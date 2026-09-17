import React, { useState } from 'react';
import { Filter, X, Clock, Navigation, CheckCircle, Truck, ShoppingBag, Star, RotateCcw } from 'lucide-react';
import type { DiscoveryCategory } from '../../types/discovery';

export interface DiscoveryFilterState {
  nearMe?: boolean;
  openNow?: boolean;
  availableToday?: boolean;
  delivery?: boolean;
  pickup?: boolean;
  categoryId?: string;
  minRating?: number;
}

interface DiscoveryFiltersProps {
  filters: DiscoveryFilterState;
  onChange: (filters: DiscoveryFilterState) => void;
  categories?: DiscoveryCategory[];
  hasLocation?: boolean;
  onRequestLocation?: () => void;
  className?: string;
}

export const DiscoveryFilters: React.FC<DiscoveryFiltersProps> = ({
  filters,
  onChange,
  categories = [],
  hasLocation = false,
  onRequestLocation,
  className = '',
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeCount = [
    filters.nearMe,
    filters.openNow,
    filters.availableToday,
    filters.delivery,
    filters.pickup,
    filters.categoryId,
    filters.minRating,
  ].filter(Boolean).length;

  const toggleFilter = (key: keyof DiscoveryFilterState) => {
    if (key === 'nearMe' && !hasLocation && !filters.nearMe && onRequestLocation) {
      onRequestLocation();
      return;
    }
    onChange({
      ...filters,
      [key]: !filters[key],
    });
  };

  const handleReset = () => {
    onChange({});
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Mobile / All Filters Drawer Trigger Button */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
          activeCount > 0
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60 shadow-2xs'
            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
        aria-label={`Open filter settings (${activeCount} active)`}
      >
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Fast Pill: Near me */}
      <button
        type="button"
        onClick={() => toggleFilter('nearMe')}
        aria-pressed={Boolean(filters.nearMe)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
          filters.nearMe
            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Near me</span>
      </button>

      {/* Fast Pill: Open now */}
      <button
        type="button"
        onClick={() => toggleFilter('openNow')}
        aria-pressed={Boolean(filters.openNow)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
          filters.openNow
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Open now</span>
      </button>

      {/* Fast Pill: Available today */}
      <button
        type="button"
        onClick={() => toggleFilter('availableToday')}
        aria-pressed={Boolean(filters.availableToday)}
        className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
          filters.availableToday
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Available today</span>
      </button>

      {/* Fast Pill: Delivery */}
      <button
        type="button"
        onClick={() => toggleFilter('delivery')}
        aria-pressed={Boolean(filters.delivery)}
        className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
          filters.delivery
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-2xs'
            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <Truck className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Delivery</span>
      </button>

      {/* Fast Pill: Pickup */}
      <button
        type="button"
        onClick={() => toggleFilter('pickup')}
        aria-pressed={Boolean(filters.pickup)}
        className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
          filters.pickup
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-2xs'
            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Pickup</span>
      </button>

      {/* Active Filter Clear button */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          <span>Reset</span>
        </button>
      )}

      {/* Extended Filters Drawer / Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-blue-600" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Discovery Filters</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  aria-label="Close filter drawer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              {/* Status & Timing */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Availability & Status
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.openNow)}
                      onChange={() => toggleFilter('openNow')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold">Open Now Only</span>
                  </label>

                  <label className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.availableToday)}
                      onChange={() => toggleFilter('availableToday')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold">Available Today</span>
                  </label>
                </div>
              </div>

              {/* Fulfillment Method */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Fulfillment
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.delivery)}
                      onChange={() => toggleFilter('delivery')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold">Delivery</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.pickup)}
                      onChange={() => toggleFilter('pickup')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold">Pickup</span>
                  </label>
                </div>
              </div>

              {/* Minimum Rating */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Minimum Rating
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[4, 3, 2, 0].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => onChange({ ...filters, minRating: star === 0 ? undefined : star })}
                      className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        (star === 0 && !filters.minRating) || filters.minRating === star
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {star === 0 ? 'Any' : <><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{star}+</>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category selection */}
              {categories.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={filters.categoryId || ''}
                    onChange={(e) => onChange({ ...filters, categoryId: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
