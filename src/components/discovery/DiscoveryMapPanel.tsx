import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, MapPin, Navigation, ShieldCheck, Store, Wrench } from 'lucide-react';
import type { DiscoveryBusiness, DiscoveryService } from '../../types/discovery';

interface DiscoveryMapPanelProps {
  businesses?: DiscoveryBusiness[];
  services?: DiscoveryService[];
  selectedBusinessId?: string;
  onSelectBusiness?: (business: DiscoveryBusiness) => void;
  className?: string;
}

interface LeafletMarker {
  addTo(map: LeafletMap): LeafletMarker;
  bindPopup(content: HTMLElement, options?: Record<string, unknown>): LeafletMarker;
}

interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  fitBounds(bounds: unknown, options?: Record<string, unknown>): LeafletMap;
  remove(): void;
}

interface LeafletNamespace {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  marker(coords: [number, number], options?: Record<string, unknown>): LeafletMarker;
  divIcon(options: Record<string, unknown>): unknown;
  latLngBounds(coords: [number, number][]): unknown;
}

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

interface MapPoint {
  key: string;
  latitude: number;
  longitude: number;
  businesses: DiscoveryBusiness[];
  services: DiscoveryService[];
  quality?: string | null;
  distanceKm?: number | null;
}

let leafletPromise: Promise<LeafletNamespace> | null = null;

function loadLeaflet(): Promise<LeafletNamespace> {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    const cssId = 'abacha-leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('abacha-leaflet-js') as HTMLScriptElement | null;
    const onReady = () => window.L ? resolve(window.L) : reject(new Error('Map library did not initialize.'));
    if (existingScript) {
      existingScript.addEventListener('load', onReady, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Map library failed to load.')), { once: true });
      if (window.L) resolve(window.L);
      return;
    }

    const script = document.createElement('script');
    script.id = 'abacha-leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Map library failed to load.'));
    document.head.appendChild(script);
  }).catch((error) => {
    leafletPromise = null;
    throw error;
  });

  return leafletPromise;
}

const finiteCoord = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const getCoordinateKey = (latitude: number, longitude: number) =>
  `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

function makePopup(point: MapPoint): HTMLElement {
  const root = document.createElement('div');
  root.className = 'min-w-[180px] max-w-[260px]';

  const heading = document.createElement('p');
  heading.className = 'font-bold text-sm mb-2';
  heading.textContent = point.businesses.length + point.services.length > 1
    ? `${point.businesses.length + point.services.length} listings at this location`
    : point.businesses[0]?.name || point.services[0]?.name || 'Discovery listing';
  root.appendChild(heading);

  point.businesses.forEach((business) => {
    const link = document.createElement('a');
    link.href = `/discover/business/${encodeURIComponent(business.slug || business.id)}`;
    link.className = 'block text-sm font-semibold text-indigo-700 hover:underline py-1';
    link.textContent = `Business: ${business.name}`;
    root.appendChild(link);
  });

  point.services.forEach((service) => {
    const row = document.createElement('div');
    row.className = 'text-sm py-1';
    const label = document.createElement('span');
    label.className = 'font-semibold';
    label.textContent = `Service: ${service.name}`;
    row.appendChild(label);
    if (service.business_slug) {
      const link = document.createElement('a');
      link.href = `/discover/business/${encodeURIComponent(service.business_slug)}`;
      link.className = 'block text-xs text-indigo-700 hover:underline';
      link.textContent = service.business_name ? `Offered by ${service.business_name}` : 'View provider';
      row.appendChild(link);
    } else if (service.business_name) {
      const provider = document.createElement('span');
      provider.className = 'block text-xs text-slate-500';
      provider.textContent = `Offered by ${service.business_name}`;
      row.appendChild(provider);
    }
    root.appendChild(row);
  });

  const place = [point.businesses[0]?.city || point.services[0]?.city, point.businesses[0]?.district || point.services[0]?.district, point.businesses[0]?.region || point.services[0]?.region].filter(Boolean).join(', ');
  if (place) {
    const address = document.createElement('p');
    address.className = 'text-xs text-slate-500 mt-2';
    address.textContent = place;
    root.appendChild(address);
  }

  return root;
}

export const DiscoveryMapPanel: React.FC<DiscoveryMapPanelProps> = ({
  businesses = [],
  services = [],
  selectedBusinessId,
  onSelectBusiness,
  className = '',
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const onSelectBusinessRef = useRef(onSelectBusiness);
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);

  useEffect(() => {
    onSelectBusinessRef.current = onSelectBusiness;
  }, [onSelectBusiness]);

  const points = useMemo(() => {
    const grouped = new Map<string, MapPoint>();
    const getPoint = (latitude: number, longitude: number): MapPoint => {
      const key = getCoordinateKey(latitude, longitude);
      let point = grouped.get(key);
      if (!point) {
        point = { key, latitude, longitude, businesses: [], services: [] };
        grouped.set(key, point);
      }
      return point;
    };

    businesses.forEach((business) => {
      if (!finiteCoord(business.latitude) || !finiteCoord(business.longitude)) return;
      const point = getPoint(business.latitude, business.longitude);
      point.businesses.push(business);
      point.quality = point.quality || null;
      point.distanceKm = business.distance_km != null && Number.isFinite(Number(business.distance_km))
        ? Number(business.distance_km)
        : point.distanceKm ?? null;
    });

    services.forEach((service) => {
      if (!finiteCoord(service.latitude) || !finiteCoord(service.longitude)) return;
      getPoint(service.latitude, service.longitude).services.push(service);
    });

    return Array.from(grouped.values()).sort((a, b) =>
      (a.businesses[0]?.name || a.services[0]?.name || '').localeCompare(b.businesses[0]?.name || b.services[0]?.name || '')
    );
  }, [businesses, services]);

  const selectedPoint = useMemo(
    () => points.find((point) => point.businesses.some((business) => business.id === selectedBusinessId)),
    [points, selectedBusinessId],
  );
  const center: [number, number] = selectedPoint
    ? [selectedPoint.latitude, selectedPoint.longitude]
    : points.length > 0
      ? [points[0].latitude, points[0].longitude]
      : [8.484, -13.229];

  const externalMapUrl = `https://www.openstreetmap.org/?mlat=${center[0]}&mlon=${center[1]}#map=13/${center[0]}/${center[1]}`;
  const unmappedBusinessCount = businesses.filter((business) => !finiteCoord(business.latitude) || !finiteCoord(business.longitude)).length;
  const unmappedServiceCount = services.filter((service) => !finiteCoord(service.latitude) || !finiteCoord(service.longitude)).length;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    setMapLoading(true);
    setMapLoadError(false);

    loadLeaflet().then((L) => {
      if (cancelled || !mapElementRef.current) return;
      map = L.map(mapElementRef.current, { scrollWheelZoom: false, zoomControl: true }).setView(center, points.length > 0 ? 12 : 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      points.forEach((point) => {
        const hasBusiness = point.businesses.length > 0;
        const hasService = point.services.length > 0;
        const color = hasBusiness && hasService ? '#7c3aed' : hasService ? '#ea580c' : '#4f46e5';
        const marker = L.marker([point.latitude, point.longitude], {
          icon: L.divIcon({
            className: 'abacha-discovery-marker',
            html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};color:white;font-size:11px;font-weight:900;box-shadow:0 2px 8px #0005"><span style="transform:rotate(45deg)">${point.businesses.length + point.services.length}</span></span>`,
            iconSize: [34, 40],
            iconAnchor: [17, 38],
          }),
        }).addTo(map!);
        marker.bindPopup(makePopup(point), { maxWidth: 300 });
      });

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points.map((point): [number, number] => [point.latitude, point.longitude])), { padding: [36, 36], maxZoom: 14 });
      } else if (points.length === 1) {
        map.setView(center, 14);
      }
      setMapLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setMapLoadError(true);
        setMapLoading(false);
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, center[0], center[1]]);

  return (
    <section className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-600" />
            Map & Locations
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Businesses and services with verified coordinates are plotted below.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
            <Store className="w-3.5 h-3.5" /> {businesses.length} businesses
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 px-3 py-2 text-xs font-bold text-orange-700 dark:text-orange-300">
            <Wrench className="w-3.5 h-3.5" /> {services.length} services
          </span>
          <a
            href={externalMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open map</span>
          </a>
        </div>
      </div>

      <div className="relative h-[460px] sm:h-[560px] lg:h-[680px] w-full bg-slate-100 dark:bg-slate-800">
        <div ref={mapElementRef} role="region" aria-label="Interactive map of Discovery locations" className="absolute inset-0 z-0" />
        {mapLoading && !mapLoadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 dark:bg-slate-800/80 pointer-events-none">
            <p className="rounded-xl bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 shadow">Loading interactive map…</p>
          </div>
        )}
        {mapLoadError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-slate-100 dark:bg-slate-800">
            <MapPin className="w-9 h-9 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">Interactive map unavailable</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">The listing directory remains available below. Open OpenStreetMap to view the area.</p>
            <a href={externalMapUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold">Open map</a>
          </div>
        )}
        {!isMapInteracting && (
          <button
            type="button"
            onClick={() => setIsMapInteracting(true)}
            className="sm:hidden absolute bottom-3 left-3 z-20 px-4 py-2 min-h-[44px] rounded-xl bg-white/95 dark:bg-slate-900/95 text-xs font-bold text-slate-800 dark:text-white shadow-lg border border-slate-200 dark:border-slate-700"
          >
            <Navigation className="w-3.5 h-3.5 inline mr-1.5" />Interact with map
          </button>
        )}
      </div>

      {unmappedBusinessCount + unmappedServiceCount > 0 && (
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-950/20 text-[11px] text-amber-800 dark:text-amber-300">
          {unmappedBusinessCount > 0 && <span>{unmappedBusinessCount} business{unmappedBusinessCount === 1 ? '' : 'es'} </span>}
          {unmappedServiceCount > 0 && <span>{unmappedServiceCount} service{unmappedServiceCount === 1 ? '' : 's'} </span>}
          need usable coordinates before they can be plotted. They remain available in the Discovery listings.
        </div>
      )}

      {points.length > 0 ? (
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto">
          {points.map((point) => {
            const selected = point.businesses.some((business) => business.id === selectedBusinessId);
            const firstBusiness = point.businesses[0];
            const firstService = point.services[0];
            const title = firstBusiness?.name || firstService?.name || 'Discovery listing';
            const handleSelect = () => {
              if (firstBusiness) onSelectBusinessRef.current?.(firstBusiness);
              else if (firstService?.business_slug) window.location.assign('/discover/business/' + encodeURIComponent(firstService.business_slug));
            };
            return (
              <button
                key={point.key}
                type="button"
                onClick={handleSelect}
                title={firstBusiness ? `View ${firstBusiness.name}` : firstService?.business_name ? `View ${firstService.business_name}` : title}
                className={`text-left p-3 rounded-2xl border transition-all active:scale-[0.99] min-h-[72px] ${selected
                  ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${point.services.length && !point.businesses.length ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-300' : 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300'}`}>
                    {point.services.length && !point.businesses.length ? <Wrench className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black text-slate-900 dark:text-white truncate">{title}</span>
                    {point.businesses.slice(1).map((business) => <span key={business.id} className="block text-[10px] text-slate-600 dark:text-slate-300 truncate">Business: {business.name}</span>)}
                    {point.services.map((service) => <span key={service.id} className="block text-[10px] text-orange-700 dark:text-orange-300 truncate">Service: {service.name}</span>)}
                    <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                      {point.distanceKm != null ? `${point.distanceKm < 10 ? point.distanceKm.toFixed(1) : Math.round(point.distanceKm)} km away` : `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}
                    </span>
                    {point.quality && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="w-3 h-3" />{point.quality} location quality
                      </span>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center">
          <MapPin className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">No mapped listings yet</p>
          <p className="mt-1 text-[11px] text-slate-400">Businesses and services appear here when their active location has valid latitude and longitude coordinates.</p>
        </div>
      )}
    </section>
  );
};
