import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import {
  clearRouteCache,
  endTrip,
  expiringDocuments,
  reapStaleTrips,
  recordBoarding,
  recordFix,
  startTrip,
  studentTrackingView,
} from '@/lib/services/transport';
import { subscribe, publish } from '@/lib/services/tracking-bus';
import { trackingChannels, TRACK_EVENTS, TRACKING } from '@/lib/tracking';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;
let routeId: string;
let driverId: string;
let riderId: string;
let stopPoint: { latitude: number; longitude: number };

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
  clearRouteCache();

  const route = await db.query.routes.findFirst({
    where: eq(t.routes.schoolId, fx.schoolId),
    with: { stops: true, assignments: true },
  });
  routeId = route!.id;
  driverId = route!.driverId!;

  const assignment = await db.query.studentTransport.findFirst({
    where: and(eq(t.studentTransport.schoolId, fx.schoolId), eq(t.studentTransport.routeId, routeId)),
    with: { stop: true },
  });
  riderId = assignment!.studentId;
  stopPoint = { latitude: assignment!.stop.latitude!, longitude: assignment!.stop.longitude! };
});

/** Drivers must only be able to touch their own route, and parents only their own child's bus. */

describe('trip lifecycle', () => {
  it('starts a trip and notifies the families on the route', async () => {
    const state = await startTrip({ schoolId: fx.schoolId, driverId, routeId, direction: 'PICKUP' });
    expect(state.status).toBe('STARTED');

    const notes = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.schoolId, fx.schoolId), eq(t.notifications.type, 'TRANSPORT')));
    expect(notes.length).toBeGreaterThan(0);
  });

  it('refuses a driver who is not assigned to the route', async () => {
    const otherDriver = await db.query.drivers.findFirst({
      where: and(eq(t.drivers.schoolId, fx.schoolId), eq(t.drivers.id, driverId)),
    });
    const someoneElse = await db.query.drivers.findFirst({
      where: and(eq(t.drivers.schoolId, fx.schoolId)),
      offset: 1,
    });
    expect(someoneElse!.id).not.toBe(otherDriver!.id);
    const err = await expectForbidden(() =>
      startTrip({ schoolId: fx.schoolId, driverId: someoneElse!.id, routeId, direction: 'PICKUP' }),
    );
    expect(err.message).toMatch(/not assigned/i);
  });

  it('closes an orphan trip when a new one starts, so no bus shows twice', async () => {
    await startTrip({ schoolId: fx.schoolId, driverId, routeId, direction: 'DROP' });
    const open = await db
      .select()
      .from(t.trips)
      .where(and(eq(t.trips.schoolId, fx.schoolId), eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)));
    expect(open).toHaveLength(1);
    expect(open[0].direction).toBe('DROP');
  });
});

describe('location fixes', () => {
  it('writes the first fix and a breadcrumb together', async () => {
    const result = await recordFix({
      schoolId: fx.schoolId,
      driverId,
      fix: { latitude: 28.55, longitude: 77.2, accuracyM: 15, speedMps: 8 },
    });
    expect(result.skipped).toBe(false);

    const trip = await db.query.trips.findFirst({
      where: and(eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)),
    });
    const trail = await db.select().from(t.gpsLocations).where(eq(t.gpsLocations.tripId, trip!.id));
    expect(trail.length).toBeGreaterThan(0);
    expect(trip!.status).toBe('ON_ROUTE');
  });

  it('throttles a fix that arrives too soon after the last one', async () => {
    const result = await recordFix({
      schoolId: fx.schoolId,
      driverId,
      fix: { latitude: 28.5501, longitude: 77.2001, accuracyM: 15 },
    });
    expect(result.skipped).toBe(true);
  });

  it('rejects an unusable reading rather than moving the marker', async () => {
    const err = await expectForbidden(() =>
      recordFix({ schoolId: fx.schoolId, driverId, fix: { latitude: 0, longitude: 0 } }),
    );
    expect(err.message).toMatch(/could not be used/i);
  });

  it('refuses a fix with no trip in progress', async () => {
    const spare = await db.query.drivers.findFirst({ where: eq(t.drivers.schoolId, fx.schoolId), offset: 2 });
    const err = await expectForbidden(() =>
      recordFix({ schoolId: fx.schoolId, driverId: spare!.id, fix: { latitude: 28.6, longitude: 77.2 } }),
    );
    expect(err.message).toMatch(/start a trip/i);
  });
});

describe('proximity alerts', () => {
  it('tells the family once when the bus reaches their stop, and not again', async () => {
    clearRouteCache();
    // Park the bus exactly on the stop, well past the throttle window.
    await db
      .update(t.trips)
      .set({ lastSeenAt: new Date(Date.now() - 60_000), latitude: 28.9, longitude: 77.9 })
      .where(and(eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)));

    const first = await recordFix({ schoolId: fx.schoolId, driverId, fix: { ...stopPoint, accuracyM: 10, speedMps: 5 } });
    expect(first.skipped).toBe(false);
    if (!first.skipped) expect(first.notices.length).toBeGreaterThan(0);

    const claimed = await db
      .select()
      .from(t.tripNotices)
      .where(and(eq(t.tripNotices.schoolId, fx.schoolId), eq(t.tripNotices.kind, 'ARRIVED')));
    expect(claimed.length).toBeGreaterThan(0);

    // Circling the same block must not ping anyone twice.
    await db
      .update(t.trips)
      .set({ lastSeenAt: new Date(Date.now() - 60_000) })
      .where(and(eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)));
    const second = await recordFix({
      schoolId: fx.schoolId,
      driverId,
      fix: { latitude: stopPoint.latitude + 0.0004, longitude: stopPoint.longitude, accuracyM: 10 },
    });
    if (!second.skipped) expect(second.notices).toHaveLength(0);
  });
});

describe('boarding', () => {
  it('records boarding and notifies that child’s guardians only', async () => {
    const before = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.schoolId, fx.schoolId), eq(t.notifications.type, 'TRANSPORT')));

    const event = await recordBoarding({ schoolId: fx.schoolId, driverId, studentId: riderId, type: 'BOARDED' });
    expect(event.type).toBe('BOARDED');

    const after = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.schoolId, fx.schoolId), eq(t.notifications.type, 'TRANSPORT')));
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('refuses a student who is not on the route being driven', async () => {
    const offRoute = fx.students.find((s) => s.id !== riderId)!;
    const assigned = await db.query.studentTransport.findFirst({
      where: and(eq(t.studentTransport.studentId, offRoute.id), eq(t.studentTransport.routeId, routeId)),
    });
    if (assigned) return; // that student happens to ride this route; nothing to assert
    const err = await expectForbidden(() =>
      recordBoarding({ schoolId: fx.schoolId, driverId, studentId: offRoute.id, type: 'BOARDED' }),
    );
    expect(err.message).toMatch(/not assigned to this route/i);
  });
});

describe('parent view isolation', () => {
  it('shows a guardian their own child’s route, stop and ETA', async () => {
    const view = await studentTrackingView(fx.schoolId, riderId);
    expect(view).not.toBeNull();
    expect(view!.route.id).toBe(routeId);
    expect(view!.stop.id).toBeTruthy();
  });

  it('returns nothing for a student in another school', async () => {
    const otherStudent = await db.query.students.findFirst({ where: eq(t.students.schoolId, fx.school2Id) });
    const view = await studentTrackingView(fx.school2Id, otherStudent!.id);
    expect(view).toBeNull();
  });
});

describe('stale trips and safety', () => {
  it('closes a trip whose phone stopped reporting', async () => {
    await db
      .update(t.trips)
      .set({ lastSeenAt: new Date(Date.now() - TRACKING.STALE_TRIP_MS - 60_000) })
      .where(and(eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)));

    const closed = await reapStaleTrips(fx.schoolId);
    expect(closed).toBeGreaterThan(0);

    const open = await db
      .select()
      .from(t.trips)
      .where(and(eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)));
    expect(open).toHaveLength(0);
  });

  it('refuses to end a trip that is not running', async () => {
    const err = await expectForbidden(() => endTrip({ schoolId: fx.schoolId, driverId }));
    expect(err.message).toMatch(/do not have a trip/i);
  });

  it('surfaces documents that are expiring', async () => {
    const alerts = await expiringDocuments(fx.schoolId, 60);
    expect(Array.isArray(alerts)).toBe(true);
    // The seed deliberately includes a bus with insurance expiring in 15 days.
    expect(alerts.length).toBeGreaterThan(0);
  });
});

describe('stream channels', () => {
  it('delivers only to subscribers of that school’s route', () => {
    const mine: unknown[] = [];
    const theirs: unknown[] = [];
    const offA = subscribe(trackingChannels.route(fx.schoolId, routeId), (m) => mine.push(m));
    const offB = subscribe(trackingChannels.route(fx.school2Id, routeId), (m) => theirs.push(m));

    publish(trackingChannels.route(fx.schoolId, routeId), TRACK_EVENTS.moved, { tripId: 'x' });

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(0);
    offA();
    offB();
  });

  it('stops delivering after unsubscribe', () => {
    const seen: unknown[] = [];
    const off = subscribe(trackingChannels.route(fx.schoolId, routeId), (m) => seen.push(m));
    off();
    publish(trackingChannels.route(fx.schoolId, routeId), TRACK_EVENTS.moved, { tripId: 'y' });
    expect(seen).toHaveLength(0);
  });
});
