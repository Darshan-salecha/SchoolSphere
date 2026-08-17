import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { locationFixSchema } from '@/lib/validation/schemas';
import { recordFix } from '@/lib/services/transport';
import { TRACKING } from '@/lib/tracking';
import { forbidden, tooMany } from '@/lib/errors';

/** Per-driver token bucket. Cheap, in-process, reset by the window. */
const budgets = new Map<string, { count: number; windowStart: number }>();

function withinBudget(driverId: string) {
  const now = Date.now();
  const entry = budgets.get(driverId) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart >= 60_000) {
    entry.windowStart = now;
    entry.count = 0;
  }
  entry.count += 1;
  budgets.set(driverId, entry);
  return entry.count <= TRACKING.MAX_FIXES_PER_MINUTE;
}

/**
 * The driver's phone posts here every few seconds. The server applies the same
 * publish policy the client already applied, so a modified client cannot flood
 * the database.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('transport.trip.operate');
  if (!session.driverId) throw forbidden('Only a driver can send a location.');
  if (!withinBudget(session.driverId)) throw tooMany('Too many location updates. Slowing down.');

  const fix = await parseBody(req, locationFixSchema);
  const result = await recordFix({ schoolId: session.schoolId, driverId: session.driverId, fix });

  if (result.skipped) return ok({ skipped: true });
  return ok({ skipped: false, state: result.state, notices: result.notices.length });
});
