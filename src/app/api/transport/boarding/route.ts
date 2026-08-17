import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { busEventSchema } from '@/lib/validation/schemas';
import { recordBoarding } from '@/lib/services/transport';
import { recordAudit } from '@/lib/audit';
import { forbidden } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('transport.trip.operate');
  if (!session.driverId) throw forbidden('Only the bus crew can mark students.');
  const input = await parseBody(req, busEventSchema);

  const event = await recordBoarding({
    schoolId: session.schoolId,
    driverId: session.driverId,
    studentId: input.studentId,
    type: input.type,
    stopId: input.stopId || null,
    note: input.note || null,
  });

  await recordAudit({ session, action: `bus.${input.type.toLowerCase()}`, entity: 'BusEvent', entityId: event.id, after: { studentId: input.studentId } });
  return ok(event);
});
