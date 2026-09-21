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
  onCityChange: (city: string | undefined) => void;
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
  onCityChange,
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

  const cities = [
    { id: 'all', label: 'All Sierra Leone' },
    { id: 'Freetown', label: 'Freetown' },
    { id: 'Bo', label: 'Bo' },
    { id: 'Kenema', label: 'Kenema' },
    { id: 'Makeni', label: 'Makeni' },
    { id: 'Waterloo', label: 'Waterloo' },
  ];

  return (
    <section className={`relative overflow-hidden bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white pt-12 pb-14 sm:pt-16 sm:pb-20 px-4 sm:px-6 lg:px-8 border-b border-slate-800 shadow-inner ${className}`}>
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none opacity-25">
        <div className="absolute -top-24 left-1/4 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-3xl" />
        <div className="absolute top-10 right-1/4 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
        {/* Location pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 text-xs font-semibold text-indigo-200 transition-colors">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Showing verified listings {locationLabel}</span>
        </div>

        {/* Hero Headline */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Find businesses, products, & services <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400">near you</span>
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
            Search verified local merchants, browse real-time inventory, and request professional services across your community.
          </p>
        </div>

        {/* Central Search Container */}
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Location Selector Tabs */}
          <div className="flex items-center justify-start sm:justify-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 px-2 max-w-2xl mx-auto scrollbar-none">
            {cities.map((city) => {
              const isSelected = (!selectedCity && city.id === 'all') || selectedCity === city.id;
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => onCityChange(city.id === 'all' ? undefined : city.id)}
                  className={`flex-shrink-0 flex items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-full text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-500/20'
                      : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                  <span>{city.label}</span>
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
