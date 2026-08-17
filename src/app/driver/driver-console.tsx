'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, Bus, Check, X, UserX, Navigation, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { TRACKING, fixQuality, shouldPublish, type GeoPoint } from '@/lib/tracking';
import { cn } from '@/lib/utils';

type Student = { id: string; firstName: string; lastName: string; stopId: string; stopName: string };
type Trip = { id: string; status: string; direction: string } | null;

/**
 * The driver's screen.
 *
 * Location is watched continuously by the browser, but only *published* when
 * the shared policy says so — the same `shouldPublish` the server applies, so
 * the phone's radio and the database stay quiet while the bus is at a stop.
 */
export function DriverConsole({
  route,
  students,
  initialTrip,
  initialEvents,
}: {
  route: { id: string; name: string; busNumber: string | null; stops: { id: string; name: string; order: number; pickupTime: string | null }[] };
  students: Student[];
  initialTrip: Trip;
  initialEvents: { studentId: string; type: string }[];
}) {
  const toast = useToast();
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>(
    Object.fromEntries(initialEvents.map((e) => [e.studentId, e.type])),
  );
  const [fixCount, setFixCount] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const lastRef = useRef<{ point: GeoPoint; at: number } | null>(null);
  const watchRef = useRef<number | null>(null);

  const publish = useCallback(async (fix: GeoPoint & { accuracyM?: number | null; heading?: number | null; speedMps?: number | null }) => {
    try {
      await api.post('/api/transport/fix', fix);
      setFixCount((n) => n + 1);
    } catch {
      // A dropped fix is not worth interrupting the driver for; the next one
      // carries the same information.
    }
  }, []);

  // Watch position only while a trip is running.
  useEffect(() => {
    if (!trip || trip.status === 'COMPLETED') {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) {
      setGeoError('This device cannot share its location.');
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        setAccuracy(pos.coords.accuracy);
        const next: GeoPoint = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (fixQuality(pos.coords.accuracy) === 'UNUSABLE') return;

        const previous = lastRef.current;
        const elapsedMs = previous ? Date.now() - previous.at : Number.POSITIVE_INFINITY;
        if (!shouldPublish({ previous: previous?.point ?? null, next, elapsedMs })) return;

        lastRef.current = { point: next, at: Date.now() };
        void publish({
          ...next,
          accuracyM: pos.coords.accuracy ?? null,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speedMps: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
        });
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission is off. Turn it on so families can follow the bus.'
            : 'Waiting for a GPS signal…',
        );
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [trip, publish]);

  async function start(direction: 'PICKUP' | 'DROP') {
    setBusy(true);
    try {
      const state = await api.post<{ tripId: string; status: string; direction: string }>('/api/transport/trip', {
        routeId: route.id,
        direction,
      });
      setTrip({ id: state.tripId, status: state.status, direction: state.direction });
      lastRef.current = null;
      toast.success('Trip started', 'Families can now follow the bus.');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not start the trip.');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      await api.del('/api/transport/trip');
      setTrip(null);
      setMarks({});
      toast.success('Trip completed');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not end the trip.');
    } finally {
      setBusy(false);
    }
  }

  async function mark(student: Student, type: 'BOARDED' | 'DROPPED' | 'ABSENT') {
    const previous = marks[student.id];
    setMarks((m) => ({ ...m, [student.id]: type }));
    try {
      await api.post('/api/transport/boarding', { studentId: student.id, type, stopId: student.stopId });
      toast.success(`${student.firstName} — ${type.toLowerCase()}`, 'Guardians notified.');
    } catch (err) {
      setMarks((m) => ({ ...m, [student.id]: previous }));
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not record that.');
    }
  }

  const running = Boolean(trip);
  const byStop = route.stops.map((stop) => ({ stop, students: students.filter((s) => s.stopId === stop.id) }));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Bus className="h-5 w-5 text-brand-600" />
                {route.busNumber ?? 'Bus'}
              </p>
              <p className="truncate text-sm text-slate-500">{route.name}</p>
            </div>
            {running ? (
              <Badge tone="green">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {trip!.direction.toLowerCase()} live
              </Badge>
            ) : (
              <Badge tone="slate">not started</Badge>
            )}
          </div>

          {running && (
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Navigation className="h-3.5 w-3.5" />
              {fixCount} position{fixCount === 1 ? '' : 's'} sent
              {accuracy !== null && ` · accurate to ${Math.round(accuracy)} m`}
            </p>
          )}

          {geoError && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {geoError}
            </p>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {!running ? (
              <>
                <Button size="lg" className="w-full" loading={busy} onClick={() => start('PICKUP')}>
                  <Play className="h-5 w-5" /> Start pickup
                </Button>
                <Button size="lg" variant="secondary" className="w-full" loading={busy} onClick={() => start('DROP')}>
                  <Play className="h-5 w-5" /> Start drop
                </Button>
              </>
            ) : (
              <Button size="lg" variant="danger" className="w-full sm:col-span-2" loading={busy} onClick={end}>
                <Square className="h-5 w-5" /> End trip
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {byStop.map(({ stop, students: list }) => (
        <Card key={stop.id}>
          <CardHeader
            title={`${stop.order}. ${stop.name}`}
            description={`${list.length} student${list.length === 1 ? '' : 's'}${stop.pickupTime ? ` · ${stop.pickupTime}` : ''}`}
          />
          <CardBody className="space-y-2">
            {list.length === 0 && <p className="text-sm text-slate-500">Nobody boards here.</p>}
            {list.map((student) => {
              const state = marks[student.id];
              return (
                <div key={student.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                      {student.firstName} {student.lastName}
                    </span>
                    {state && (
                      <Badge tone={state === 'ABSENT' ? 'red' : state === 'DROPPED' ? 'blue' : 'green'}>
                        {state.toLowerCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(
                      [
                        { type: 'BOARDED', label: 'Boarded', icon: Check, tone: 'bg-emerald-600' },
                        { type: 'DROPPED', label: 'Dropped', icon: X, tone: 'bg-sky-600' },
                        { type: 'ABSENT', label: 'Absent', icon: UserX, tone: 'bg-rose-600' },
                      ] as const
                    ).map((action) => (
                      <button
                        key={action.type}
                        type="button"
                        disabled={!running}
                        onClick={() => mark(student, action.type)}
                        className={cn(
                          'flex h-12 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40',
                          state === action.type ? `${action.tone} text-white` : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                        )}
                      >
                        <action.icon className="h-4 w-4" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      ))}

      {!running && (
        <p className="pb-6 text-center text-xs text-slate-500">
          Start a trip to share your location and mark students. Location is only shared while a trip is running.
        </p>
      )}
    </div>
  );
}
