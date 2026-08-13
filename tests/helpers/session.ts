import { loadSessionUser, type SessionUser } from '@/lib/auth/session';

/** Builds a real SessionUser (roles, permissions, scope ids) straight from the database. */
export async function sessionFor(userId: string): Promise<SessionUser & { schoolId: string }> {
  const session = await loadSessionUser(userId);
  if (!session) throw new Error(`No session could be built for ${userId}`);
  return session as SessionUser & { schoolId: string };
}

export async function expectForbidden(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    return err as { status?: number; message: string };
  }
  throw new Error('Expected the call to be rejected, but it succeeded.');
}
