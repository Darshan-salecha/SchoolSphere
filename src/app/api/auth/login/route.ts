import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { loginSchema } from '@/lib/validation/schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, loadSessionUser } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/landing';
import { normalisePhone } from '@/lib/utils';
import { recordAudit } from '@/lib/audit';
import { AppError } from '@/lib/errors';

const failedLogins = new Map<string, { count: number; until: number }>();

export const POST = handler(async (req: Request) => {
  const { identifier, password } = await parseBody(req, loginSchema);
  const key = identifier.toLowerCase();
  const looksLikePhone = /^[\d\s+\-()]+$/.test(identifier);
  const phone = looksLikePhone ? normalisePhone(identifier) : null;

  const blocked = failedLogins.get(key);
  if (blocked && blocked.count >= 8 && Date.now() < blocked.until) {
    throw new AppError('Too many failed attempts. Please try again in a few minutes.', 429, 'RATE_LIMITED');
  }

  // Identical response whether the account is missing or the password is wrong.
  const invalid = new AppError('Those credentials do not match our records.', 401, 'INVALID_CREDENTIALS');
  const fail = () => {
    const entry = failedLogins.get(key) ?? { count: 0, until: 0 };
    failedLogins.set(key, { count: entry.count + 1, until: Date.now() + 5 * 60_000 });
    throw invalid;
  };

  /*
   * A mobile number is only unique *within* a school, so a phone sign-in can
   * match more than one row across tenants. Rather than guessing, every
   * candidate is checked and the login proceeds only if exactly one password
   * verifies — which is also what stops this becoming an account-enumeration
   * oracle.
   */
  const candidates = await db.query.users.findMany({
    where: and(
      isNull(t.users.deletedAt),
      phone ? or(eq(t.users.email, key), eq(t.users.phone, phone)) : eq(t.users.email, key),
    ),
    with: { school: { columns: { status: true } } },
    limit: 10,
  });
  if (!candidates.length) fail();

  const matched: typeof candidates = [];
  for (const candidate of candidates) {
    if (candidate.passwordHash && (await verifyPassword(password, candidate.passwordHash))) matched.push(candidate);
  }
  if (matched.length !== 1) fail();

  const user = matched[0];
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
