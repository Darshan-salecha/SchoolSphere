import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { otpRequestSchema } from '@/lib/validation/schemas';
import { issueOtp } from '@/lib/auth/otp';
import { AppError } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const { schoolId, phone } = await parseBody(req, otpRequestSchema);

  const school = await db.query.schools.findFirst({
    where: and(eq(t.schools.id, schoolId), eq(t.schools.status, 'ACTIVE'), isNull(t.schools.deletedAt)),
  });
  if (!school) throw new AppError('That school is not available right now.', 404, 'SCHOOL_UNAVAILABLE');

  // Business rule: only numbers the school itself enrolled may sign in.
  const parent = await db.query.parents.findFirst({
    where: and(eq(t.parents.schoolId, schoolId), eq(t.parents.phone, phone), isNull(t.parents.deletedAt)),
    with: { user: { columns: { status: true } } },
  });
  if (!parent || parent.user.status === 'SUSPENDED') {
    throw new AppError('Your mobile number is not registered with this school.', 404, 'NOT_ENROLLED');
  }

  const demoCode = await issueOtp(schoolId, phone);
  return ok({ sent: true, demoCode });
});
