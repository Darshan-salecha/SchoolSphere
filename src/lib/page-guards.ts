import { redirect } from 'next/navigation';
import { getSession, type SessionUser } from '@/lib/auth/session';
import type { PermissionKey } from '@/lib/rbac/permissions';
import { landingPath } from '@/lib/auth/landing';

/** Page-level guards. Pages redirect; API routes throw. Both check the same permissions. */
export async function requirePageSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requirePagePermission(...permissions: PermissionKey[]): Promise<SessionUser> {
  const session = await requirePageSession();
  if (!permissions.some((p) => session.permissions.includes(p))) redirect(landingPath(session));
  return session;
}

export async function requireSchoolPage(
  ...permissions: PermissionKey[]
): Promise<SessionUser & { schoolId: string }> {
  const session = permissions.length ? await requirePagePermission(...permissions) : await requirePageSession();
  if (!session.schoolId) redirect(landingPath(session));
  return session as SessionUser & { schoolId: string };
}

export function filterNav<T extends { permission?: PermissionKey }>(session: SessionUser, items: T[]) {
  return items.filter((i) => !i.permission || session.permissions.includes(i.permission));
}
