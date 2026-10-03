import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  MapPin,
  Utensils,
  Wrench,
  Sparkles as SparklesIcon,
  Wind,
  Plug,
  Hammer,
  ChevronDown,
} from 'lucide-react';
import type { DiscoverySearchType } from '../../types/discovery';

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
  className = '',
}) => {
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  const cities = [
    { id: 'all', label: 'Sierra Leone' },
    { id: 'Freetown', label: 'Freetown' },
    { id: 'Bo', label: 'Bo' },
    { id: 'Kenema', label: 'Kenema' },
    { id: 'Makeni', label: 'Makeni' },
    { id: 'Waterloo', label: 'Waterloo' },
  ];

  const handleCitySelect = (cityId: string) => {
    onCityChange(cityId === 'all' ? undefined : cityId);
    setCityDropdownOpen(false);
  };

  const getCityLabel = () => {
    if (!selectedCity) return 'Sierra Leone';
    const match = cities.find(c => c.id === selectedCity);
    return match ? match.label : selectedCity;
  };

  return (
    <section className={`relative overflow-hidden bg-transparent text-white pt-6 pb-8 sm:pt-10 sm:pb-14 md:pt-16 md:pb-20 px-3.5 sm:px-6 lg:px-8 select-none ${className}`}>
      <div className="relative max-w-4xl mx-auto text-center space-y-5 sm:space-y-7 md:space-y-9">
        
        {/* Brand/Hero Title styled with responsive balance and fluid scale */}
        <div className="space-y-2 sm:space-y-3">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight leading-tight sm:leading-none italic select-none text-balance">
            <span className="font-serif font-light text-white">What's</span>
            <span className="font-sans font-black text-white ml-1.5 uppercase tracking-tighter">Nearby</span>
            <sup className="text-xs sm:text-sm font-bold align-super ml-0.5 text-slate-300">™</sup>
          </h1>
          <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-200/90 sm:text-slate-300 font-medium tracking-wide leading-relaxed px-2">
            Discover local culinary experiences, verified services, and professional contractors around you.
          </p>
        </div>

        {/* Unified Dual-Input Search Bar optimized for mobile and tablet */}
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch(query);
            }}
            className="flex flex-col sm:flex-row items-stretch w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-1.5 gap-1.5 sm:gap-1 border border-slate-200/90 dark:border-slate-800"
          >
            {/* Left field: Service Search */}
            <div className="flex-1 flex items-center min-w-0">
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search local services or products…"
                className="w-full px-3.5 sm:px-4 py-3 sm:py-3.5 bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-0 min-h-[44px]"
              />
            </div>

            {/* Mobile horizontal divider */}
            <div className="h-px bg-slate-100 dark:bg-slate-800 sm:hidden mx-3 my-0.5" />

            {/* Vertical Split Line for desktop/tablet */}
            <div className="hidden sm:block w-px bg-slate-200 dark:bg-slate-700 my-2 shrink-0" />

            {/* Right field: Location Selector Input */}
            <div className="relative flex-1 flex items-center min-w-0">
              <button
                type="button"
                onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                className="w-full px-3.5 sm:px-4 py-3 sm:py-3.5 bg-transparent text-left text-slate-800 dark:text-slate-200 text-sm font-semibold flex items-center justify-between min-h-[44px] cursor-pointer"
                aria-expanded={cityDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Filter by city"
              >
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className={`truncate ${selectedCity ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                    {getCityLabel()}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ml-1 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {cityDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-45" onClick={() => setCityDropdownOpen(false)} />
                  <div
                    role="listbox"
                    className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 py-1.5 text-left max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
                  >
                    {cities.map((city) => {
                      const isSelected = (!selectedCity && city.id === 'all') || selectedCity === city.id;
                      return (
                        <button
                          key={city.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleCitySelect(city.id)}
                          className={`w-full px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between min-h-[44px] ${
                            isSelected
                              ? 'text-[#0054a6] dark:text-indigo-400 bg-blue-50/60 dark:bg-indigo-950/40'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <MapPin className="w-3.5 h-3.5 opacity-60 shrink-0" />
                            <span>{city.label}</span>
                          </div>
                          {isSelected && (
                            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">Selected</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Deep Blue Action Search Button (Full-width on mobile with text, compact on tablet/desktop) */}
            <button
              type="submit"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#0054a6] hover:bg-[#004080] active:scale-[0.98] text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl transition-all font-bold shrink-0 shadow-lg shadow-blue-900/20 min-h-[48px] cursor-pointer"
              aria-label="Submit Search"
            >
              <Search className="w-4.5 h-4.5 shrink-0" />
              <span className="text-sm font-bold">Search</span>
            </button>
          </form>

          {/* Quick Category Buttons: Touch-friendly horizontal scroller on mobile, centered wrap on tablet/desktop */}
          <div className="pt-3.5 sm:pt-5">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory py-1.5 -mx-3.5 px-3.5 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center sm:gap-2.5 text-xs font-semibold select-none">
              <button
                type="button"
                onClick={() => {
                  onQueryChange('Restaurants');
                  onSearch('Restaurants');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-xs border border-white/15 text-white transition-all whitespace-nowrap min-h-[44px] shrink-0 snap-start active:scale-95"
              >
                <Utensils className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Restaurants</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onQueryChange('Plumbers');
                  onSearch('Plumbers');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-xs border border-white/15 text-white transition-all whitespace-nowrap min-h-[44px] shrink-0 snap-start active:scale-95"
              >
                <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Plumbers</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onQueryChange('Nail Salons');
                  onSearch('Nail Salons');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-xs border border-white/15 text-white transition-all whitespace-nowrap min-h-[44px] shrink-0 snap-start active:scale-95"
              >
                <SparklesIcon className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Nail Salons</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onQueryChange('HVAC Contractors');
                  onSearch('HVAC Contractors');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-xs border border-white/15 text-white transition-all whitespace-nowrap min-h-[44px] shrink-0 snap-start active:scale-95"
              >
                <Wind className="w-4 h-4 text-amber-400 shrink-0" />
                <span>HVAC Contractors</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onQueryChange('Electricians');
                  onSearch('Electricians');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-xs border border-white/15 text-white transition-all whitespace-nowrap min-h-[44px] shrink-0 snap-start active:scale-95"
              >
                <Plug className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Electricians</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onQueryChange('General Contractors');
                  onSearch('General Contractors');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-xs border border-white/15 text-white transition-all whitespace-nowrap min-h-[44px] shrink-0 snap-start active:scale-95"
              >
                <Hammer className="w-4 h-4 text-amber-400 shrink-0" />
                <span>General Contractors</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
