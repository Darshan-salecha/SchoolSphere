import { describe, expect, it } from 'vitest';
import {
  TRACKING,
  bearingDegrees,
  etaSeconds,
  fixQuality,
  formatDistance,
  formatEta,
  haversineMeters,
  interpolate,
  isStale,
  isValidFix,
  proximityFor,
  shouldPublish,
  trackingChannels,
} from '@/lib/tracking';

/**
 * The tracking domain is shared by the driver's phone, the server and the
 * parent's map. If these rules disagree anywhere, the map drifts — so they are
 * tested as pure functions, independently of any transport.
 */

const DELHI = { latitude: 28.6139, longitude: 77.209 };

describe('geometry', () => {
  it('measures a known distance accurately', () => {
    // Delhi to Agra is ~180 km.
    const agra = { latitude: 27.1767, longitude: 78.0081 };
    const km = haversineMeters(DELHI, agra) / 1000;
    expect(km).toBeGreaterThan(170);
    expect(km).toBeLessThan(195);
  });

  it('returns zero for the same point', () => {
    expect(haversineMeters(DELHI, DELHI)).toBe(0);
  });

  it('measures short distances precisely', () => {
    // One ten-thousandth of a degree of latitude is ~11 m.
    const near = { latitude: DELHI.latitude + 0.0001, longitude: DELHI.longitude };
    expect(haversineMeters(DELHI, near)).toBeGreaterThan(10);
    expect(haversineMeters(DELHI, near)).toBeLessThan(12);
  });

  it('points north, east, south and west correctly', () => {
    expect(bearingDegrees(DELHI, { latitude: 29, longitude: 77.209 })).toBeCloseTo(0, 0);
    expect(bearingDegrees(DELHI, { latitude: 28.6139, longitude: 78 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(DELHI, { latitude: 28, longitude: 77.209 })).toBeCloseTo(180, 0);
    expect(bearingDegrees(DELHI, { latitude: 28.6139, longitude: 76.5 })).toBeCloseTo(270, 0);
  });

  it('interpolates and clamps outside 0..1', () => {
    const to = { latitude: 29, longitude: 78 };
    expect(interpolate(DELHI, to, 0)).toEqual(DELHI);
    expect(interpolate(DELHI, to, 1)).toEqual(to);
    expect(interpolate(DELHI, to, -5)).toEqual(DELHI);
    expect(interpolate(DELHI, to, 5)).toEqual(to);
    const mid = interpolate(DELHI, to, 0.5);
    expect(mid.latitude).toBeCloseTo((DELHI.latitude + to.latitude) / 2, 6);
  });
});

describe('fix validation', () => {
  it('accepts a precise fix', () => {
    expect(isValidFix({ ...DELHI, accuracyM: 12 })).toBe(true);
    expect(fixQuality(12)).toBe('PRECISE');
  });

  it('accepts a coarse fix but labels it approximate', () => {
    // The bug this guards against: treating "not precise" as "not valid" left
    // the map frozen on any phone without a clear view of the sky.
    expect(fixQuality(900)).toBe('APPROXIMATE');
    expect(isValidFix({ ...DELHI, accuracyM: 900 })).toBe(true);
  });

  it('rejects a city-scale reading', () => {
    expect(fixQuality(50_000)).toBe('UNUSABLE');
    expect(isValidFix({ ...DELHI, accuracyM: 50_000 })).toBe(false);
  });

  it('rejects null island, the classic "GPS not ready" value', () => {
    expect(isValidFix({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it('rejects impossible coordinates and junk', () => {
    expect(isValidFix({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidFix({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidFix({ latitude: Number.NaN, longitude: 12 })).toBe(false);
    expect(isValidFix(null)).toBe(false);
    expect(isValidFix('here')).toBe(false);
  });

  it('assumes usable when the device reports no accuracy at all', () => {
    expect(fixQuality(null)).toBe('PRECISE');
    expect(isValidFix(DELHI)).toBe(true);
  });
});

describe('publish policy', () => {
  const near = { latitude: DELHI.latitude + 0.0005, longitude: DELHI.longitude }; // ~55 m

  it('always publishes the first fix', () => {
    expect(shouldPublish({ previous: null, next: DELHI, elapsedMs: 0 })).toBe(true);
  });

  it('never publishes inside the minimum window, however far the bus moved', () => {
    expect(shouldPublish({ previous: DELHI, next: near, elapsedMs: TRACKING.MIN_PUBLISH_MS - 1 })).toBe(false);
  });

  it('publishes on real movement once the window has passed', () => {
    expect(shouldPublish({ previous: DELHI, next: near, elapsedMs: TRACKING.MIN_PUBLISH_MS + 1 })).toBe(true);
  });

  it('treats sub-threshold movement as jitter, not travel', () => {
    const jitter = { latitude: DELHI.latitude + 0.00005, longitude: DELHI.longitude }; // ~5 m
    expect(shouldPublish({ previous: DELHI, next: jitter, elapsedMs: TRACKING.MIN_PUBLISH_MS + 1 })).toBe(false);
  });

  it('still emits a heartbeat when stationary, so the map shows liveness', () => {
    const jitter = { latitude: DELHI.latitude + 0.00005, longitude: DELHI.longitude };
    expect(shouldPublish({ previous: DELHI, next: jitter, elapsedMs: TRACKING.MAX_PUBLISH_MS + 1 })).toBe(true);
  });
});

describe('proximity and ETA', () => {
  it('buckets distance into far, nearby and arrived', () => {
    expect(proximityFor(5_000)).toBe('FAR');
    expect(proximityFor(TRACKING.NEARBY_RADIUS_M - 1)).toBe('NEARBY');
    expect(proximityFor(TRACKING.ARRIVED_RADIUS_M - 1)).toBe('ARRIVED');
  });

  it('treats the radius boundaries inclusively', () => {
    expect(proximityFor(TRACKING.ARRIVED_RADIUS_M)).toBe('ARRIVED');
    expect(proximityFor(TRACKING.NEARBY_RADIUS_M)).toBe('NEARBY');
  });

  it('ignores an implausible speed rather than predicting next week', () => {
    const parked = etaSeconds({ distanceM: 1_000, speedMps: 0.05 });
    const fallback = etaSeconds({ distanceM: 1_000, speedMps: null });
    expect(parked).toBe(fallback);
  });

  it('uses a trusted speed when the device reports one', () => {
    const fast = etaSeconds({ distanceM: 1_000, speedMps: 15 });
    const slow = etaSeconds({ distanceM: 1_000, speedMps: 5 });
    expect(fast).toBeLessThan(slow);
  });

  it('reads naturally to a parent', () => {
    expect(formatEta(30)).toBe('Arriving now');
    expect(formatEta(300)).toBe('5 min');
    expect(formatEta(3_900)).toBe('1 hr 5 min');
    expect(formatEta(null)).toBe('—');
    expect(formatDistance(120)).toBe('120 m');
    expect(formatDistance(2_500)).toBe('2.5 km');
  });
});

describe('staleness', () => {
  it('treats a recent fix as fresh and an old one as stale', () => {
    expect(isStale(new Date())).toBe(false);
    expect(isStale(new Date(Date.now() - TRACKING.STALE_TRIP_MS - 1_000))).toBe(true);
    expect(isStale(null)).toBe(false);
  });
});

describe('channel isolation', () => {
  it('namespaces every channel by school, so one school cannot watch another', () => {
    const a = trackingChannels.route('school-a', 'route-1');
    const b = trackingChannels.route('school-b', 'route-1');
    expect(a).not.toBe(b);
    expect(a.startsWith('s:school-a:')).toBe(true);
  });
});
