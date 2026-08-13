import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { loginSchema } from '@/lib/validation/schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, loadSessionUser } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/landing';
import { recordAudit } from '@/lib/audit';
import { AppError } from '@/lib/errors';

const failedLogins = new Map<string, { count: number; until: number }>();

export const POST = handler(async (req: Request) => {
  const { email, password } = await parseBody(req, loginSchema);
  const key = email.toLowerCase();

  const blocked = failedLogins.get(key);
  if (blocked && blocked.count >= 8 && Date.now() < blocked.until) {
    throw new AppError('Too many failed attempts. Please try again in a few minutes.', 429, 'RATE_LIMITED');
  }

  const user = await db.query.users.findFirst({
    where: and(eq(t.users.email, key), isNull(t.users.deletedAt)),
    with: { school: { columns: { status: true } } },
  });

  // Identical response whether the account is missing or the password is wrong.
  const invalid = new AppError('Those credentials do not match our records.', 401, 'INVALID_CREDENTIALS');
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    const entry = failedLogins.get(key) ?? { count: 0, until: 0 };
    failedLogins.set(key, { count: entry.count + 1, until: Date.now() + 5 * 60_000 });
    throw invalid;
  }
  failedLogins.delete(key);

  if (user.status === 'SUSPENDED') throw new AppError('This account has been suspended.', 403, 'SUSPENDED');
  if (user.school && user.school.status !== 'ACTIVE') {
    throw new AppError('Your school account is not active. Please contact your administrator.', 403, 'SCHOOL_INACTIVE');
  }

  await createSession(user.id, user.schoolId);
  const session = await loadSessionUser(user.id);
  await recordAudit({ session, action: 'auth.login', entity: 'User', entityId: user.id });

  return ok({ redirectTo: session ? landingPath(session) : '/' });
});
