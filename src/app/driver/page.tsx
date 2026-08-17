import { and, asc, desc, eq } from 'drizzle-orm';
import { LogOut } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { activeTrip } from '@/lib/services/transport';
import { EmptyState } from '@/components/ui/states';
import { DriverConsole } from './driver-console';
import { Route as RouteIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Driver portal — deliberately its own layout, not the app shell. Big targets,
 * almost no chrome, one job per screen; it is used one-handed in a moving bus.
 */
export default async function DriverHome() {
  const session = await requireSchoolPage('portal.driver');

  const route = await db.query.routes.findFirst({
    where: and(eq(t.routes.schoolId, session.schoolId), eq(t.routes.driverId, session.driverId!)),
    with: { bus: true, stops: { orderBy: asc(t.routeStops.order) } },
  });

  const trip = await activeTrip(session.schoolId, session.driverId!);

  const students = route
    ? await db
        .select({
          id: t.students.id,
          firstName: t.students.firstName,
          lastName: t.students.lastName,
          stopId: t.studentTransport.stopId,
          stopName: t.routeStops.name,
          emergencyContactPhone: t.students.emergencyContactPhone,
        })
        .from(t.studentTransport)
        .innerJoin(t.students, eq(t.students.id, t.studentTransport.studentId))
        .innerJoin(t.routeStops, eq(t.routeStops.id, t.studentTransport.stopId))
        .where(and(eq(t.studentTransport.schoolId, session.schoolId), eq(t.studentTransport.routeId, route.id)))
        .orderBy(asc(t.routeStops.order), asc(t.students.firstName))
    : [];

  const events = trip
    ? await db.select().from(t.busEvents).where(eq(t.busEvents.tripId, trip.id)).orderBy(desc(t.busEvents.createdAt))
    : [];

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-slate-50 px-4 py-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">Hello, {session.name.split(' ')[0]}</h1>
          <p className="truncate text-sm text-slate-500">{session.schoolName}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="rounded-lg border border-slate-300 bg-white p-3 text-slate-600" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </header>

      {!route ? (
        <div className="card">
          <EmptyState icon={RouteIcon} title="No route assigned" description="The school office will assign you a bus and route." />
        </div>
      ) : (
        <DriverConsole
          route={{
            id: route.id,
            name: route.name,
            busNumber: route.bus?.busNumber ?? null,
            stops: route.stops.map((s) => ({ id: s.id, name: s.name, order: s.order, pickupTime: s.pickupTime })),
          }}
          students={students}
          initialTrip={trip ? { id: trip.id, status: trip.status, direction: trip.direction } : null}
          initialEvents={events.map((e) => ({ studentId: e.studentId!, type: e.type }))}
        />
      )}
    </div>
  );
}
