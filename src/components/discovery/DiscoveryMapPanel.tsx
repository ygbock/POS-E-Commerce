import React, { useMemo } from 'react';
import { ExternalLink, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import type { DiscoveryBusiness, DiscoveryLocation } from '../../types/discovery';

interface DiscoveryMapPanelProps {
  businesses?: DiscoveryBusiness[];
  locations?: DiscoveryLocation[];
  selectedBusinessId?: string;
  onSelectBusiness?: (business: DiscoveryBusiness) => void;
  className?: string;
}

const finiteCoord = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const DiscoveryMapPanel: React.FC<DiscoveryMapPanelProps> = ({
  businesses = [],
  locations = [],
  selectedBusinessId,
  onSelectBusiness,
  className = '',
}) => {
  const points = useMemo(() => {
    const fromBusinesses = businesses
      .filter((b) => finiteCoord(b.latitude) && finiteCoord(b.longitude))
      .map((b) => ({
        id: b.id,
        name: b.name,
        latitude: b.latitude as number,
        longitude: b.longitude as number,
        business: b,
        quality: undefined as DiscoveryLocation['location_quality_status'],
        distanceKm: b.distance_km != null && Number.isFinite(Number(b.distance_km)) ? Number(b.distance_km) : null,
      }));

    const fromLocations = locations
      .filter((l) => l.is_active && finiteCoord(l.latitude) && finiteCoord(l.longitude))
      .map((l) => ({
        id: l.id,
        name: l.name,
        latitude: l.latitude as number,
        longitude: l.longitude as number,
        business: undefined as DiscoveryBusiness | undefined,
        quality: l.location_quality_status,
        distanceKm: null,
      }));

    return [...fromBusinesses, ...fromLocations].slice(0, 40);
  }, [businesses, locations]);

  const selectedPoint = useMemo(() => points.find((point) => point.business?.id === selectedBusinessId), [points, selectedBusinessId]);
  const center = useMemo(() => {
    if (selectedPoint) return selectedPoint;
    if (points.length === 0) return { lat: 8.484, lng: -13.229 };
    return points[0];
  }, [points, selectedPoint]);

  const mapUrl = useMemo(() => {
    const delta = 0.08;
    const left = center.longitude - delta;
    const right = center.longitude + delta;
    const bottom = center.latitude - delta;
    const top = center.latitude + delta;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${center.latitude}%2C${center.longitude}`;
  }, [center]);

  const externalMapUrl = `https://www.openstreetmap.org/?mlat=${center.latitude}&mlon=${center.longitude}#map=15/${center.latitude}/${center.longitude}`;

  const [isMapInteracting, setIsMapInteracting] = React.useState(false);
  const [mapLoadError, setMapLoadError] = React.useState(false);
  const unmappedBusinessCount = businesses.filter((b) => !finiteCoord(b.latitude) || !finiteCoord(b.longitude)).length;

  return (
    <section className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-600" />
            Map & Locations
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Explore published locations and nearby businesses.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href={externalMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open map</span>
          </a>
        </div>
      </div>

      <div
        className="relative h-64 sm:h-72 md:h-80 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        onClick={() => setIsMapInteracting(true)}
      >
        {mapLoadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-100 dark:bg-slate-800">
            <MapPin className="w-9 h-9 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">Map service unavailable</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">The mapped results are still available below. You can open the map externally for directions.</p>
            <a href={externalMapUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold">Open map</a>
          </div>
        ) : <iframe
          title="AbaCha Discovery map"
          src={mapUrl}
          onError={() => setMapLoadError(true)}
          className={`absolute inset-0 w-full h-full border-0 transition-opacity ${
            isMapInteracting ? 'pointer-events-auto' : 'pointer-events-none sm:pointer-events-auto'
          }`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />}

        {/* Mobile touch hint overlay so page scrolling isn't trapped */}
        {!isMapInteracting && (
          <div className="sm:hidden absolute inset-0 bg-slate-950/20 flex items-center justify-center pointer-events-auto cursor-pointer">
            <button
              type="button"
              onClick={() => setIsMapInteracting(true)}
              className="px-4 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-xs font-bold text-slate-800 dark:text-white shadow-lg border border-slate-200/80 dark:border-slate-700"
            >
              Tap to interact with map
            </button>
          </div>
        )}

        {points.length > 0 && (
          <div className="absolute left-3 bottom-3 max-w-[calc(100%-1.5rem)] sm:max-w-xs rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-2 shadow-lg">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              {points.length} mapped locations
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Select a location below for directions and profile details.
            </p>
          </div>
        )}
      </div>

      {unmappedBusinessCount > 0 && (
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-950/20 text-[11px] text-amber-800 dark:text-amber-300">
          {unmappedBusinessCount} published business{unmappedBusinessCount === 1 ? '' : 'es'} do not have usable coordinates yet, so they remain visible in the list but are not plotted on the map.
        </div>
      )}

      {points.length > 0 ? (
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto">
          {points.map((point) => {
            const selected = point.business?.id === selectedBusinessId;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => point.business && onSelectBusiness?.(point.business)}
                title={`Get directions to ${point.name}`}
                className={`text-left p-3 rounded-2xl border transition-all active:scale-[0.99] min-h-[56px] ${
                  selected
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black text-slate-900 dark:text-white truncate">{point.name}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                      {point.distanceKm != null ? `${point.distanceKm < 10 ? point.distanceKm.toFixed(1) : Math.round(point.distanceKm)} km away` : `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`} 
                    </span>
                    {point.quality && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="w-3 h-3" />
                        {point.quality} location quality
                      </span>
                    )}
                  </span>
                  {point.business && (
                    <Navigation className="w-3.5 h-3.5 text-slate-400 shrink-0 self-center" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center">
          <MapPin className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">No mapped listings yet</p>
          <p className="mt-1 text-[11px] text-slate-400">Choose a city or enable location services to find nearby listings.</p>
        </div>
      )}
    </section>
  );
};
