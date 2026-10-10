import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  MapPin,
  Utensils,
  Wrench,
  Sparkles as SparklesIcon,
  Wind,
  Plug,
  Hammer,
  Navigation,
  Loader2,
  Check,
  ChevronDown,
  ShoppingBag,
  Smartphone,
  Shirt,
  HeartPulse,
  Home,
  Car,
  BriefcaseBusiness,
  Coffee,
  GraduationCap,
  Layers,
} from 'lucide-react';
import type { DiscoverySearchType, DiscoveryCategory, DiscoveryGeoLocation } from '../../types/discovery';
import { discoveryApi } from '../../services/discoveryApi';

interface DiscoveryHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  activeType: DiscoverySearchType;
  onTypeChange: (type: DiscoverySearchType) => void;
  selectedCity?: string;
  selectedDistrict?: string;
  selectedRegion?: string;
  selectedLocality?: string;
  onCityChange: (loc: {
    city?: string;
    district?: string;
    region?: string;
    locality?: string;
    lat?: number | null;
    lng?: number | null;
  }) => void;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
  categories?: DiscoveryCategory[];
  selectedCategoryId?: string;
  onSelectCategory?: (categoryId: string) => void;
  geoLocations?: DiscoveryGeoLocation[];
  suggestions?: string[];
  className?: string;
}

// Fallback Provinces/Regions when database geoLocations are loading
const DEFAULT_PROVINCES = [
  'Western Area',
  'Eastern Province',
  'Northern Province',
  'Southern Province',
  'North West Province',
];

// Fallback Districts grouped by Province/Region
const DEFAULT_DISTRICTS_MAP: Record<string, string[]> = {
  'Western Area': ['Western Area Urban', 'Western Area Rural'],
  'Eastern Province': ['Kenema District', 'Kono District', 'Kailahun District'],
  'Northern Province': ['Bombali District', 'Tonkolili District', 'Koinadugu District', 'Falaba District'],
  'Southern Province': ['Bo District', 'Moyamba District', 'Pujehun District', 'Bonthe District'],
  'North West Province': ['Port Loko District', 'Kambia District', 'Karene District'],
};

// Fallback Cities/Towns grouped by District
const DEFAULT_CITIES_MAP: Record<string, string[]> = {
  'Western Area Urban': ['Freetown'],
  'Western Area Rural': ['Waterloo'],
  'Bo District': ['Bo'],
  'Kenema District': ['Kenema'],
  'Bombali District': ['Makeni'],
  'Kono District': ['Koidu'],
  'Port Loko District': ['Port Loko', 'Lunsar'],
  'Koinadugu District': ['Kabala'],
};

const getHeroCategoryIcon = (slugOrName: string, iconName?: string | null) => {
  const s = `${iconName || ''} ${slugOrName}`.toLowerCase();
  if (s.includes('edu') || s.includes('school') || s.includes('train') || s.includes('grad') || s.includes('book')) return GraduationCap;
  if (s.includes('food') || s.includes('restaurant') || s.includes('dining') || s.includes('utensil')) return Utensils;
  if (s.includes('tech') || s.includes('electronic') || s.includes('phone') || s.includes('smart')) return Smartphone;
  if (s.includes('fashion') || s.includes('cloth') || s.includes('apparel') || s.includes('shirt')) return Shirt;
  if (s.includes('health') || s.includes('pharmacy') || s.includes('medical') || s.includes('heart')) return HeartPulse;
  if (s.includes('beauty') || s.includes('salon') || s.includes('barber') || s.includes('sparkle')) return SparklesIcon;
  if (s.includes('home') || s.includes('furniture') || s.includes('construction') || s.includes('garden')) return Home;
  if (s.includes('auto') || s.includes('car') || s.includes('mechanic')) return Car;
  if (s.includes('professional') || s.includes('consult') || s.includes('legal') || s.includes('briefcase')) return BriefcaseBusiness;
  if (s.includes('hvac') || s.includes('wind') || s.includes('ac')) return Wind;
  if (s.includes('elec') || s.includes('plug')) return Plug;
  if (s.includes('contract') || s.includes('hammer') || s.includes('build')) return Hammer;
  if (s.includes('repair') || s.includes('plumb') || s.includes('service') || s.includes('wrench')) return Wrench;
  if (s.includes('retail') || s.includes('grocery') || s.includes('market') || s.includes('shop') || s.includes('bag')) return ShoppingBag;
  if (s.includes('cafe') || s.includes('drink') || s.includes('bakery') || s.includes('coffee')) return Coffee;
  return Layers;
};

export const DiscoveryHero: React.FC<DiscoveryHeroProps> = ({
  query,
  onQueryChange,
  onSearch,
  activeType,
  onTypeChange,
  selectedCity,
  selectedDistrict,
  selectedRegion,
  selectedLocality,
  onCityChange,
  latitude,
  longitude,
  radiusKm = 25,
  categories: propCategories,
  selectedCategoryId,
  onSelectCategory,
  geoLocations: propGeoLocations,
  className = '',
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [gpsActive, setGpsActive] = useState(latitude != null && longitude != null);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [fetchedGeoLocations, setFetchedGeoLocations] = useState<DiscoveryGeoLocation[]>([]);
  const [fetchedCategories, setFetchedCategories] = useState<DiscoveryCategory[]>([]);

  // Fetch geo locations if not provided by parent
  useEffect(() => {
    if (propGeoLocations && propGeoLocations.length > 0) return;
    let active = true;
    discoveryApi
      .getGeoLocations()
      .then((locs) => {
        if (active && Array.isArray(locs)) setFetchedGeoLocations(locs);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [propGeoLocations]);

  // Fetch categories if not provided by parent
  useEffect(() => {
    if (propCategories && propCategories.length > 0) return;
    let active = true;
    discoveryApi
      .getCategories()
      .then((cats) => {
        if (active && Array.isArray(cats)) setFetchedCategories(cats);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [propCategories]);

  const activeGeoLocations = useMemo(
    () => (propGeoLocations && propGeoLocations.length > 0 ? propGeoLocations : fetchedGeoLocations),
    [propGeoLocations, fetchedGeoLocations]
  );

  const activeCategories = useMemo(
    () => (propCategories && propCategories.length > 0 ? propCategories : fetchedCategories),
    [propCategories, fetchedCategories]
  );

  // Sync state to props dynamically
  useEffect(() => {
    setGpsActive(latitude != null && longitude != null);
  }, [latitude, longitude]);

  // Available Regions/Provinces from DB or fallback
  const availableRegions = useMemo(() => {
    const dbRegions = activeGeoLocations.filter((l) => l.location_type === 'REGION' && l.is_active);
    if (dbRegions.length > 0) {
      return dbRegions.map((r) => r.name);
    }
    return DEFAULT_PROVINCES;
  }, [activeGeoLocations]);

  // Available districts based on selected region
  const availableDistricts = useMemo(() => {
    if (!selectedRegion) return [];
    const dbRegions = activeGeoLocations.filter((l) => l.location_type === 'REGION' && l.is_active);
    if (dbRegions.length > 0) {
      const matchedRegion = dbRegions.find((r) => r.name.toLowerCase() === selectedRegion.toLowerCase());
      if (matchedRegion) {
        return activeGeoLocations
          .filter((l) => l.location_type === 'DISTRICT' && l.parent_id === matchedRegion.id && l.is_active)
          .map((d) => d.name);
      }
    }
    return DEFAULT_DISTRICTS_MAP[selectedRegion] || [];
  }, [selectedRegion, activeGeoLocations]);

  // Available cities based on selected district (or all active cities if no district selected)
  const availableCities = useMemo(() => {
    const dbDistricts = activeGeoLocations.filter((l) => l.location_type === 'DISTRICT' && l.is_active);
    if (dbDistricts.length > 0) {
      if (selectedDistrict) {
        const matchedDistrict = dbDistricts.find((d) => d.name.toLowerCase() === selectedDistrict.toLowerCase());
        if (matchedDistrict) {
          return activeGeoLocations
            .filter((l) => l.location_type === 'CITY' && l.parent_id === matchedDistrict.id && l.is_active)
            .map((c) => c.name);
        }
      } else if (selectedRegion) {
        const dbRegions = activeGeoLocations.filter((l) => l.location_type === 'REGION' && l.is_active);
        const matchedRegion = dbRegions.find((r) => r.name.toLowerCase() === selectedRegion.toLowerCase());
        if (matchedRegion) {
          const regionDistrictIds = new Set(
            dbDistricts.filter((d) => d.parent_id === matchedRegion.id).map((d) => d.id)
          );
          return activeGeoLocations
            .filter((l) => l.location_type === 'CITY' && l.parent_id && regionDistrictIds.has(l.parent_id) && l.is_active)
            .map((c) => c.name);
        }
      } else {
        return activeGeoLocations
          .filter((l) => l.location_type === 'CITY' && l.is_active)
          .map((c) => c.name);
      }
    }
    if (!selectedDistrict) {
      return Object.values(DEFAULT_CITIES_MAP).flat();
    }
    return DEFAULT_CITIES_MAP[selectedDistrict] || [];
  }, [selectedDistrict, selectedRegion, activeGeoLocations]);

  // Top-level categories for quick hero pills (includes newly created categories!)
  const availableCommunities = useMemo(() => {
    const activeCities = activeGeoLocations.filter((location) => location.location_type === 'CITY' && location.is_active);
    let allowedCityIds = activeCities.map((city) => city.id);
    if (selectedCity) {
      allowedCityIds = activeCities.filter((city) => city.name.toLocaleLowerCase() === selectedCity.toLocaleLowerCase()).map((city) => city.id);
    } else if (selectedDistrict) {
      const districtIds = new Set(activeGeoLocations.filter((location) => location.location_type === 'DISTRICT' && location.is_active && location.name.toLocaleLowerCase() === selectedDistrict.toLocaleLowerCase()).map((location) => location.id));
      allowedCityIds = activeCities.filter((city) => city.parent_id && districtIds.has(city.parent_id)).map((city) => city.id);
    } else if (selectedRegion) {
      const regionIds = new Set(activeGeoLocations.filter((location) => location.location_type === 'REGION' && location.is_active && location.name.toLocaleLowerCase() === selectedRegion.toLocaleLowerCase()).map((location) => location.id));
      const districtIds = new Set(activeGeoLocations.filter((location) => location.location_type === 'DISTRICT' && location.is_active && location.parent_id && regionIds.has(location.parent_id)).map((location) => location.id));
      allowedCityIds = activeCities.filter((city) => city.parent_id && districtIds.has(city.parent_id)).map((city) => city.id);
    }
    const cityIds = new Set(allowedCityIds);
    return activeGeoLocations.filter((location) => location.location_type === 'COMMUNITY' && location.is_active && location.parent_id && cityIds.has(location.parent_id)).sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  }, [activeGeoLocations, selectedCity, selectedDistrict, selectedRegion]);

  // Top-level categories for quick hero pills (includes newly created categories!)
  const quickCategories = useMemo(() => {
    const parents = activeCategories.filter((c) => !c.parent_id && c.is_active !== false);
    if (parents.length > 0) {
      return parents;
    }
    return [];
  }, [activeCategories]);

  // Handle Province/Region dropdown selection
  const handleRegionSelect = (region: string) => {
    setGpsActive(false);
    if (!region) {
      onCityChange({ city: undefined, district: undefined, region: undefined, lat: null, lng: null });
    } else {
      onCityChange({ city: undefined, district: undefined, region, lat: null, lng: null });
    }
  };

  // Handle District dropdown selection
  const handleDistrictSelect = (district: string) => {
    setGpsActive(false);
    if (!district) {
      onCityChange({ city: undefined, district: undefined, region: selectedRegion, lat: null, lng: null });
    } else {
      onCityChange({ city: undefined, district, region: selectedRegion, lat: null, lng: null });
    }
  };

  // Handle City dropdown selection
  const handleCitySelect = (city: string) => {
    setGpsActive(false);
    if (!city) {
      onCityChange({ city: undefined, district: selectedDistrict, region: selectedRegion, locality: undefined, lat: null, lng: null });
    } else {
      onCityChange({ city, district: selectedDistrict, region: selectedRegion, lat: null, lng: null });
    }
    setCityDropdownOpen(false);
  };

  const handleCommunitySelect = (communityName: string) => {
    setGpsActive(false);
    const community = availableCommunities.find((location) => location.name === communityName);
    const city = community?.parent_id ? activeGeoLocations.find((location) => location.id === community.parent_id) : undefined;
    const district = city?.parent_id ? activeGeoLocations.find((location) => location.id === city.parent_id) : undefined;
    const region = district?.parent_id ? activeGeoLocations.find((location) => location.id === district.parent_id) : undefined;
    onCityChange({ city: city?.name || selectedCity, district: district?.name || selectedDistrict, region: region?.name || selectedRegion, locality: communityName, lat: null, lng: null });
    setCityDropdownOpen(false);
  };

  // GPS Geolocation Handler inside Hero
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setGpsActive(true);
        // Wipe chosen text taxonomy filters and trigger GPS bounding search
        onCityChange({
          city: undefined,
          district: undefined,
          region: undefined,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setCityDropdownOpen(false);
      },
      (error) => {
        setIsLocating(false);
        alert('Unable to detect current location. Please choose from dropdown selectors.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  return (
    <section className={`relative overflow-hidden bg-transparent text-white pt-6 pb-8 sm:pt-10 sm:pb-14 md:pt-16 md:pb-20 px-3.5 sm:px-6 lg:px-8 select-none ${className}`}>
      <div className="relative max-w-4xl mx-auto text-center space-y-5 sm:space-y-6 md:space-y-8">
        
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

        <div className="max-w-3xl mx-auto">
          {/* Province and District Dropdown fields placed ABOVE the main search bar */}
          <div className="flex flex-row justify-center gap-2 max-w-md mx-auto mb-3.5">
            {/* Province Select */}
            <div className="relative">
              <select
                value={selectedRegion || ''}
                onChange={(e) => handleRegionSelect(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 dark:bg-slate-900/60 backdrop-blur-md border border-white/10 dark:border-slate-800 text-white dark:text-slate-200 text-[10.5px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer appearance-none min-w-[125px] sm:min-w-[145px] pr-8"
              >
                <option value="" className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 font-bold">All Regions</option>
                {availableRegions.map((prov) => (
                  <option key={prov} value={prov} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                    {prov}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-3 pointer-events-none text-slate-300">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* District Select */}
            <div className="relative">
              <select
                disabled={!selectedRegion}
                value={selectedDistrict || ''}
                onChange={(e) => handleDistrictSelect(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 dark:bg-slate-900/60 backdrop-blur-md border border-white/10 dark:border-slate-800 text-white dark:text-slate-200 text-[10.5px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed appearance-none min-w-[125px] sm:min-w-[145px] pr-8"
              >
                <option value="" className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 font-bold">All Districts</option>
                {availableDistricts.map((dist) => (
                  <option key={dist} value={dist} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                    {dist}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-3 pointer-events-none text-slate-300">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Unified Search form container with City Selector Popover */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch(query);
            }}
            className="flex flex-col md:flex-row items-stretch w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-1.5 gap-1.5 md:gap-1 border border-slate-200/90 dark:border-slate-800 relative"
          >
            {/* Inputs Container - always side-by-side row on mobile and tablet, wraps with search button below on mobile, inline on md */}
            <div className="flex-1 flex flex-row items-center min-w-0 gap-1 md:gap-0">
              
              {/* 1. City Selector Field - order-1 on mobile/tablet, order-3 on desktop */}
              <div className="relative flex-1 flex items-center min-w-0 order-1 md:order-3">
                <button
                  type="button"
                  onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                  className="w-full px-2 sm:px-4 py-3 sm:py-3.5 bg-transparent text-left text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-between min-h-[44px] cursor-pointer"
                  aria-expanded={cityDropdownOpen}
                  aria-haspopup="listbox"
                  aria-label="Select city"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                    <MapPin className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${gpsActive ? 'text-emerald-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}`} />
                    <span className={`truncate ${selectedCity || gpsActive ? 'text-slate-900 dark:text-white font-black' : 'text-slate-500 dark:text-slate-400'}`}>
                      {gpsActive ? 'Near My Location' : selectedLocality || selectedCity || 'Select City'}
                    </span>
                    {gpsActive && (
                      <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black bg-emerald-500 text-white animate-pulse shrink-0">
                        <Navigation className="w-1.5 h-1.5 sm:w-2 sm:h-2 fill-current" />
                        Active
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0 ml-0.5 sm:ml-1 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {cityDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-45" onClick={() => setCityDropdownOpen(false)} />
                    <div
                      role="listbox"
                      className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2.5 text-left max-h-72 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1 duration-150 flex flex-col gap-1.5"
                    >
                      {/* GPS Geolocation Trigger button inside city list selector */}
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isLocating}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          gpsActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                            : 'bg-indigo-50 hover:bg-indigo-100/85 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 border-indigo-100 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isLocating ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                          ) : (
                            <Navigation className={`w-4 h-4 shrink-0 ${gpsActive ? 'fill-emerald-500 text-emerald-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}`} />
                          )}
                          <span>{isLocating ? 'Detecting GPS Location…' : gpsActive ? 'GPS Location Enabled' : 'Use Current GPS Location'}</span>
                        </div>
                        {gpsActive && <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-md uppercase font-black tracking-wider animate-pulse">Active</span>}
                      </button>

                      <div className="h-px bg-slate-100 dark:bg-slate-800/80 my-1 shrink-0" />

                      {/* Filtered cities list based on District or Region selected above */}
                      <div className="overflow-y-auto max-h-44 space-y-0.5">
                        {availableCities.length === 0 ? (
                          <div className="p-3 text-center text-xs font-semibold text-slate-400 dark:text-slate-500 italic">
                            No cities listed for this selection
                          </div>
                        ) : (
                          availableCities.map((cityName) => {
                            const isSelected = selectedCity === cityName && !gpsActive;
                            return (
                              <button
                                key={cityName}
                                type="button"
                                onClick={() => handleCitySelect(cityName)}
                                className={`w-full px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between min-h-[38px] cursor-pointer ${
                                  isSelected ? 'text-[#0054a6] dark:text-indigo-400 bg-blue-50/60 dark:bg-indigo-950/40' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <MapPin className="w-3.5 h-3.5 opacity-50 shrink-0" />
                                  <span className="truncate">{cityName}</span>
                                </div>
                                {isSelected && <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">✓</span>}
                              </button>
                            );
                          })
                        )}
                      </div>

                      {availableCommunities.length > 0 && (
                        <>
                          <div className="h-px bg-slate-100 dark:bg-slate-800/80 my-2" />
                          <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Communities & villages</div>
                          <div className="overflow-y-auto max-h-36 space-y-0.5">
                            {availableCommunities.map((community) => (
                              <button key={community.id} type="button" onClick={() => handleCommunitySelect(community.name)} className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between min-h-[38px] ${selectedLocality === community.name ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                <span className="truncate">{community.name}</span>
                                {selectedLocality === community.name && <Check className="w-3.5 h-3.5 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Clear Button Option */}
                      {(selectedCity || gpsActive) && (
                        <button
                          type="button"
                          onClick={() => {
                            setGpsActive(false);
                            onCityChange({ city: undefined, district: selectedDistrict, region: selectedRegion, lat: null, lng: null });
                            setCityDropdownOpen(false);
                          }}
                          className="text-center w-full py-1 text-[10px] font-black uppercase text-rose-500 hover:underline border-t border-slate-100 dark:border-slate-800/80 pt-2 cursor-pointer mt-1"
                        >
                          Clear Location Filters
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Vertical Split Line for desktop - order-2, hidden on mobile/tablet */}
              <div className="hidden md:block w-px bg-slate-200 dark:bg-slate-700 my-2 shrink-0 order-2" />

              {/* Mobile/Tablet vertical border between side-by-side elements - hidden on desktop */}
              <div className="md:hidden w-px bg-slate-200 dark:bg-slate-800 h-6 shrink-0 order-2" />

              {/* 2. Keyword search text field - order-2 on mobile/tablet, order-1 on desktop */}
              <div className="flex-1 flex items-center min-w-0 order-2 md:order-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search local services or products…"
                  className="w-full px-2 sm:px-4 py-3 sm:py-3.5 bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-0 min-h-[44px]"
                />
              </div>
            </div>

            {/* Deep Blue Action Search Button */}
            <button
              type="submit"
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#0054a6] hover:bg-[#004080] active:scale-[0.98] text-white px-6 py-3 rounded-xl transition-all font-black shrink-0 shadow-lg shadow-blue-900/20 min-h-[44px] cursor-pointer"
              aria-label="Submit Search"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-bold">Search</span>
            </button>
          </form>

          {/* Quick Category Buttons: Dynamically rendered from platform-governed categories */}
          <div className="pt-3 sm:pt-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 py-1 w-full text-[10px] sm:text-xs font-bold select-none">
              {quickCategories.length > 0 ? (
                quickCategories.map((cat) => {
                  const Icon = getHeroCategoryIcon(cat.slug || cat.name, cat.icon_name);
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        if (onSelectCategory) {
                          onSelectCategory(cat.id);
                        } else {
                          onQueryChange(cat.name);
                          onSearch(cat.name);
                        }
                      }}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'bg-white/10 hover:bg-white/20 text-white hover:text-amber-300 border border-white/10'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-slate-950' : 'text-amber-400'}`} />
                      <span>{cat.name}</span>
                    </button>
                  );
                })
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('Restaurants');
                      onSearch('Restaurants');
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 hover:text-amber-300 text-white border border-white/10 transition-all whitespace-nowrap shrink-0 active:scale-95"
                  >
                    <Utensils className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Restaurants</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('Plumbers');
                      onSearch('Plumbers');
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 hover:text-amber-300 text-white border border-white/10 transition-all whitespace-nowrap shrink-0 active:scale-95"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Plumbers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('Nail Salons');
                      onSearch('Nail Salons');
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 hover:text-amber-300 text-white border border-white/10 transition-all whitespace-nowrap shrink-0 active:scale-95"
                  >
                    <SparklesIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Nail Salons</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('Electricians');
                      onSearch('Electricians');
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 hover:text-amber-300 text-white border border-white/10 transition-all whitespace-nowrap shrink-0 active:scale-95"
                  >
                    <Plug className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Electricians</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
