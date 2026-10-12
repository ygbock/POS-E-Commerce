import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  X,
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
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [geoErrorMsg, setGeoErrorMsg] = useState<string | null>(null);
  const [fetchedGeoLocations, setFetchedGeoLocations] = useState<DiscoveryGeoLocation[]>([]);
  const [hasFetchedGeoLocations, setHasFetchedGeoLocations] = useState(false);
  const [fetchedCategories, setFetchedCategories] = useState<DiscoveryCategory[]>([]);
  const cityDropdownContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cityDropdownOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCityDropdownOpen(false);
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (cityDropdownContainerRef.current && !cityDropdownContainerRef.current.contains(event.target as Node)) {
        setCityDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [cityDropdownOpen]);

  // Refresh platform-managed geography whenever the picker opens, so additions appear without a page reload.
  useEffect(() => {
    if (!cityDropdownOpen) return;
    let active = true;
    discoveryApi
      .getGeoLocations()
      .then((locs) => {
        if (active && Array.isArray(locs)) {
          setFetchedGeoLocations(locs);
          setHasFetchedGeoLocations(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [cityDropdownOpen]);

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
    () => hasFetchedGeoLocations ? fetchedGeoLocations : (propGeoLocations && propGeoLocations.length > 0 ? propGeoLocations : fetchedGeoLocations),
    [hasFetchedGeoLocations, fetchedGeoLocations, propGeoLocations]
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
      const cityRecord = activeGeoLocations.find((l) => l.location_type === 'CITY' && l.name.toLowerCase() === city.toLowerCase());
      const districtRecord = cityRecord?.parent_id ? activeGeoLocations.find((l) => l.id === cityRecord.parent_id) : undefined;
      const regionRecord = districtRecord?.parent_id ? activeGeoLocations.find((l) => l.id === districtRecord.parent_id) : undefined;
      onCityChange({
        city,
        district: districtRecord?.name || selectedDistrict,
        region: regionRecord?.name || selectedRegion,
        locality: undefined,
        lat: null,
        lng: null,
      });
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
      setGeoErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setGpsActive(true);
        // Wipe chosen text taxonomy filters and trigger GPS bounding search
        onCityChange({
          city: undefined,
          district: undefined,
          region: undefined,
          locality: undefined,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setCityDropdownOpen(false);
      },
      () => {
        setIsLocating(false);
        setGeoErrorMsg('Unable to detect current location. Please choose a city or community below.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const filteredCities = useMemo(() => {
    const q = citySearchQuery.trim().toLowerCase();
    if (!q) return availableCities;
    return availableCities.filter((city) => city.toLowerCase().includes(q));
  }, [availableCities, citySearchQuery]);

  const filteredCommunities = useMemo(() => {
    const q = citySearchQuery.trim().toLowerCase();
    if (!q) return availableCommunities;
    return availableCommunities.filter((c) => c.name.toLowerCase().includes(q));
  }, [availableCommunities, citySearchQuery]);

  return (
    <section className={`relative bg-transparent text-white pt-6 pb-8 sm:pt-10 sm:pb-14 md:pt-16 md:pb-20 px-3.5 sm:px-6 lg:px-8 select-none ${className}`}>
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
          <div className="grid grid-cols-2 sm:flex sm:flex-row justify-center gap-2 max-w-md mx-auto mb-3.5">
            {/* Province Select */}
            <div className="relative">
              <select
                value={selectedRegion || ''}
                onChange={(e) => handleRegionSelect(e.target.value)}
                aria-label="Filter by region"
                className="w-full px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 dark:bg-slate-900/60 backdrop-blur-md border border-white/15 dark:border-slate-800 text-white dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer appearance-none sm:min-w-[160px] pr-8 truncate"
              >
                <option value="" className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 font-bold">All Regions</option>
                {availableRegions.map((prov) => (
                  <option key={prov} value={prov} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                    {prov}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* District Select */}
            <div className="relative">
              <select
                disabled={!selectedRegion}
                value={selectedDistrict || ''}
                onChange={(e) => handleDistrictSelect(e.target.value)}
                aria-label="Filter by district"
                className="w-full px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 dark:bg-slate-900/60 backdrop-blur-md border border-white/15 dark:border-slate-800 text-white dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed appearance-none sm:min-w-[160px] pr-8 truncate"
              >
                <option value="" className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 font-bold">All Districts</option>
                {availableDistricts.map((dist) => (
                  <option key={dist} value={dist} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                    {dist}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
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
            className="flex flex-col md:flex-row items-stretch w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-1.5 gap-1.5 md:gap-1 border border-slate-200/90 dark:border-slate-800 relative z-30"
          >
            {/* Inputs Container - responsive on mobile/tablet/desktop */}
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center min-w-0 gap-1 sm:gap-1 md:gap-0 relative">
              
              {/* 1. City Selector Field - order-2 on mobile/tablet, order-3 on desktop */}
              <div ref={cityDropdownContainerRef} className="relative w-full sm:w-52 md:w-64 lg:w-72 shrink-0 flex items-center min-w-0 order-2 sm:order-2 md:order-3">
                <button
                  type="button"
                  onClick={() => {
                    setCityDropdownOpen((prev) => !prev);
                    setGeoErrorMsg(null);
                  }}
                  className="w-full px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-xl sm:rounded-xl md:rounded-none bg-slate-50/90 sm:bg-slate-50/50 md:bg-transparent dark:bg-slate-800/60 md:dark:bg-transparent border border-slate-200/70 sm:border-transparent dark:border-slate-700/70 md:dark:border-transparent text-left text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-between min-h-[44px] cursor-pointer hover:bg-slate-100/80 sm:hover:bg-slate-50/80 dark:hover:bg-slate-800/70 transition-colors"
                  aria-expanded={cityDropdownOpen}
                  aria-haspopup="listbox"
                  aria-label="Select city"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MapPin className={`w-4 h-4 shrink-0 ${gpsActive ? 'text-emerald-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}`} />
                    <div className="min-w-0 flex-1">
                      <span className={`block truncate ${selectedLocality || selectedCity || gpsActive ? 'text-slate-900 dark:text-white font-black' : 'text-slate-500 dark:text-slate-400'}`}>
                        {gpsActive ? 'Near My Location' : selectedLocality || selectedCity || selectedDistrict || selectedRegion || 'Select City / Town'}
                      </span>
                      {!gpsActive && (selectedLocality || selectedCity || selectedDistrict) && (
                        <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate leading-tight">
                          {selectedLocality && selectedCity
                            ? `${selectedCity}${selectedDistrict ? ` · ${selectedDistrict}` : ''}`
                            : selectedCity && selectedDistrict
                            ? `${selectedDistrict}${selectedRegion ? ` · ${selectedRegion}` : ''}`
                            : selectedRegion || 'Sierra Leone'}
                        </span>
                      )}
                    </div>
                    {gpsActive && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500 text-white animate-pulse shrink-0">
                        <Navigation className="w-2 h-2 fill-current" />
                        GPS
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ml-1.5 transition-transform duration-200 ${cityDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
                </button>

                {cityDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-slate-950/35 sm:bg-transparent backdrop-blur-[1px] sm:backdrop-blur-none"
                      onClick={() => setCityDropdownOpen(false)}
                    />
                    <div
                      role="listbox"
                      aria-label="City and community selector"
                      className="fixed sm:absolute inset-x-3 bottom-3 sm:inset-auto sm:top-full sm:right-0 sm:mt-2 w-auto sm:w-[360px] md:w-[420px] lg:w-[460px] max-w-[calc(100vw-1.5rem)] max-h-[82vh] sm:max-h-[480px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-3.5 sm:p-4 text-left z-50 animate-in fade-in slide-in-from-bottom-2 sm:slide-in-from-top-1 duration-150 flex flex-col gap-2.5"
                    >
                      {/* Header with Active Breadcrumb & Close Button */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                        <div className="min-w-0 pr-2">
                          <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">Choose City, Town or Community</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {selectedRegion ? `${selectedRegion}${selectedDistrict ? ` › ${selectedDistrict}` : ''}${selectedCity ? ` › ${selectedCity}` : ''}` : 'All Regions in Sierra Leone'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCityDropdownOpen(false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                          aria-label="Close location menu"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* GPS Geolocation Trigger button inside city list selector */}
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isLocating}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shrink-0 min-h-[42px] ${
                          gpsActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                            : 'bg-indigo-50 hover:bg-indigo-100/85 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 border-indigo-100 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isLocating ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                          ) : (
                            <Navigation className={`w-4 h-4 shrink-0 ${gpsActive ? 'fill-emerald-500 text-emerald-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}`} />
                          )}
                          <span className="truncate">{isLocating ? 'Detecting GPS Location…' : gpsActive ? 'GPS Location Enabled' : 'Use Current GPS Location'}</span>
                        </div>
                        {gpsActive && <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-md uppercase font-black tracking-wider animate-pulse shrink-0">Active</span>}
                      </button>

                      {geoErrorMsg && (
                        <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300 font-medium shrink-0">
                          {geoErrorMsg}
                        </div>
                      )}

                      {/* Quick filter input inside dropdown */}
                      <div className="relative shrink-0">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={citySearchQuery}
                          onChange={(e) => setCitySearchQuery(e.target.value)}
                          placeholder="Search Freetown, Bo, Kenema, Lumley…"
                          className="w-full pl-8 pr-8 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                        {citySearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCitySearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            aria-label="Clear filter"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Quick Region Filter Pills inside Dropdown for Mobile & Desktop convenience */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
                        <button
                          type="button"
                          onClick={() => handleRegionSelect('')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-colors cursor-pointer ${
                            !selectedRegion
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          All Regions
                        </button>
                        {availableRegions.map((reg) => {
                          const isRegActive = selectedRegion === reg;
                          return (
                            <button
                              key={reg}
                              type="button"
                              onClick={() => handleRegionSelect(isRegActive ? '' : reg)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-colors cursor-pointer ${
                                isRegActive
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {reg}
                            </button>
                          );
                        })}
                      </div>

                      {/* Scrollable container for both Cities and Communities */}
                      <div className="overflow-y-auto flex-1 pr-0.5 space-y-3 min-h-[140px] max-h-[44vh] sm:max-h-[250px]">
                        {/* Cities / Towns Section */}
                        <div>
                          <div className="px-2 pb-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <span>Cities & Towns</span>
                            <span>{filteredCities.length}</span>
                          </div>
                          {filteredCities.length === 0 ? (
                            <div className="p-3 text-center text-xs font-semibold text-slate-400 dark:text-slate-500 italic">
                              No matching cities found
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {filteredCities.map((cityName) => {
                                const isSelected = selectedCity === cityName && !selectedLocality && !gpsActive;
                                const cityRecord = activeGeoLocations.find((l) => l.location_type === 'CITY' && l.name === cityName);
                                const parentDistrict = cityRecord?.parent_id ? activeGeoLocations.find((l) => l.id === cityRecord.parent_id)?.name : undefined;
                                return (
                                  <button
                                    key={cityName}
                                    type="button"
                                    onClick={() => handleCitySelect(cityName)}
                                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between min-h-[42px] cursor-pointer border text-left ${
                                      isSelected
                                        ? 'text-[#0054a6] dark:text-indigo-300 bg-blue-50/90 dark:bg-indigo-950/60 border-blue-200 dark:border-indigo-800'
                                        : 'text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#0054a6] dark:text-indigo-400' : 'text-slate-400'}`} />
                                      <div className="min-w-0">
                                        <span className="block truncate">{cityName}</span>
                                        {parentDistrict && (
                                          <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate">
                                            {parentDistrict}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400 ml-1" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Communities & Villages Section */}
                        {filteredCommunities.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            <div className="px-2 pb-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                              <span>Communities & Neighborhoods</span>
                              <span>{filteredCommunities.length}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {filteredCommunities.map((community) => {
                                const isSelected = selectedLocality === community.name && !gpsActive;
                                const parentCity = community.parent_id ? activeGeoLocations.find((l) => l.id === community.parent_id)?.name : undefined;
                                return (
                                  <button
                                    key={community.id}
                                    type="button"
                                    onClick={() => handleCommunitySelect(community.name)}
                                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between min-h-[42px] cursor-pointer border transition-colors ${
                                      isSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                        : 'text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <div className="min-w-0 pr-1">
                                      <span className="block truncate">{community.name}</span>
                                      {parentCity && (
                                        <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate">
                                          {parentCity}
                                        </span>
                                      )}
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Clear Button Option */}
                      {(selectedCity || selectedLocality || selectedDistrict || selectedRegion || gpsActive) && (
                        <button
                          type="button"
                          onClick={() => {
                            setGpsActive(false);
                            setCitySearchQuery('');
                            onCityChange({ city: undefined, district: undefined, region: undefined, locality: undefined, lat: null, lng: null });
                            setCityDropdownOpen(false);
                          }}
                          className="text-center w-full py-2 text-[11px] font-black uppercase text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl border-t border-slate-100 dark:border-slate-800/80 cursor-pointer shrink-0 transition-colors"
                        >
                          Clear Location Filter
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Vertical Split Line for tablet/desktop - hidden on stacked mobile */}
              <div className="hidden sm:block w-px bg-slate-200 dark:bg-slate-700 my-2 h-7 shrink-0 order-2" />

              {/* 2. Keyword search text field - order-1 on all viewports for natural search-first flow */}
              <div className="flex-1 flex items-center min-w-0 order-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search local services, businesses, or products…"
                  className="w-full px-3 sm:px-4 py-3 sm:py-3.5 bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-0 min-h-[44px]"
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
