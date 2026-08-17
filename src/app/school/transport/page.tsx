import { and, asc, eq } from 'drizzle-orm';
import { Bus, Route as RouteIcon, Users, ShieldAlert } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { expiringDocuments, reapStaleTrips } from '@/lib/services/transport';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { QuickForm } from '@/components/forms/quick-form';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TransportPage() {
  const session = await requireSchoolPage('transport.view');
  await reapStaleTrips(session.schoolId);

  const [buses, drivers, routes, assignments, alerts] = await Promise.all([
    db.select().from(t.buses).where(eq(t.buses.schoolId, session.schoolId)).orderBy(asc(t.buses.busNumber)),
    db
      .select({ id: t.drivers.id, name: t.users.name, phone: t.drivers.phone, role: t.drivers.role, licenseNumber: t.drivers.licenseNumber, licenseExpiry: t.drivers.licenseExpiry })
      .from(t.drivers)
      .innerJoin(t.users, eq(t.users.id, t.drivers.userId))
      .where(eq(t.drivers.schoolId, session.schoolId)),
    db.query.routes.findMany({
      where: eq(t.routes.schoolId, session.schoolId),
      with: { bus: true, driver: { with: { user: { columns: { name: true } } } }, stops: true, assignments: true },
    }),
    db.select({ id: t.studentTransport.id }).from(t.studentTransport).where(eq(t.studentTransport.schoolId, session.schoolId)),
    expiringDocuments(session.schoolId),
  ]);

  const liveTrips = await db.query.trips.findMany({
    where: and(eq(t.trips.schoolId, session.schoolId), eq(t.trips.isActive, true)),
    with: { route: true, bus: true, driver: { with: { user: { columns: { name: true } } } } },
  });

  const canManage = session.permissions.includes('transport.manage');
  const busOptions = buses.map((b) => ({ value: b.id, label: b.busNumber }));
  const driverOptions = drivers.map((d) => ({ value: d.id, label: `${d.name} (${d.role.toLowerCase()})` }));
  const routeOptions = routes.map((r) => ({ value: r.id, label: r.name }));

  return (
    <>
      <PageHeader
        title="Transport"
        description="Buses, crew, routes and live trips."
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <QuickForm
                title="Add a bus"
                endpoint="/api/school/transport"
                triggerLabel="Bus"
                variant="outline"
                successMessage="Bus added"
                fields={[
                  { name: 'kind', label: 'kind', type: 'select', required: true, defaultValue: 'bus', options: [{ value: 'bus', label: 'bus' }], colSpan: 2 },
                  { name: 'busNumber', label: 'Bus number', required: true, placeholder: 'Bus 12' },
                  { name: 'registrationNumber', label: 'Registration', placeholder: 'DL1PC4412' },
                  { name: 'capacity', label: 'Capacity', type: 'number', defaultValue: 40, min: 1, max: 120 },
                  { name: 'model', label: 'Model', placeholder: 'Tata Starbus' },
                  { name: 'insuranceExpiry', label: 'Insurance expiry', type: 'date' },
                  { name: 'fitnessExpiry', label: 'Fitness expiry', type: 'date' },
                  { name: 'pollutionExpiry', label: 'Pollution expiry', type: 'date' },
                ]}
              />
              <QuickForm
                title="Add a driver or conductor"
                description="They sign in with this mobile number."
                endpoint="/api/school/transport"
                triggerLabel="Crew"
                variant="outline"
                successMessage="Crew member added"
                fields={[
                  { name: 'kind', label: 'kind', type: 'select', required: true, defaultValue: 'driver', options: [{ value: 'driver', label: 'driver' }], colSpan: 2 },
                  { name: 'name', label: 'Full name', required: true },
                  { name: 'phone', label: 'Mobile', type: 'tel', required: true, maxLength: 10 },
                  { name: 'licenseNumber', label: 'Licence number', required: true },
                  { name: 'licenseExpiry', label: 'Licence expiry', type: 'date' },
                  { name: 'role', label: 'Role', type: 'select', required: true, defaultValue: 'DRIVER', options: [{ value: 'DRIVER', label: 'Driver' }, { value: 'CONDUCTOR', label: 'Conductor' }] },
                  { name: 'password', label: 'Temporary password', type: 'password', hint: 'Defaults to Password123!' },
                ]}
              />
              <QuickForm
                title="Create a route"
                endpoint="/api/school/transport"
                triggerLabel="Route"
                successMessage="Route created"
                fields={[
                  { name: 'kind', label: 'kind', type: 'select', required: true, defaultValue: 'route', options: [{ value: 'route', label: 'route' }], colSpan: 2 },
                  { name: 'name', label: 'Route name', required: true, placeholder: 'Route A — Green Park', colSpan: 2 },
                  { name: 'busId', label: 'Bus', type: 'select', options: busOptions },
                  { name: 'driverId', label: 'Driver', type: 'select', options: driverOptions, hint: 'Only this driver can start the trip' },
                ]}
              />
              <QuickForm
                title="Add a stop"
                description="Coordinates enable arrival alerts and the live map."
                endpoint="/api/school/transport"
                triggerLabel="Stop"
                variant="outline"
                successMessage="Stop added"
                disabled={!routes.length}
                disabledHint="Create a route first"
                fields={[
                  { name: 'kind', label: 'kind', type: 'select', required: true, defaultValue: 'stop', options: [{ value: 'stop', label: 'stop' }], colSpan: 2 },
                  { name: 'routeId', label: 'Route', type: 'select', required: true, options: routeOptions, colSpan: 2 },
                  { name: 'name', label: 'Stop name', required: true, placeholder: 'Green Park Metro' },
                  { name: 'order', label: 'Position', type: 'number', required: true, min: 1, max: 100 },
                  { name: 'latitude', label: 'Latitude', placeholder: '28.5600' },
                  { name: 'longitude', label: 'Longitude', placeholder: '77.2100' },
                  { name: 'pickupTime', label: 'Pickup time', placeholder: '07:10' },
                  { name: 'dropTime', label: 'Drop time', placeholder: '14:10' },
                ]}
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Buses" value={buses.length} sub={`${buses.filter((b) => b.isActive).length} active`} icon={Bus} />
        <StatCard label="Routes" value={routes.length} sub={`${routes.reduce((a, r) => a + r.stops.length, 0)} stops`} icon={RouteIcon} tone="blue" />
        <StatCard label="Students transported" value={assignments.length} icon={Users} tone="green" />
        <StatCard label="Document alerts" value={alerts.length} sub="expiring within 45 days" icon={ShieldAlert} tone={alerts.length ? 'red' : 'green'} />
      </div>

      {liveTrips.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Live now" description="Trips currently on the road" />
          <Table>
            <THead>
              <TR>
                <TH>Route</TH>
                <TH>Bus</TH>
                <TH>Driver</TH>
                <TH>Direction</TH>
                <TH>Last seen</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {liveTrips.map((trip) => (
                <TR key={trip.id}>
                  <TD className="font-medium text-slate-900">{trip.route.name}</TD>
                  <TD>{trip.bus?.busNumber ?? '—'}</TD>
                  <TD>{trip.driver?.user.name ?? '—'}</TD>
                  <TD className="capitalize">{trip.direction.toLowerCase()}</TD>
                  <TD className="text-slate-500">{trip.lastSeenAt ? formatDate(trip.lastSeenAt, { timeStyle: 'short', dateStyle: 'medium' }) : '—'}</TD>
                  <TD><StatusBadge status={trip.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {alerts.length > 0 && (
        <Card className="mt-5 border-amber-200">
          <CardHeader title="Documents expiring" description="Renew before these lapse — a bus without valid papers should not run" />
          <CardBody className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
                <span className="text-sm text-amber-900">
                  <strong>{a.subject}</strong> — {a.document}
                </span>
                <Badge tone={a.expiresOn <= new Date().toISOString().slice(0, 10) ? 'red' : 'amber'}>
                  {a.expiresOn <= new Date().toISOString().slice(0, 10) ? 'expired' : 'expires'} {formatDate(a.expiresOn)}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader title="Routes" />
        {routes.length === 0 ? (
          <EmptyState icon={RouteIcon} title="No routes yet" description="Create a route, add its stops, then assign students to a stop." />
        ) : (
          <CardBody className="grid gap-4 lg:grid-cols-2">
            {routes.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.bus?.busNumber ?? 'No bus'} · {r.driver?.user.name ?? 'No driver'} · {r.assignments.length} students
                    </p>
                  </div>
                  <Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? 'active' : 'inactive'}</Badge>
                </div>
                <ol className="mt-3 space-y-1">
                  {r.stops
                    .sort((a, b) => a.order - b.order)
                    .map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1.5 text-xs">
                        <span className="text-slate-700">
                          {s.order}. {s.name}
                          {s.latitude === null && <span className="ml-1.5 text-amber-600">(no coordinates)</span>}
                        </span>
                        <span className="text-slate-400">{s.pickupTime ?? ''}</span>
                      </li>
                    ))}
                  {r.stops.length === 0 && <li className="text-xs text-slate-400">No stops yet.</li>}
                </ol>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Fleet" />
        {buses.length === 0 ? (
          <EmptyState icon={Bus} title="No buses yet" description="Add your fleet to start building routes." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Bus</TH>
                <TH>Registration</TH>
                <TH>Capacity</TH>
                <TH>Insurance</TH>
                <TH>Fitness</TH>
                <TH>Pollution</TH>
              </TR>
            </THead>
            <TBody>
              {buses.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium text-slate-900">{b.busNumber}</TD>
                  <TD>{b.registrationNumber ?? '—'}</TD>
                  <TD>{b.capacity}</TD>
                  <TD>{formatDate(b.insuranceExpiry)}</TD>
                  <TD>{formatDate(b.fitnessExpiry)}</TD>
                  <TD>{formatDate(b.pollutionExpiry)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
