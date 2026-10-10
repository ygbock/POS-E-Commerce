import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MapPin, Navigation, ChevronDown, Check, AlertCircle, Shield, Search, X } from 'lucide-react';
import { discoveryApi } from '../../services/discoveryApi';
import type { DiscoveryGeoLocation } from '../../types/discovery';

interface DiscoveryLocationSelectorProps {
  selectedCity?: string;
  selectedLocality?: string;
  selectedRadiusKm?: number;
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (location: {
    city?: string;
    district?: string;
    region?: string;
    locality?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
  }) => void;
  className?: string;
}

const RADIUS_OPTIONS = [5, 10, 25, 50];

export const DiscoveryLocationSelector: React.FC<DiscoveryLocationSelectorProps> = ({
  selectedCity = '',
  selectedLocality = '',
  selectedRadiusKm = 25,
  latitude,
  longitude,
  onLocationChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLocations, setGeoLocations] = useState<DiscoveryGeoLocation[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    discoveryApi.getGeoLocations()
      .then((locations) => {
        if (active && Array.isArray(locations)) setGeoLocations(locations.filter((location) => location.is_active));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const locationsById = useMemo(
    () => new Map(geoLocations.map((location) => [location.id, location])),
    [geoLocations],
  );

  const getLocationPath = useCallback((location: DiscoveryGeoLocation): DiscoveryGeoLocation[] => {
    const path: DiscoveryGeoLocation[] = [];
    let current: DiscoveryGeoLocation | undefined = location;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parent_id ? locationsById.get(current.parent_id) : undefined;
    }
    return path;
  }, [locationsById]);

  const locationTrail = useCallback((location: DiscoveryGeoLocation) =>
    getLocationPath(location).map((item) => item.name).join(' › '), [getLocationPath]);

  const visibleLocations = useMemo(() => {
    const query = locationQuery.trim().toLocaleLowerCase();
    const candidates = geoLocations.filter((location) => {
      if (!query) return location.location_type === 'CITY' || location.location_type === 'COMMUNITY';
      const trail = getLocationPath(location).map((item) => item.name).join(' ').toLocaleLowerCase();
      return location.name.toLocaleLowerCase().includes(query) || trail.includes(query);
    });
    return candidates
      .sort((a, b) => {
        const order = { COMMUNITY: 0, CITY: 1, DISTRICT: 2, REGION: 3 };
        return order[a.location_type] - order[b.location_type] || a.display_order - b.display_order || a.name.localeCompare(b.name);
      })
      .slice(0, query ? 60 : 36);
  }, [geoLocations, locationQuery, getLocationPath]);

  const hasCoords = latitude != null && longitude != null;
  const displayText = hasCoords
    ? 'Near my location'
    : selectedLocality || selectedCity || 'All locations';

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        onLocationChange({ lat: position.coords.latitude, lng: position.coords.longitude, radiusKm: selectedRadiusKm });
        setIsOpen(false);
      },
      (error) => {
        setIsLocating(false);
        setGeoError(error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. You can search for any town, village, or community below.'
          : 'Unable to detect current location. Please choose a location below.');
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const handleSelectLocation = (location: DiscoveryGeoLocation) => {
    const path = getLocationPath(location);
    const region = path.find((item) => item.location_type === 'REGION');
    const district = path.find((item) => item.location_type === 'DISTRICT');
    const city = path.find((item) => item.location_type === 'CITY');
    onLocationChange({
      city: location.location_type === 'CITY' ? location.name : city?.name,
      district: location.location_type === 'DISTRICT' ? location.name : district?.name,
      region: location.location_type === 'REGION' ? location.name : region?.name,
      locality: location.location_type === 'COMMUNITY' ? location.name : undefined,
      lat: null,
      lng: null,
      radiusKm: selectedRadiusKm,
    });
    setLocationQuery('');
    setGeoError(null);
    setIsOpen(false);
  };

  const handleClearLocation = () => {
    onLocationChange({ city: undefined, district: undefined, region: undefined, locality: undefined, lat: null, lng: null, radiusKm: selectedRadiusKm });
    setLocationQuery('');
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[44px] cursor-pointer"
      >
        <MapPin className={`w-4 h-4 shrink-0 ${hasCoords ? 'text-emerald-500 animate-pulse' : 'text-blue-600 dark:text-blue-400'}`} aria-hidden="true" />
        <span className="truncate max-w-[140px] sm:max-w-[200px]">{displayText}</span>
        {hasCoords && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold shrink-0">{selectedRadiusKm}km</span>}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-40 animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2"><Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />{isLocating ? 'Detecting location…' : 'Use current location'}</span>
              {hasCoords && <Check className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400 dark:text-slate-500">
              <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Your coordinates are never shared with public businesses.</span>
            </div>

            {geoError && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p className="flex-1">{geoError}</p>
              </div>
            )}

            {hasCoords && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Search Radius</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {RADIUS_OPTIONS.map((km) => (
                    <button key={km} type="button" onClick={() => onLocationChange({ lat: latitude, lng: longitude, radiusKm: km })}
                      className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${selectedRadiusKm === km ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <label htmlFor="discovery-location-search" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Search region, district, town, village or community
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input id="discovery-location-search" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)}
                  placeholder="e.g. Freetown, Lumley, Wellington, Bo..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                {locationQuery && <button type="button" onClick={() => setLocationQuery('')} aria-label="Clear location search" className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1" role="listbox" aria-label="Available locations">
                {visibleLocations.map((location) => (
                  <button key={location.id} type="button" onClick={() => handleSelectLocation(location)}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-transparent hover:border-blue-100 dark:hover:border-blue-900/40 transition-colors">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{location.name}</span>
                      <span className="text-[9px] uppercase tracking-wide text-slate-400 shrink-0">{location.location_type === 'COMMUNITY' ? 'Community / village' : location.location_type === 'CITY' ? 'City / town' : location.location_type.toLowerCase()}</span>
                    </span>
                    <span className="block mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">{locationTrail(location)}</span>
                  </button>
                ))}
                {visibleLocations.length === 0 && <p className="p-3 text-center text-slate-500">No matching locations. Try another spelling or ask the platform to add this place.</p>}
              </div>
              <button type="button" onClick={handleClearLocation} className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">Clear location filter</button>
              <p className="mt-2 text-[10px] text-slate-400">The list is managed by the platform and expands as verified towns, villages and communities are added.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
