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
    <section className={`relative overflow-hidden bg-transparent text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 select-none ${className}`}>
      <div className="relative max-w-4xl mx-auto text-center space-y-8 sm:space-y-10">
        
        {/* Brand/Hero Title styled exactly like the screenshot */}
        <div className="space-y-3">
          <h1 className="text-5xl sm:text-6xl md:text-7xl tracking-tight leading-none italic select-none">
            <span className="font-serif font-light text-white">What's</span>
            <span className="font-sans font-black text-white ml-1.5 uppercase tracking-tighter">Nearby</span>
            <sup className="text-sm font-bold align-super ml-0.5 text-slate-300">™</sup>
          </h1>
          <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-300 font-medium tracking-wide">
            Discover local culinary experiences, verified services, and professional contractors around you.
          </p>
        </div>

        {/* Unified Dual-Input Search Bar */}
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch(query);
            }}
            className="flex flex-col md:flex-row items-stretch w-full bg-white rounded-lg shadow-2xl p-1 gap-1 border border-slate-200"
          >
            {/* Left field: Service Search */}
            <div className="flex-1 flex items-center min-w-0">
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search for Local Services"
                className="w-full px-4 py-3.5 bg-transparent text-slate-800 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-0"
              />
            </div>

            {/* Vertical Split Line */}
            <div className="hidden md:block w-px bg-slate-200 my-2 shrink-0" />

            {/* Right field: Location Selector Input */}
            <div className="relative flex-1 flex items-center min-w-0">
              <button
                type="button"
                onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                className="w-full px-4 py-3.5 bg-transparent text-left text-slate-800 text-sm font-semibold flex items-center justify-between"
              >
                <span className={selectedCity ? 'text-slate-800' : 'text-slate-400'}>
                  {getCityLabel()}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
              </button>

              {cityDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-45" onClick={() => setCityDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-2 rounded-lg bg-white border border-slate-200 shadow-2xl z-50 py-1 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                    {cities.map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => handleCitySelect(city.id)}
                        className={`w-full px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                          (!selectedCity && city.id === 'all') || selectedCity === city.id
                            ? 'text-[#0054a6] bg-slate-50'
                            : ''
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 opacity-60" />
                        <span>{city.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Deep Blue Action Search Button */}
            <button
              type="submit"
              className="flex items-center justify-center bg-[#0054a6] hover:bg-[#004080] text-white px-7 py-3.5 rounded-md transition-all font-bold shrink-0 shadow-lg shadow-blue-900/10"
              aria-label="Submit Search"
            >
              <Search className="w-5 h-5" />
            </button>
          </form>

          {/* Centered Category Quick Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 pt-6 text-xs font-bold text-white select-none">
            <button
              type="button"
              onClick={() => {
                onQueryChange('Restaurants');
                onSearch('Restaurants');
              }}
              className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
            >
              <Utensils className="w-3.5 h-3.5 group-hover:scale-110 transition-transform text-amber-400" />
              <span>Restaurants</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onQueryChange('Plumbers');
                onSearch('Plumbers');
              }}
              className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
            >
              <Wrench className="w-3.5 h-3.5 group-hover:scale-110 transition-transform text-amber-400" />
              <span>Plumbers</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onQueryChange('Nail Salons');
                onSearch('Nail Salons');
              }}
              className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
            >
              <SparklesIcon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform text-amber-400" />
              <span>Nail Salons</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onQueryChange('HVAC Contractors');
                onSearch('HVAC Contractors');
              }}
              className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
            >
              <Wind className="w-3.5 h-3.5 group-hover:scale-110 transition-transform text-amber-400" />
              <span>HVAC Contractors</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onQueryChange('Electricians');
                onSearch('Electricians');
              }}
              className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
            >
              <Plug className="w-3.5 h-3.5 group-hover:scale-110 transition-transform text-amber-400" />
              <span>Electricians</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onQueryChange('General Contractors');
                onSearch('General Contractors');
              }}
              className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
            >
              <Hammer className="w-3.5 h-3.5 group-hover:scale-110 transition-transform text-amber-400" />
              <span>General Contractors</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
