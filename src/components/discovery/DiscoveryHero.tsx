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
  AlertCircle,
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
      (positionError) => {
        setIsLocating(false);
        setGeoErrorMsg(positionError.code === positionError.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access in your browser/device settings, or choose a city or community below.'
          : positionError.code === positionError.POSITION_UNAVAILABLE
            ? 'Your device could not determine its location. Check location services or choose a city/community.'
            : 'Location request timed out. Try again or choose a city/community below.');
      },
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  const filteredCities = useMemo(() => {
    const q = citySearchQuery.trim().toLowerCase();
    if (!q) return availableCities;
    return availableCities.filter((city) => {
      if (city.toLowerCase().includes(q)) return true;
      const cityRecord = activeGeoLocations.find((l) => l.location_type === 'CITY' && l.name.toLowerCase() === city.toLowerCase());
      const parentDistrict = cityRecord?.parent_id ? activeGeoLocations.find((l) => l.id === cityRecord.parent_id) : undefined;
      const parentRegion = parentDistrict?.parent_id ? activeGeoLocations.find((l) => l.id === parentDistrict.parent_id) : undefined;
      return (
        (parentDistrict && parentDistrict.name.toLowerCase().includes(q)) ||
        (parentRegion && parentRegion.name.toLowerCase().includes(q))
      );
    });
  }, [availableCities, citySearchQuery, activeGeoLocations]);

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
              
              {/* 1. City Selector Field - order-2 on mobile, order-3 on tablet & desktop */}
              <div ref={cityDropdownContainerRef} className="relative w-full sm:w-56 md:w-64 lg:w-72 shrink-0 flex items-center min-w-0 order-2 sm:order-3">
                <button
                  type="button"
                  onClick={() => {
                    setCityDropdownOpen((prev) => !prev);
                    setGeoErrorMsg(null);
                  }}
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl md:rounded-none bg-slate-50/90 sm:bg-slate-50/70 md:bg-transparent dark:bg-slate-800/80 md:dark:bg-transparent border border-slate-200/80 sm:border-slate-200/60 md:border-transparent dark:border-slate-700/80 md:dark:border-transparent text-left text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-between min-h-[44px] cursor-pointer hover:bg-slate-100/90 sm:hover:bg-slate-100/70 md:hover:bg-slate-50/80 dark:hover:bg-slate-700/70 md:dark:hover:bg-slate-800/60 transition-colors shadow-xs sm:shadow-none"
                  aria-expanded={cityDropdownOpen}
                  aria-haspopup="listbox"
                  aria-label="Select city"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MapPin className={`w-4 h-4 shrink-0 ${gpsActive ? 'text-emerald-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}`} />
                    <div className="min-w-0 flex-1">
                      <span className={`block truncate ${selectedLocality || selectedCity || selectedDistrict || selectedRegion || gpsActive ? 'text-slate-900 dark:text-white font-black' : 'text-slate-500 dark:text-slate-400'}`}>
                        {gpsActive ? 'Near My Location' : selectedLocality || selectedCity || selectedDistrict || selectedRegion || 'Select City / Town'}
                      </span>
                      {!gpsActive && (selectedLocality || selectedCity || selectedDistrict || selectedRegion) && (
                        <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate leading-tight">
                          {selectedLocality && selectedCity
                            ? `${selectedCity}${selectedDistrict ? ` · ${selectedDistrict}` : ''}`
                            : selectedCity && selectedDistrict
                            ? `${selectedDistrict}${selectedRegion ? ` · ${selectedRegion}` : ''}`
                            : selectedDistrict && selectedRegion
                            ? `${selectedDistrict} District · ${selectedRegion}`
                            : selectedDistrict
                            ? `${selectedDistrict} District`
                            : selectedRegion
                            ? `${selectedRegion} Region`
                            : 'Sierra Leone'}
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
                    {/* Backdrop scrim */}
                    <div
                      className="fixed inset-0 z-40 bg-slate-950/60 sm:bg-slate-950/20 backdrop-blur-xs sm:backdrop-blur-none transition-opacity"
                      onClick={() => setCityDropdownOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Popover / Mobile Bottom Sheet */}
                    <div
                      role="listbox"
                      aria-label="City and community selector"
                      className="fixed sm:absolute inset-x-0 bottom-0 sm:inset-auto sm:top-[calc(100%+8px)] sm:right-0 z-50 w-full sm:w-[440px] md:w-[480px] max-w-[100vw] sm:max-w-[calc(100vw-2rem)] max-h-[86vh] sm:max-h-[520px] rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200/90 dark:border-slate-800 shadow-2xl p-4 sm:p-4.5 text-left animate-in slide-in-from-bottom-3 sm:slide-in-from-top-2 sm:fade-in duration-200 flex flex-col gap-2.5 overflow-hidden"
                    >
                      {/* Mobile Drag Indicator Handle */}
                      <div className="sm:hidden w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 mb-0.5 shrink-0" aria-hidden="true" />

                      {/* Header with Active Hierarchy & Close Button */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                              <MapPin className="w-3.5 h-3.5" />
                            </span>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">Choose City, Town or Region</p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate pl-7">
                            {selectedRegion ? `${selectedRegion}${selectedDistrict ? ` › ${selectedDistrict}` : ''}${selectedCity ? ` › ${selectedCity}` : ''}` : 'All Regions in Sierra Leone'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCityDropdownOpen(false)}
                          className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
                          aria-label="Close location menu"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* GPS Geolocation Trigger button */}
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isLocating}
                        className={`w-full flex items-center justify-between p-2.5 sm:p-3 rounded-xl text-xs font-bold transition-all cursor-pointer border shrink-0 min-h-[44px] ${
                          gpsActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 shadow-xs'
                            : 'bg-indigo-50/80 hover:bg-indigo-100/90 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 border-indigo-200/80 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isLocating ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                          ) : (
                            <Navigation className={`w-4 h-4 shrink-0 ${gpsActive ? 'fill-emerald-600 text-emerald-600 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}`} />
                          )}
                          <div className="min-w-0 text-left">
                            <span className="block truncate font-bold">{isLocating ? 'Detecting GPS Location…' : gpsActive ? 'GPS Location Enabled' : 'Use Current GPS Location'}</span>
                            <span className="block text-[10px] opacity-75 font-normal truncate">Find businesses and services closest to you</span>
                          </div>
                        </div>
                        {gpsActive && (
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase font-black tracking-wider animate-pulse shrink-0">
                            Active
                          </span>
                        )}
                      </button>

                      {geoErrorMsg && (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300 font-medium shrink-0 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                          <span>{geoErrorMsg}</span>
                        </div>
                      )}

                      {/* Quick filter search input inside dropdown */}
                      <div className="relative shrink-0">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={citySearchQuery}
                          onChange={(e) => setCitySearchQuery(e.target.value)}
                          placeholder="Search Freetown, Bo, Kenema, Lumley…"
                          className="w-full pl-8 pr-16 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {citySearchQuery ? (
                            <button
                              type="button"
                              onClick={() => setCitySearchQuery('')}
                              className="text-slate-400 hover:text-slate-600 p-0.5"
                              aria-label="Clear filter"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60">
                              {filteredCities.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Region Filter Chips */}
                      <div className="space-y-1 shrink-0">
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
                          <button
                            type="button"
                            onClick={() => handleRegionSelect('')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
                              !selectedRegion
                                ? 'bg-[#0054a6] text-white border-[#0054a6] shadow-xs'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
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
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
                                  isRegActive
                                    ? 'bg-[#0054a6] text-white border-[#0054a6] shadow-xs'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                              >
                                {reg}
                              </button>
                            );
                          })}
                        </div>

                        {/* District Filter Chips when a Region is Selected */}
                        {selectedRegion && availableDistricts.length > 0 && (
                          <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-1 shrink-0 no-scrollbar">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">Districts:</span>
                            <button
                              type="button"
                              onClick={() => handleDistrictSelect('')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
                                !selectedDistrict
                                  ? 'bg-[#0054a6] text-white border-[#0054a6]'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              All {selectedRegion}
                            </button>
                            {availableDistricts.map((dist) => {
                              const isDistActive = selectedDistrict === dist;
                              return (
                                <button
                                  key={dist}
                                  type="button"
                                  onClick={() => handleDistrictSelect(isDistActive ? '' : dist)}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
                                    isDistActive
                                      ? 'bg-[#0054a6] text-white border-[#0054a6]'
                                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {dist}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Regional or District Scope Banner when selected without a specific City */}
                      {(selectedRegion || selectedDistrict) && !selectedCity && !selectedLocality && (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/90 dark:bg-indigo-950/40 border border-blue-200/80 dark:border-indigo-900/50 text-[11px] font-semibold text-[#0054a6] dark:text-indigo-200 shrink-0">
                          <div className="truncate pr-2">
                            Filtering by: <span className="font-bold">{selectedDistrict ? `${selectedDistrict} District` : `${selectedRegion} Region`}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCityDropdownOpen(false)}
                            className="px-2.5 py-1 rounded-lg bg-[#0054a6] hover:bg-[#004080] text-white text-[10px] font-bold shrink-0 transition-colors cursor-pointer"
                          >
                            Apply Filter
                          </button>
                        </div>
                      )}

                      {/* Scrollable list of Cities & Communities */}
                      <div className="overflow-y-auto flex-1 pr-0.5 space-y-3 min-h-[140px] max-h-[46vh] sm:max-h-[250px] no-scrollbar">
                        {/* Cities / Towns Section */}
                        <div>
                          <div className="px-1 pb-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <span>Cities & Towns</span>
                            <span>{filteredCities.length}</span>
                          </div>
                          {filteredCities.length === 0 ? (
                            <div className="p-4 text-center text-xs font-medium text-slate-400 dark:text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                              No cities found matching "{citySearchQuery}".
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
                                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between min-h-[44px] cursor-pointer border text-left active:scale-[0.99] ${
                                      isSelected
                                        ? 'text-[#0054a6] dark:text-indigo-300 bg-blue-50/90 dark:bg-indigo-950/60 border-blue-200 dark:border-indigo-800 shadow-xs'
                                        : 'text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-200'
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
                                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#0054a6] dark:text-indigo-400 ml-1" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Communities & Villages Section */}
                        {filteredCommunities.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            <div className="px-1 pb-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
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
                                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between min-h-[44px] cursor-pointer border transition-all active:scale-[0.99] ${
                                      isSelected
                                        ? 'bg-blue-50/90 dark:bg-indigo-950/60 text-[#0054a6] dark:text-indigo-300 border-blue-200 dark:border-indigo-800'
                                        : 'text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/80'
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
                                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#0054a6] dark:text-indigo-400" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sticky Footer with Clear and Done Controls */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
                        {(selectedCity || selectedLocality || selectedDistrict || selectedRegion || gpsActive) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setGpsActive(false);
                              setCitySearchQuery('');
                              onCityChange({ city: undefined, district: undefined, region: undefined, locality: undefined, lat: null, lng: null });
                              setCityDropdownOpen(false);
                            }}
                            className="py-1.5 px-3 text-[11px] font-black uppercase text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer"
                          >
                            Clear Filter
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 pl-1">All Sierra Leone</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setCityDropdownOpen(false)}
                          className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
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
