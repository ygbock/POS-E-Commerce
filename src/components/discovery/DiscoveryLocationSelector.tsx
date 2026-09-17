import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, ChevronDown, Check, AlertCircle, Shield } from 'lucide-react';

interface DiscoveryLocationSelectorProps {
  selectedCity?: string;
  selectedRadiusKm?: number;
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (location: {
    city?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
  }) => void;
  className?: string;
}

const CONVENIENCE_CITIES = [
  'Freetown',
  'Bo',
  'Kenema',
  'Makeni',
  'Waterloo',
];

const RADIUS_OPTIONS = [5, 10, 25, 50];

export const DiscoveryLocationSelector: React.FC<DiscoveryLocationSelectorProps> = ({
  selectedCity = '',
  selectedRadiusKm = 25,
  latitude,
  longitude,
  onLocationChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasCoords = latitude != null && longitude != null;

  const displayText = hasCoords
    ? 'Near my location'
    : selectedCity
    ? selectedCity
    : 'All locations';

  // Geolocation handler
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
        onLocationChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          radiusKm: selectedRadiusKm,
        });
        setIsOpen(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError('Location permission was denied. You can select a city manually.');
        } else {
          setGeoError('Unable to detect current location. Please choose a city below.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectCity = (city: string) => {
    onLocationChange({
      city: city || undefined,
      lat: null,
      lng: null,
      radiusKm: selectedRadiusKm,
    });
    setIsOpen(false);
  };

  const handleApplyManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleSelectCity(manualInput.trim());
      setManualInput('');
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[140px] sm:max-w-[200px]">{displayText}</span>
        {hasCoords && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">
            {selectedRadiusKm}km
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-40 animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div className="space-y-3">
            {/* GPS Location Button */}
            <div>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{isLocating ? 'Detecting location…' : 'Use current location'}</span>
                </div>
                {hasCoords && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
              </button>

              {/* Privacy Notice */}
              <div className="flex items-center gap-1.5 mt-1.5 px-1 text-[11px] text-slate-400 dark:text-slate-500">
                <Shield className="w-3 h-3 text-emerald-500 shrink-0" aria-hidden="true" />
                <span>Your coordinates are never shared with public businesses.</span>
              </div>
            </div>

            {/* Geolocation Error Alert */}
            {geoError && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="flex-1">{geoError}</p>
              </div>
            )}

            {/* Radius Selector (if coordinates active) */}
            {hasCoords && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Search Radius
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {RADIUS_OPTIONS.map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => onLocationChange({ lat: latitude, lng: longitude, radiusKm: km })}
                      className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        selectedRadiusKm === km
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual City Input */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                City / District Search
              </label>
              <form onSubmit={handleApplyManual} className="flex gap-1.5">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. Freetown, Bo…"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold hover:opacity-90 transition-opacity"
                >
                  Set
                </button>
              </form>
            </div>

            {/* Convenience Suggestions */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Popular Areas
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectCity('')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear filter
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONVENIENCE_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      selectedCity.toLowerCase() === city.toLowerCase() && !hasCoords
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
