/**
 * Live bus tracking — shared domain rules.
 *
 * Deliberately dependency-free and isomorphic: the driver's phone, the SSE
 * stream, the REST fallback and the parent's map all import the *same*
 * constants and geometry. A throttle window or a "nearby" radius that
 * disagrees between producer and consumer is the classic way live tracking
 * drifts, so there is exactly one definition of each.
 *
 * The architecture follows the reference implementation in the attached
 * Lactora project. Two things are deliberately different:
 *
 *   Transport — Server-Sent Events rather than Socket.IO. Bus position is a
 *   one-way server→client stream; the driver publishes over ordinary HTTP
 *   POSTs, which retry cleanly on a flaky mobile network. SSE needs no custom
 *   server, so `next start` and the existing container image are unchanged.
 *
 *   Rendering — raster OSM tiles positioned with CSS plus an SVG overlay,
 *   rather than a WebGL map library. No API key, no WebGL requirement on the
 *   cheap Android phones most parents actually use.
 */

// ─── Tuning ────────────────────────────────────────────────────────────────

export const TRACKING = {
  /** Never publish two fixes closer together than this — protects DB and battery. */
  MIN_PUBLISH_MS: 3_000,
  /** Publish at least this often even when stationary, so parents see liveness. */
  MAX_PUBLISH_MS: 8_000,
  /** Movement below this is GPS jitter, not travel. */
  MIN_MOVE_M: 15,
  /**
   * A fix at or below this is precise enough to draw without qualification.
   * This is a *display* threshold, not an admission gate — a phone inside a
   * bus routinely reports hundreds of metres, and discarding those fixes would
   * leave the map frozen while the driver's screen still said "Live".
   */
  MAX_ACCURACY_M: 200,
  /** Beyond this a reading is city-scale and cannot place a bus honestly. */
  USABLE_ACCURACY_M: 5_000,
  /** Guardians are told "the bus is nearby" inside this radius of their stop. */
  NEARBY_RADIUS_M: 800,
  /** Treated as arrival at the stop. */
  ARRIVED_RADIUS_M: 120,
  /** A trip with no fix for this long is presumed dead and auto-closed. */
  STALE_TRIP_MS: 15 * 60_000,
  /** Fallback speed when the device reports none (≈ 25 km/h in traffic). */
  FALLBACK_SPEED_MPS: 7,
  /** Marker animation duration — matches MAX_PUBLISH_MS so motion never stutters. */
  MARKER_TWEEN_MS: 1_500,
  /** Max fixes accepted per trip per minute. */
  MAX_FIXES_PER_MINUTE: 40,
  /** How many breadcrumb points the map keeps. */
  TRAIL_POINTS: 80,
  /** Parent map reconnect delay after the stream drops. */
  RECONNECT_MS: 3_000,
} as const;

// ─── Geometry ──────────────────────────────────────────────────────────────

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationFix extends GeoPoint {
  accuracyM?: number | null;
  heading?: number | null;
  speedMps?: number | null;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. Accurate to well under a metre at city scale. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees (0 = north). Rotates the moving marker. */
export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Linear interpolation between two fixes — the basis of smooth marker motion. */
export function interpolate(from: GeoPoint, to: GeoPoint, t: number): GeoPoint {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * clamped,
    longitude: from.longitude + (to.longitude - from.longitude) * clamped,
  };
}

/** Ease-out so an arriving marker settles instead of snapping. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

// ─── Validation ────────────────────────────────────────────────────────────

export type FixQuality = 'PRECISE' | 'APPROXIMATE' | 'UNUSABLE';

export function fixQuality(accuracyM: number | null | undefined): FixQuality {
  if (accuracyM === null || accuracyM === undefined) return 'PRECISE'; // device did not say; assume usable
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return 'UNUSABLE';
  if (accuracyM <= TRACKING.MAX_ACCURACY_M) return 'PRECISE';
  if (accuracyM <= TRACKING.USABLE_ACCURACY_M) return 'APPROXIMATE';
  return 'UNUSABLE';
}

/**
 * A fix is trusted if it is inside real coordinate bounds and not a city-scale
 * guess. `0,0` is rejected because it is the classic "GPS not ready" value and
 * would otherwise drop every bus into the Gulf of Guinea.
 *
 * Note the deliberate asymmetry with `fixQuality`: an *approximate* fix is
 * valid and gets published, only labelled. Treating "not precise" as "not
 * valid" is what silently kills tracking on devices without a clear sky view.
 */
export function isValidFix(value: unknown): value is LocationFix {
  const fix = value as LocationFix | null;
  if (!fix || typeof fix !== 'object') return false;
  const { latitude, longitude, accuracyM } = fix;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return fixQuality(accuracyM) !== 'UNUSABLE';
}

/**
 * Publish policy shared by the browser (before sending) and the server (before
 * writing). Movement wins immediately; otherwise a heartbeat fix goes out once
 * MAX_PUBLISH_MS has elapsed. Below MIN_PUBLISH_MS nothing is ever published,
 * which is what keeps the phone's radio and the database quiet.
 */
export function shouldPublish(input: { previous: GeoPoint | null; next: GeoPoint; elapsedMs: number }): boolean {
  const { previous, next, elapsedMs } = input;
  if (!previous) return true;
  if (elapsedMs < TRACKING.MIN_PUBLISH_MS) return false;
  if (haversineMeters(previous, next) >= TRACKING.MIN_MOVE_M) return true;
  return elapsedMs >= TRACKING.MAX_PUBLISH_MS;
}

export const isStale = (lastSeenAt: Date | string | null | undefined, now = Date.now()): boolean => {
  if (!lastSeenAt) return false;
  const at = typeof lastSeenAt === 'string' ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  return Number.isFinite(at) && now - at > TRACKING.STALE_TRIP_MS;
};

// ─── ETA ───────────────────────────────────────────────────────────────────

/**
 * Seconds to arrival. Straight-line distance is inflated by 1.4 to approximate
 * real streets. Reported GPS speed is only trusted between walking pace and
 * 80 km/h — a parked bus reporting 0.1 m/s would otherwise predict an arrival
 * next week.
 */
export function etaSeconds(input: { distanceM: number; speedMps?: number | null }): number {
  const speed = input.speedMps && input.speedMps >= 1 && input.speedMps <= 22 ? input.speedMps : TRACKING.FALLBACK_SPEED_MPS;
  return Math.round((input.distanceM * 1.4) / speed);
}

/** "5 min" / "Arriving now" — the string a parent actually reads. */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 90) return 'Arriving now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '—';
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export type Proximity = 'FAR' | 'NEARBY' | 'ARRIVED';

export function proximityFor(distanceM: number): Proximity {
  if (distanceM <= TRACKING.ARRIVED_RADIUS_M) return 'ARRIVED';
  if (distanceM <= TRACKING.NEARBY_RADIUS_M) return 'NEARBY';
  return 'FAR';
}

// ─── Stream contract ───────────────────────────────────────────────────────

/**
 * Channels are namespaced by school first. A subscriber is only ever attached
 * to channels for the school its session resolved to, which is what stops one
 * school's parents from watching another school's buses.
 */
export const trackingChannels = {
  route: (schoolId: string, routeId: string) => `s:${schoolId}:route:${routeId}`,
  school: (schoolId: string) => `s:${schoolId}:transport`,
};

export const TRACK_EVENTS = {
  moved: 'bus:moved',
  started: 'bus:started',
  completed: 'bus:completed',
  boarding: 'bus:boarding',
  nearby: 'bus:nearby',
  arrived: 'bus:arrived',
  ping: 'ping',
} as const;

export interface TripStateEvent {
  tripId: string;
  routeId: string;
  status: 'NOT_STARTED' | 'STARTED' | 'ON_ROUTE' | 'COMPLETED' | 'CANCELLED';
  direction: string;
  busNumber: string | null;
  driverName: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
}
