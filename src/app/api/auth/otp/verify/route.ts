import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { otpVerifySchema } from '@/lib/validation/schemas';
import { verifyOtp } from '@/lib/auth/otp';
import { createSession, loadSessionUser } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { AppError } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const { schoolId, phone, code } = await parseBody(req, otpVerifySchema);

  const parent = await db.query.parents.findFirst({
    where: and(eq(t.parents.schoolId, schoolId), eq(t.parents.phone, phone), isNull(t.parents.deletedAt)),
  });
  if (!parent) throw new AppError('Your mobile number is not registered with this school.', 404, 'NOT_ENROLLED');

  await verifyOtp(schoolId, phone, code);

  await createSession(parent.userId, schoolId);
  const session = await loadSessionUser(parent.userId);
  await recordAudit({ session, schoolId, action: 'auth.parent_otp_login', entity: 'Parent', entityId: parent.id });

  return ok({ redirectTo: '/parent' });
});
