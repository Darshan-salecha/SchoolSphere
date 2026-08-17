'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bus, MapPin, Crosshair, School } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRACKING, bearingDegrees, easeOutCubic, interpolate, type GeoPoint } from '@/lib/tracking';

/**
 * The one map in the product.
 *
 * Built from raster OpenStreetMap tiles positioned with CSS, plus an SVG
 * overlay for the route, the trail and the markers. That is a deliberate choice
 * over a WebGL map library: it needs no API key and no account, it renders on
 * the cheap Android phones most parents use, and it degrades to a static image
 * rather than a blank canvas when a device lacks WebGL.
 *
 * Attribution is a licence condition of OSM tiles, not decoration — do not
 * remove it.
 */

const TILE_SIZE = 256;
const TILE_URL = (z: number, x: number, y: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** Web-Mercator projection, in world pixels at a given zoom. */
function project(point: GeoPoint, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((point.longitude + 180) / 360) * scale;
  const sinLat = Math.sin((point.latitude * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export interface StopPin extends GeoPoint {
  id: string;
  label: string;
  order?: number;
  isDestination?: boolean;
  reached?: boolean;
}

/** Smoothly walks the marker from its previous fix to the new one. */
function useAnimatedPosition(target: GeoPoint | null) {
  const [position, setPosition] = useState<GeoPoint | null>(target);
  const fromRef = useRef<GeoPoint | null>(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!target) return;
    const from = fromRef.current;
    if (!from) {
      fromRef.current = target;
      setPosition(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TRACKING.MARKER_TWEEN_MS);
      const next = interpolate(from, target, easeOutCubic(t));
      setPosition(next);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target?.latitude, target?.longitude]);

  return position;
}

export function BusMap({
  position,
  stops = [],
  trail = [],
  destination = null,
  approximate = false,
  height = 380,
  className,
}: {
  position: GeoPoint | null;
  stops?: StopPin[];
  trail?: GeoPoint[];
  destination?: GeoPoint | null;
  approximate?: boolean;
  height?: number;
  className?: string;
}) {
  const animated = useAnimatedPosition(position);
  const [size, setSize] = useState({ width: 640, height: typeof height === 'number' ? height : 380 });
  const [zoom, setZoom] = useState(14);
  const [follow, setFollow] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Everything visible, so the camera can frame the whole picture when idle.
  const points = useMemo(
    () => [animated, destination, ...stops].filter(Boolean) as GeoPoint[],
    [animated, destination, stops],
  );

  const centre = useMemo<GeoPoint>(() => {
    if (follow && animated) return animated;
    if (!points.length) return { latitude: 28.6139, longitude: 77.209 };
    const lat = points.reduce((s, p) => s + p.latitude, 0) / points.length;
    const lon = points.reduce((s, p) => s + p.longitude, 0) / points.length;
    return { latitude: lat, longitude: lon };
  }, [follow, animated, points]);

  const origin = useMemo(() => {
    const c = project(centre, zoom);
    return { x: c.x - size.width / 2, y: c.y - size.height / 2 };
  }, [centre, zoom, size]);

  const toScreen = (p: GeoPoint) => {
    const { x, y } = project(p, zoom);
    return { x: x - origin.x, y: y - origin.y };
  };

  // Which tiles cover the viewport.
  const tiles = useMemo(() => {
    const list: { key: string; url: string; left: number; top: number }[] = [];
    const max = 2 ** zoom;
    const startX = Math.floor(origin.x / TILE_SIZE);
    const startY = Math.floor(origin.y / TILE_SIZE);
    const endX = Math.floor((origin.x + size.width) / TILE_SIZE);
    const endY = Math.floor((origin.y + size.height) / TILE_SIZE);
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        if (y < 0 || y >= max) continue;
        const wrapped = ((x % max) + max) % max;
        list.push({
          key: `${zoom}/${x}/${y}`,
          url: TILE_URL(zoom, wrapped, y),
          left: x * TILE_SIZE - origin.x,
          top: y * TILE_SIZE - origin.y,
        });
      }
    }
    return list;
  }, [zoom, origin, size]);

  const heading = useMemo(() => {
    if (trail.length < 2 || !animated) return 0;
    return bearingDegrees(trail[trail.length - 2], animated);
  }, [trail, animated]);

  const routeLine = stops.map(toScreen);
  const trailLine = trail.map(toScreen);
  const busPoint = animated ? toScreen(animated) : null;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100', className)}
      style={{ height }}
    >
      {/* Basemap */}
      <div className="absolute inset-0" aria-hidden>
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            loading="lazy"
            className="absolute select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>

      {/* Overlay */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        {routeLine.length > 1 && (
          <polyline
            points={routeLine.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={3}
            strokeOpacity={0.35}
            strokeDasharray="6 6"
            strokeLinecap="round"
          />
        )}
        {trailLine.length > 1 && (
          <polyline
            points={trailLine.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={4}
            strokeOpacity={0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {/* Stops */}
      {stops.map((stop) => {
        const p = toScreen(stop);
        return (
          <div
            key={stop.id}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: p.x, top: p.y }}
            title={stop.label}
          >
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium shadow-sm ring-1',
                stop.isDestination
                  ? 'bg-brand-600 text-white ring-brand-700'
                  : stop.reached
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-white text-slate-700 ring-slate-200',
              )}
            >
              {stop.isDestination ? <School className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
              <span className="max-w-[110px] truncate">{stop.label}</span>
            </div>
          </div>
        );
      })}

      {/* The bus */}
      {busPoint && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: busPoint.x, top: busPoint.y }}>
          {approximate && <span className="absolute -inset-6 rounded-full bg-brand-500/15 ring-1 ring-brand-400/40" />}
          <span className="absolute -inset-3 animate-ping rounded-full bg-brand-500/20" />
          <span
            className="relative grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white shadow-pop ring-2 ring-white"
            style={{ transform: `rotate(${heading}deg)` }}
          >
            <Bus className="h-4 w-4" style={{ transform: `rotate(${-heading}deg)` }} />
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        {[
          { label: 'Zoom in', onClick: () => setZoom((z) => Math.min(18, z + 1)), text: '+' },
          { label: 'Zoom out', onClick: () => setZoom((z) => Math.max(3, z - 1)), text: '−' },
        ].map((c) => (
          <button
            key={c.label}
            type="button"
            aria-label={c.label}
            onClick={c.onClick}
            className="grid h-8 w-8 place-items-center rounded-lg bg-white text-base font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {c.text}
          </button>
        ))}
        <button
          type="button"
          aria-label={follow ? 'Stop following the bus' : 'Follow the bus'}
          aria-pressed={follow}
          onClick={() => setFollow((f) => !f)}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg shadow-sm ring-1 ring-slate-200',
            follow ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50',
          )}
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      {!position && (
        <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
          <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
            Waiting for the bus to report its position…
          </p>
        </div>
      )}

      <p className="absolute bottom-0 right-0 bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </div>
  );
}
