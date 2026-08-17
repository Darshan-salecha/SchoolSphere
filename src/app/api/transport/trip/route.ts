import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { tripStartSchema } from '@/lib/validation/schemas';
import { endTrip, startTrip } from '@/lib/services/transport';
import { recordAudit } from '@/lib/audit';
import { forbidden } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('transport.trip.operate');
  if (!session.driverId) throw forbidden('Only a driver can start a trip.');
  const input = await parseBody(req, tripStartSchema);

  const state = await startTrip({
    schoolId: session.schoolId,
    driverId: session.driverId,
    routeId: input.routeId,
    direction: input.direction,
  });
  await recordAudit({ session, action: 'trip.started', entity: 'Trip', entityId: state.tripId, after: { routeId: input.routeId, direction: input.direction } });
  return ok(state);
});

export const DELETE = handler(async () => {
  const session = await requireSchoolContext('transport.trip.operate');
  if (!session.driverId) throw forbidden('Only a driver can end a trip.');

  const state = await endTrip({ schoolId: session.schoolId, driverId: session.driverId });
  await recordAudit({ session, action: 'trip.completed', entity: 'Trip', entityId: state.tripId });
  return ok(state);
});
