'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bus, MapPin, Clock, Phone, CircleDot, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BusMap, type StopPin } from '@/components/tracking/bus-map';
import { useBusStream, useIsStale, usePoll } from '@/components/tracking/use-bus-stream';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { TRACK_EVENTS, formatDistance, formatEta, haversineMeters, isStale as fixIsStale, type TripStateEvent } from '@/lib/tracking';
import { cn, formatDate } from '@/lib/utils';

type View = Awaited<ReturnType<typeof import('@/lib/services/transport').studentTrackingView>>;

/**
 * The parent's live view.
 *
 * The stream is the fast path; polling is the honest fallback. If no event has
 * arrived for a while the component stops trusting the connection and fetches,
 * so a broken fan-out degrades to a slower map rather than a frozen one.
 */
export function LiveTracking({
  studentId,
  childName,
  initial,
}: {
  studentId: string;
  childName: string;
  initial: NonNullable<View>;
}) {
  const [trip, setTrip] = useState<TripStateEvent | null>(initial.trip);
  const [trail, setTrail] = useState(initial.trail);
  const [alert, setAlert] = useState<{ kind: string; stopName: string; etaSeconds: number } | null>(null);

  const { state, lastMessageAt } = useBusStream(`/api/transport/stream?studentId=${studentId}`, {
    [TRACK_EVENTS.moved]: (data) => {
      const next = data as TripStateEvent;
      setTrip(next);
      if (next.latitude !== null && next.longitude !== null) {
        setTrail((prev) => [...prev, { latitude: next.latitude!, longitude: next.longitude! }].slice(-80));
      }
    },
    [TRACK_EVENTS.started]: (data) => setTrip(data as TripStateEvent),
    [TRACK_EVENTS.completed]: () => setTrip(null),
    [TRACK_EVENTS.nearby]: (data) => setAlert({ kind: 'NEARBY', ...(data as { stopName: string; etaSeconds: number }) }),
    [TRACK_EVENTS.arrived]: (data) => setAlert({ kind: 'ARRIVED', ...(data as { stopName: string; etaSeconds: number }) }),
  });

  // Fall back to polling when the stream has gone quiet for 30 seconds.
  const stale = useIsStale(lastMessageAt, 30_000, state === 'live');
  const polled = usePoll<NonNullable<View>>(`/api/parent/transport?studentId=${studentId}`, 15_000, stale || state !== 'live');

  useEffect(() => {
    if (polled?.trip) {
      setTrip(polled.trip);
      if (polled.trail?.length) setTrail(polled.trail);
    } else if (polled && polled.trip === null) {
      setTrip(null);
    }
  }, [polled]);

  const stop = initial.stop;
  const position = trip?.latitude != null && trip?.longitude != null ? { latitude: trip.latitude, longitude: trip.longitude } : null;

  const distanceM = useMemo(() => {
    if (!position || stop.latitude == null || stop.longitude == null) return null;
    return haversineMeters(position, { latitude: stop.latitude, longitude: stop.longitude });
  }, [position, stop]);

  const eta = distanceM === null ? null : Math.round((distanceM * 1.4) / (trip?.speedMps && trip.speedMps > 1 ? trip.speedMps : 7));

  const stops: StopPin[] = initial.route.stops
    .filter((s) => s.latitude !== null && s.longitude !== null)
    .map((s) => ({
      id: s.id,
      label: s.name,
      latitude: s.latitude!,
      longitude: s.longitude!,
      order: s.order,
      isDestination: s.id === stop.id,
    }));

  const live = Boolean(trip) && !fixIsStale(trip?.lastSeenAt);
  const approximate = (trip?.accuracyM ?? 0) > 200;

  return (
    <div className="space-y-5">
      {alert && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
            alert.kind === 'ARRIVED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          {alert.kind === 'ARRIVED' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Clock className="h-5 w-5 shrink-0" />}
          <span>
            {alert.kind === 'ARRIVED'
              ? `The bus has reached ${alert.stopName}.`
              : `The bus is about ${formatEta(alert.etaSeconds)} from ${alert.stopName}.`}
          </span>
        </div>
      )}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {initial.route.busNumber ?? 'School bus'}
              {live ? (
                <Badge tone="green">
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  live
                </Badge>
              ) : (
                <Badge tone="slate">not running</Badge>
              )}
              {stale && live && <Badge tone="amber">reconnecting</Badge>}
            </span>
          }
          description={initial.route.name}
          action={
            live && distanceM !== null ? (
              <div className="text-right">
                <p className="text-lg font-semibold text-slate-900">{formatEta(eta)}</p>
                <p className="text-xs text-slate-500">{formatDistance(distanceM)} from {stop.name}</p>
              </div>
            ) : undefined
          }
        />
        <CardBody className="space-y-4">
          {live ? (
            <>
              <BusMap
                position={position}
                stops={stops}
                trail={trail}
                approximate={approximate}
                height={380}
              />
              {approximate && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  The bus signal is approximate right now, so the marker may be slightly off.
                </p>
              )}
            </>
          ) : (
            <EmptyState
              icon={Bus}
              title="The bus is not on the road right now"
              description={`You will see ${initial.route.busNumber ?? 'the bus'} here as soon as the driver starts the trip, and we will notify you when it approaches ${stop.name}.`}
            />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your stop and route" />
          <CardBody>
            <ol className="space-y-2">
              {initial.route.stops.map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2',
                    s.id === stop.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-slate-50',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm">
                    {s.id === stop.id ? (
                      <MapPin className="h-4 w-4 text-brand-600" />
                    ) : (
                      <CircleDot className="h-4 w-4 text-slate-300" />
                    )}
                    <span className={s.id === stop.id ? 'font-medium text-slate-900' : 'text-slate-600'}>
                      {s.order}. {s.name}
                    </span>
                    {s.id === stop.id && <Badge tone="brand">{childName}&apos;s stop</Badge>}
                  </span>
                  <span className="text-xs text-slate-500">{s.pickupTime ?? ''}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Today" description="Boarding record and crew" />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4" /> Driver
              </span>
              <span className="font-medium text-slate-900">{initial.route.driverName ?? 'Not assigned'}</span>
            </div>

            {initial.events.length === 0 ? (
              <p className="text-sm text-slate-500">No boarding recorded on this trip yet.</p>
            ) : (
              <ul className="space-y-2">
                {initial.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-700">{e.type.toLowerCase()}</span>
                    <span className="text-xs text-slate-500">{formatDate(e.createdAt, { timeStyle: 'short', dateStyle: 'medium' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
