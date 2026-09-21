import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';

interface DiscoveryLocationMapEditorProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  height?: number;
  disabled?: boolean;
}

const TILE_SIZE = 256;
const DEFAULT_CENTER = { latitude: 8.484, longitude: -13.229 };
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

const clampLatitude = (lat: number) => Math.max(-85.05112878, Math.min(85.05112878, lat));
const wrapLongitude = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

const latLngToWorld = (lat: number, lng: number, zoom: number) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clampLatitude(lat) * Math.PI / 180;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * scale,
  };
};

const worldToLatLng = (x: number, y: number, zoom: number) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude: lat, longitude: wrapLongitude(lng) };
};

export const DiscoveryLocationMapEditor: React.FC<DiscoveryLocationMapEditorProps> = ({
  latitude,
  longitude,
  onChange,
  height = 300,
  disabled = false,
}) => {
  const initial = useMemo(
    () => ({
      latitude: Number.isFinite(latitude) ? Number(latitude) : DEFAULT_CENTER.latitude,
      longitude: Number.isFinite(longitude) ? Number(longitude) : DEFAULT_CENTER.longitude,
    }),
    [latitude, longitude],
  );
  const [center, setCenter] = useState(initial);
  const [zoom, setZoom] = useState(15);
  const [draggingMap, setDraggingMap] = useState(false);
  const [draggingPin, setDraggingPin] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, worldX: 0, worldY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!draggingMap && !draggingPin) setCenter(initial);
  }, [initial.latitude, initial.longitude, draggingMap, draggingPin]);

  const centerWorld = latLngToWorld(center.latitude, center.longitude, zoom);
  const tiles = useMemo(() => {
    const cx = latLngToWorld(center.latitude, center.longitude, zoom);
    const centerTileX = Math.floor(cx.x / TILE_SIZE);
    const centerTileY = Math.floor(cx.y / TILE_SIZE);
    const maxTile = 2 ** zoom;
    const result: Array<{ key: string; x: number; y: number; left: number; top: number }> = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const rawX = centerTileX + dx;
        const tileY = centerTileY + dy;
        if (tileY < 0 || tileY >= maxTile) continue;
        const tileX = ((rawX % maxTile) + maxTile) % maxTile;
        result.push({
          key: `${zoom}-${tileX}-${tileY}`,
          x: tileX,
          y: tileY,
          left: (rawX * TILE_SIZE) - cx.x,
          top: (tileY * TILE_SIZE) - cx.y,
        });
      }
    }
    return result;
  }, [center.latitude, center.longitude, zoom]);

  const pinStyle = {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -100%)',
  };

  const updateFromViewportPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = centerWorld.x + (clientX - (rect.left + rect.width / 2));
    const worldY = centerWorld.y + (clientY - (rect.top + rect.height / 2));
    const next = worldToLatLng(worldX, worldY, zoom);
    onChange(next.latitude, next.longitude);
    setCenter(next);
  };

  const handleMapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingMap(true);
    const world = latLngToWorld(center.latitude, center.longitude, zoom);
    dragRef.current = { x: event.clientX, y: event.clientY, worldX: world.x, worldY: world.y };
  };

  const handleMapPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingMap || disabled) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    const next = worldToLatLng(dragRef.current.worldX - dx, dragRef.current.worldY - dy, zoom);
    setCenter(next);
  };

  const finishMapDrag = () => setDraggingMap(false);

  const handlePinPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingPin(true);
  };

  const handlePinPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingPin || disabled) return;
    event.stopPropagation();
    updateFromViewportPoint(event.clientX, event.clientY);
  };

  const finishPinDrag = () => setDraggingPin(false);

  const zoomAt = (nextZoom: number) => {
    const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    if (target === zoom) return;
    const point = worldToLatLng(centerWorld.x, centerWorld.y, zoom);
    setZoom(target);
    setCenter(point);
  };

  const useCurrentLocation = () => {
    if (disabled || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCenter(next);
        onChange(next.latitude, next.longitude);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 select-none touch-none ${disabled ? 'opacity-60' : ''}`}
        style={{ height }}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={finishMapDrag}
        onPointerCancel={finishMapDrag}
        onWheel={(event) => {
          if (disabled) return;
          event.preventDefault();
          zoomAt(zoom + (event.deltaY < 0 ? 1 : -1));
        }}
      >
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={`https://tile.openstreetmap.org/${tile.x ? zoom : zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            draggable={false}
            className="absolute max-w-none pointer-events-none"
            style={{ width: TILE_SIZE, height: TILE_SIZE, left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)`, transform: 'translate(-50%, -50%)' }}
          />
        ))}

        <button
          type="button"
          aria-label="Drag location pin"
          title="Drag pin to set the exact business location"
          disabled={disabled}
          onPointerDown={handlePinPointerDown}
          onPointerMove={handlePinPointerMove}
          onPointerUp={finishPinDrag}
          onPointerCancel={finishPinDrag}
          className="absolute z-20 text-indigo-600 drop-shadow-md cursor-grab active:cursor-grabbing disabled:cursor-not-allowed"
          style={pinStyle}
        >
          <MapPin className="w-9 h-9 fill-indigo-600 stroke-white" />
        </button>

        <div className="absolute top-3 right-3 z-30 flex flex-col gap-1 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
          <button type="button" disabled={disabled} onClick={() => zoomAt(zoom + 1)} className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40" title="Zoom in">
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" disabled={disabled} onClick={() => zoomAt(zoom - 1)} className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40" title="Zoom out">
            <Minus className="w-4 h-4" />
          </button>
          <button type="button" disabled={disabled} onClick={useCurrentLocation} className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40" title="Use current GPS location">
            <LocateFixed className="w-4 h-4" />
          </button>
        </div>

        <div className="absolute left-3 bottom-3 z-30 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-3 py-2 shadow-lg pointer-events-none">
          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">Drag the pin to set the exact location</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Zoom and pan for precision.</p>
        </div>

        <div className="absolute right-3 bottom-3 z-30 rounded-lg bg-white/90 dark:bg-slate-900/90 px-2 py-1 text-[9px] text-slate-500 shadow">
          © OpenStreetMap contributors
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500">
        <span>Coordinates: {center.latitude.toFixed(6)}, {center.longitude.toFixed(6)}</span>
        <span>Zoom {zoom}</span>
      </div>
    </div>
  );
};
