import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import {
  TRACK_EVENTS,
  TRACKING,
  etaSeconds,
  formatEta,
  haversineMeters,
  isValidFix,
  proximityFor,
  shouldPublish,
  trackingChannels,
  type LocationFix,
  type TripStateEvent,
} from '@/lib/tracking';
import { publish } from '@/lib/services/tracking-bus';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { assertSameSchool } from '@/lib/tenant';

/**
 * Transport domain.
 *
 * Every mutation lives here rather than in a route handler, because tracking
 * has two front doors — the driver's live stream and the REST fallback used
 * when a phone is on a network that blocks streaming. Both must apply the same
 * throttling, the same trip rules and the same notification dedupe, so neither
 * is allowed its own copy of the logic.
 */

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const today = () => new Date().toISOString().slice(0, 10);

export function toTripState(
  trip: typeof t.trips.$inferSelect,
  extra?: { busNumber?: string | null; driverName?: string | null },
): TripStateEvent {
  return {
    tripId: trip.id,
    routeId: trip.routeId,
    status: trip.status,
    direction: trip.direction,
    busNumber: extra?.busNumber ?? null,
    driverName: extra?.driverName ?? null,
    latitude: trip.latitude,
    longitude: trip.longitude,
    accuracyM: trip.accuracyM,
    heading: trip.heading,
    speedMps: trip.speedMps,
    startedAt: iso(trip.startedAt),
    lastSeenAt: iso(trip.lastSeenAt),
    endedAt: iso(trip.endedAt),
  };
}

/** The trip a driver is currently running, if any. */
export async function activeTrip(schoolId: string, driverId: string) {
  return db.query.trips.findFirst({
    where: and(eq(t.trips.schoolId, schoolId), eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)),
    with: { route: { with: { bus: true } }, driver: { with: { user: { columns: { name: true } } } } },
  });
}

/**
 * Opening a trip implicitly closes any earlier one for the same driver. A phone
 * that lost signal mid-round leaves an orphan trip behind; without this,
 * parents would see two markers for one bus.
 */
export async function startTrip(input: {
  schoolId: string;
  driverId: string;
  routeId: string;
  direction: 'PICKUP' | 'DROP';
}) {
  const { schoolId, driverId, routeId, direction } = input;

  const route = await db.query.routes.findFirst({
    where: eq(t.routes.id, routeId),
    with: { bus: true },
  });
  assertSameSchool(route ?? null, schoolId);
  if (!route!.isActive) throw badRequest('That route is not active.');

  // A driver may only run a route they are assigned to.
  if (route!.driverId !== driverId) throw forbidden('You are not assigned to this route.');

  const driver = await db.query.drivers.findFirst({
    where: eq(t.drivers.id, driverId),
    with: { user: { columns: { name: true } } },
  });

  const trip = await db.transaction(async (tx) => {
    await tx
      .update(t.trips)
      .set({ isActive: false, status: 'COMPLETED', endedAt: new Date() })
      .where(and(eq(t.trips.schoolId, schoolId), eq(t.trips.driverId, driverId), eq(t.trips.isActive, true)));

    const [row] = await tx
      .insert(t.trips)
      .values({
        schoolId,
        routeId,
        busId: route!.busId,
        driverId,
        direction,
        status: 'STARTED',
        startedAt: new Date(),
        lastSeenAt: new Date(),
        date: today(),
        isActive: true,
      })
      .returning();
    return row;
  });

  const state = toTripState(trip, { busNumber: route!.bus?.busNumber, driverName: driver?.user.name });
  publish(trackingChannels.route(schoolId, routeId), TRACK_EVENTS.started, state);

  // Tell the families on this route that the bus has set off.
  const studentIds = await studentsOnRoute(schoolId, routeId);
  if (studentIds.length) {
    await notify({
      schoolId,
      userIds: await guardianUserIds(schoolId, studentIds),
      type: 'TRANSPORT',
      title: `${route!.bus?.busNumber ?? 'The school bus'} has started its ${direction.toLowerCase()} trip`,
      body: `You can follow it live from the parent portal.`,
      link: '/parent/transport',
    });
  }
  return state;
}

export async function endTrip(input: { schoolId: string; driverId: string }) {
  const trip = await activeTrip(input.schoolId, input.driverId);
  if (!trip) throw conflict('You do not have a trip in progress.');

  const [updated] = await db
    .update(t.trips)
    .set({ isActive: false, status: 'COMPLETED', endedAt: new Date() })
    .where(eq(t.trips.id, trip.id))
    .returning();

  const state = toTripState(updated, {
    busNumber: trip.route.bus?.busNumber,
    driverName: trip.driver?.user.name,
  });
  publish(trackingChannels.route(input.schoolId, trip.routeId), TRACK_EVENTS.completed, state);
  return state;
}

/** Students assigned to a route today. */
async function studentsOnRoute(schoolId: string, routeId: string) {
  const rows = await db
    .select({ studentId: t.studentTransport.studentId })
    .from(t.studentTransport)
    .where(and(eq(t.studentTransport.schoolId, schoolId), eq(t.studentTransport.routeId, routeId)));
  return [...new Set(rows.map((r) => r.studentId))];
}

/**
 * Short-lived cache of the stops on a route with the students waiting at each.
 *
 * The proximity sweep runs on every published fix — every few seconds per
 * moving bus. Re-reading these tables at that rate is the one part of tracking
 * that would actually hurt under load, and a route's membership does not change
 * mid-trip. Sixty seconds is well inside a run.
 */
const ROUTE_CACHE_TTL_MS = 60_000;
type StopWithStudents = { stopId: string; name: string; latitude: number; longitude: number; studentIds: string[] };
const routeCache = new Map<string, { at: number; stops: StopWithStudents[] }>();

async function routeStopsWithStudents(schoolId: string, routeId: string): Promise<StopWithStudents[]> {
  const key = `${schoolId}:${routeId}`;
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_CACHE_TTL_MS) return hit.stops;

  const stops = await db
    .select()
    .from(t.routeStops)
    .where(and(eq(t.routeStops.schoolId, schoolId), eq(t.routeStops.routeId, routeId)))
    .orderBy(asc(t.routeStops.order));

  const assignments = await db
    .select({ studentId: t.studentTransport.studentId, stopId: t.studentTransport.stopId })
    .from(t.studentTransport)
    .where(and(eq(t.studentTransport.schoolId, schoolId), eq(t.studentTransport.routeId, routeId)));

  const byStop = new Map<string, string[]>();
  for (const a of assignments) byStop.set(a.stopId, [...(byStop.get(a.stopId) ?? []), a.studentId]);

  const result = stops
    .filter((s) => s.latitude !== null && s.longitude !== null)
    .map((s) => ({
      stopId: s.id,
      name: s.name,
      latitude: s.latitude!,
      longitude: s.longitude!,
      studentIds: byStop.get(s.id) ?? [],
    }));

  routeCache.set(key, { at: Date.now(), stops: result });
  if (routeCache.size > 500) {
    for (const [k, v] of routeCache) if (Date.now() - v.at > ROUTE_CACHE_TTL_MS) routeCache.delete(k);
  }
  return result;
}

export function clearRouteCache() {
  routeCache.clear();
}

/**
 * Records a GPS fix against the driver's active trip.
 *
 * Applies the shared publish policy before writing, so a phone reporting every
 * second costs one row every few seconds rather than 60 a minute.
 */
export async function recordFix(input: { schoolId: string; driverId: string; fix: LocationFix }) {
  const { schoolId, driverId, fix } = input;
  if (!isValidFix(fix)) throw badRequest('That location reading could not be used.');

  const trip = await activeTrip(schoolId, driverId);
  if (!trip) throw conflict('Start a trip before sending a location.');

  const previous =
    trip.latitude === null || trip.longitude === null ? null : { latitude: trip.latitude, longitude: trip.longitude };
  const elapsedMs = trip.lastSeenAt ? Date.now() - trip.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
  if (!shouldPublish({ previous, next: fix, elapsedMs })) return { skipped: true as const };

  const now = new Date();
  const data = {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyM: fix.accuracyM ?? null,
    heading: fix.heading ?? null,
    speedMps: fix.speedMps ?? null,
  };

  // The trip state and the breadcrumb are one unit: a trail point with no
  // corresponding trip state would make replay disagree with the live view.
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(t.trips)
      .set({ ...data, lastSeenAt: now, status: trip.status === 'STARTED' ? 'ON_ROUTE' : trip.status })
      .where(eq(t.trips.id, trip.id))
      .returning();
    await tx.insert(t.gpsLocations).values({ tripId: trip.id, ...data, recordedAt: now });
    return rows;
  });

  const state = toTripState(updated, {
    busNumber: trip.route.bus?.busNumber,
    driverName: trip.driver?.user.name,
  });
  publish(trackingChannels.route(schoolId, trip.routeId), TRACK_EVENTS.moved, state);

  const notices = await detectProximity({ schoolId, tripId: trip.id, routeId: trip.routeId, fix, busNumber: trip.route.bus?.busNumber ?? 'The school bus' });
  return { skipped: false as const, state, notices };
}

export interface ProximityNotice {
  stopId: string;
  stopName: string;
  kind: 'NEARBY' | 'ARRIVED';
  distanceM: number;
  etaSeconds: number;
  studentIds: string[];
}

/**
 * Finds stops the bus has just reached. The unique index on trip_notices does
 * the deduplication, so a bus circling a block cannot spam a family's phone.
 */
async function detectProximity(input: {
  schoolId: string;
  tripId: string;
  routeId: string;
  fix: LocationFix;
  busNumber: string;
}): Promise<ProximityNotice[]> {
  const { schoolId, tripId, routeId, fix, busNumber } = input;
  const stops = await routeStopsWithStudents(schoolId, routeId);
  const notices: ProximityNotice[] = [];

  for (const stop of stops) {
    if (!stop.studentIds.length) continue;
    const distanceM = haversineMeters(fix, stop);
    const proximity = proximityFor(distanceM);
    if (proximity === 'FAR') continue;

    const seconds = etaSeconds({ distanceM, speedMps: fix.speedMps });

    // One row per (trip, student, kind). Conflict means already told.
    const claimed: string[] = [];
    for (const studentId of stop.studentIds) {
      const inserted = await db
        .insert(t.tripNotices)
        .values({ schoolId, tripId, studentId, kind: proximity, distanceM: Math.round(distanceM), etaSeconds: seconds })
        .onConflictDoNothing()
        .returning({ id: t.tripNotices.id });
      if (inserted.length) claimed.push(studentId);
    }
    if (!claimed.length) continue;

    notices.push({ stopId: stop.stopId, stopName: stop.name, kind: proximity, distanceM, etaSeconds: seconds, studentIds: claimed });

    await notify({
      schoolId,
      userIds: await guardianUserIds(schoolId, claimed),
      type: 'TRANSPORT',
      title: proximity === 'ARRIVED' ? `${busNumber} has reached ${stop.name}` : `${busNumber} is approaching ${stop.name}`,
      body:
        proximity === 'ARRIVED'
          ? `The bus is at ${stop.name} now.`
          : `The bus is about ${formatEta(seconds)} from ${stop.name}.`,
      link: '/parent/transport',
      priority: 'HIGH',
      channels: ['IN_APP', 'SMS'],
    });

    publish(
      trackingChannels.route(schoolId, routeId),
      proximity === 'ARRIVED' ? TRACK_EVENTS.arrived : TRACK_EVENTS.nearby,
      { tripId, stopId: stop.stopId, stopName: stop.name, distanceM, etaSeconds: seconds },
    );
  }
  return notices;
}

/**
 * Records a child boarding or leaving the bus and tells their guardians.
 * This is the event families care about most, so it is never throttled.
 */
export async function recordBoarding(input: {
  schoolId: string;
  driverId: string;
  studentId: string;
  type: 'BOARDED' | 'DROPPED' | 'ABSENT';
  stopId?: string | null;
  note?: string | null;
}) {
  const { schoolId, driverId, studentId, type } = input;
  const trip = await activeTrip(schoolId, driverId);
  if (!trip) throw conflict('Start a trip before marking students.');

  // The child must actually be assigned to the route being driven.
  const assignment = await db.query.studentTransport.findFirst({
    where: and(
      eq(t.studentTransport.schoolId, schoolId),
      eq(t.studentTransport.studentId, studentId),
      eq(t.studentTransport.routeId, trip.routeId),
    ),
  });
  if (!assignment) throw forbidden('That student is not assigned to this route.');

  const student = await db.query.students.findFirst({
    where: eq(t.students.id, studentId),
    columns: { id: true, firstName: true },
  });
  if (!student) throw notFound('Student not found');

  const [event] = await db
    .insert(t.busEvents)
    .values({ tripId: trip.id, studentId, stopId: input.stopId ?? assignment.stopId, type, note: input.note ?? null })
    .returning();

  const verb = type === 'BOARDED' ? 'boarded the bus' : type === 'DROPPED' ? 'got off the bus' : 'was not at the stop';
  await notify({
    schoolId,
    userIds: await guardianUserIds(schoolId, [studentId]),
    type: 'TRANSPORT',
    title: `${student.firstName} ${verb}`,
    body: `${trip.route.bus?.busNumber ?? 'The school bus'} · ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
    link: '/parent/transport',
    priority: type === 'ABSENT' ? 'HIGH' : 'NORMAL',
    channels: ['IN_APP', 'SMS'],
  });

  publish(trackingChannels.route(schoolId, trip.routeId), TRACK_EVENTS.boarding, {
    tripId: trip.id,
    studentId,
    type,
  });
  return event;
}

/** Closes trips whose phone stopped reporting, so no bus is "live" forever. */
export async function reapStaleTrips(schoolId: string) {
  const cutoff = new Date(Date.now() - TRACKING.STALE_TRIP_MS);
  const rows = await db
    .update(t.trips)
    .set({ isActive: false, status: 'COMPLETED', endedAt: new Date() })
    .where(and(eq(t.trips.schoolId, schoolId), eq(t.trips.isActive, true), lt(t.trips.lastSeenAt, cutoff)))
    .returning({ id: t.trips.id, routeId: t.trips.routeId });

  for (const row of rows) {
    publish(trackingChannels.route(schoolId, row.routeId), TRACK_EVENTS.completed, { tripId: row.id });
  }
  return rows.length;
}

/** What a guardian sees: their child's route, stop, live bus and ETA. */
export async function studentTrackingView(schoolId: string, studentId: string) {
  const assignment = await db.query.studentTransport.findFirst({
    where: and(eq(t.studentTransport.schoolId, schoolId), eq(t.studentTransport.studentId, studentId)),
    with: {
      route: { with: { bus: true, driver: { with: { user: { columns: { name: true } } } }, stops: true } },
      stop: true,
    },
  });
  if (!assignment) return null;

  await reapStaleTrips(schoolId);

  const trip = await db.query.trips.findFirst({
    where: and(eq(t.trips.schoolId, schoolId), eq(t.trips.routeId, assignment.routeId), eq(t.trips.isActive, true)),
    orderBy: desc(t.trips.startedAt),
  });

  const trail = trip
    ? await db
        .select({ latitude: t.gpsLocations.latitude, longitude: t.gpsLocations.longitude })
        .from(t.gpsLocations)
        .where(eq(t.gpsLocations.tripId, trip.id))
        .orderBy(desc(t.gpsLocations.recordedAt))
        .limit(TRACKING.TRAIL_POINTS)
    : [];

  const events = trip
    ? await db
        .select()
        .from(t.busEvents)
        .where(and(eq(t.busEvents.tripId, trip.id), eq(t.busEvents.studentId, studentId)))
        .orderBy(desc(t.busEvents.createdAt))
        .limit(5)
    : [];

  const stop = assignment.stop;
  const distanceM =
    trip?.latitude != null && trip?.longitude != null && stop.latitude != null && stop.longitude != null
      ? haversineMeters(
          { latitude: trip.latitude, longitude: trip.longitude },
          { latitude: stop.latitude, longitude: stop.longitude },
        )
      : null;

  return {
    route: {
      id: assignment.route.id,
      name: assignment.route.name,
      busNumber: assignment.route.bus?.busNumber ?? null,
      driverName: assignment.route.driver?.user.name ?? null,
      stops: assignment.route.stops.sort((a, b) => a.order - b.order),
    },
    stop,
    trip: trip
      ? toTripState(trip, { busNumber: assignment.route.bus?.busNumber, driverName: assignment.route.driver?.user.name })
      : null,
    trail: trail.reverse(),
    events,
    distanceM,
    etaSeconds: distanceM === null ? null : etaSeconds({ distanceM, speedMps: trip?.speedMps }),
  };
}

/** Documents about to expire — the safety half of transport. */
export async function expiringDocuments(schoolId: string, withinDays = 45) {
  const cutoff = new Date(Date.now() + withinDays * 864e5).toISOString().slice(0, 10);
  const buses = await db
    .select()
    .from(t.buses)
    .where(and(eq(t.buses.schoolId, schoolId), eq(t.buses.isActive, true)));
  const drivers = await db
    .select({ id: t.drivers.id, licenseNumber: t.drivers.licenseNumber, licenseExpiry: t.drivers.licenseExpiry, userId: t.drivers.userId })
    .from(t.drivers)
    .where(and(eq(t.drivers.schoolId, schoolId), eq(t.drivers.isActive, true)));

  const alerts: { kind: string; subject: string; document: string; expiresOn: string }[] = [];
  for (const bus of buses) {
    for (const [document, date] of [
      ['Insurance', bus.insuranceExpiry],
      ['Fitness certificate', bus.fitnessExpiry],
      ['Pollution certificate', bus.pollutionExpiry],
    ] as const) {
      if (date && date <= cutoff) alerts.push({ kind: 'BUS', subject: bus.busNumber, document, expiresOn: date });
    }
  }
  for (const driver of drivers) {
    if (driver.licenseExpiry && driver.licenseExpiry <= cutoff) {
      alerts.push({ kind: 'DRIVER', subject: driver.licenseNumber, document: 'Driving licence', expiresOn: driver.licenseExpiry });
    }
  }
  return alerts.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}
