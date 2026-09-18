import React from 'react';
import {
  Search,
  Sparkles,
  MapPin,
  Compass,
  Store,
  Package,
  Wrench,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { DiscoverySearchType } from '../../types/discovery';
import { DiscoverySearchBar } from './DiscoverySearchBar';

interface DiscoveryHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  activeType: DiscoverySearchType;
  onTypeChange: (type: DiscoverySearchType) => void;
  selectedCity?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
  suggestions?: string[];
  className?: string;
}

const DEFAULT_POPULAR_TAGS = [
  'Groceries',
  'Pharmacy',
  'Electronics',
  'Plumbing',
  'Auto Repair',
  'Fresh Produce',
  'Tailoring',
];

export const DiscoveryHero: React.FC<DiscoveryHeroProps> = ({
  query,
  onQueryChange,
  onSearch,
  activeType,
  onTypeChange,
  selectedCity,
  latitude,
  longitude,
  radiusKm = 25,
  suggestions = DEFAULT_POPULAR_TAGS,
  className = '',
}) => {
  const hasCoords = latitude != null && longitude != null;
  const locationLabel = hasCoords
    ? `Near your location (${radiusKm}km)`
    : selectedCity
    ? `in ${selectedCity}`
    : 'across Sierra Leone';

  const typeOptions: Array<{ id: DiscoverySearchType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'all', label: 'All Results', icon: Compass },
    { id: 'businesses', label: 'Businesses', icon: Store },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'services', label: 'Services', icon: Wrench },
  ];

  return (
    <section className={`relative overflow-hidden bg-gradient-to-b from-indigo-900 via-slate-900 to-slate-900 text-white pt-10 pb-12 sm:pt-14 sm:pb-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800 ${className}`}>
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none opacity-25">
        <div className="absolute -top-24 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
        <div className="absolute top-10 right-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
        {/* Location pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 text-xs font-semibold text-indigo-200 transition-colors">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Showing verified listings {locationLabel}</span>
        </div>

        {/* Hero Headline */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Find businesses, products, and services <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400">near you</span>
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
            Search verified local merchants, browse real-time inventory, and request professional services across your community.
          </p>
        </div>

        {/* Central Search Container */}
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Type Selector Tabs */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 p-1 max-w-md mx-auto rounded-2xl bg-black/30 backdrop-blur-md border border-white/10">
            {typeOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = activeType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onTypeChange(opt.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Input Bar */}
          <div className="shadow-2xl rounded-2xl">
            <DiscoverySearchBar
              value={query}
              onChange={onQueryChange}
              onSearch={onSearch}
              placeholder={
                activeType === 'businesses'
                  ? 'Search by store name, business category, or district…'
                  : activeType === 'products'
                  ? 'Search products, groceries, electronics, parts…'
                  : activeType === 'services'
                  ? 'Search plumbing, electricians, auto repair, tailoring…'
                  : 'Search any business, product, or service…'
              }
              className="w-full text-slate-900"
            />
          </div>

          {/* Quick Suggestions Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider mr-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Popular:
            </span>
            {suggestions.slice(0, 6).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  onQueryChange(tag);
                  onSearch(tag);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
