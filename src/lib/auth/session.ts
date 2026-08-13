import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { signToken, verifyToken } from './jwt';
import { ROLE_DEFINITIONS, type RoleKeyString } from '@/lib/rbac/roles';
import type { PermissionKey } from '@/lib/rbac/permissions';
import { forbidden, unauthorized } from '@/lib/errors';

export const SESSION_COOKIE = 'ss_session';
const SESSION_DAYS = 7;

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  schoolStatus: string | null;
  roles: RoleKeyString[];
  permissions: PermissionKey[];
  isPlatform: boolean;
  teacherId: string | null;
  parentId: string | null;
  studentId: string | null;
  driverId: string | null;
};

function computePermissions(roles: RoleKeyString[], overrides: { permissionKey: string; granted: boolean }[]) {
  const set = new Set<string>();
  for (const r of roles) for (const p of ROLE_DEFINITIONS[r]?.permissions ?? []) set.add(p);
  for (const o of overrides) (o.granted ? set.add(o.permissionKey) : set.delete(o.permissionKey));
  return [...set] as PermissionKey[];
}

/** Builds the session object for a user id — shared by cookie reads and tests. */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await db.query.users.findFirst({
    where: and(eq(t.users.id, userId), isNull(t.users.deletedAt)),
    with: {
      roles: true,
      extraPermissions: true,
      school: { columns: { id: true, name: true, code: true, status: true } },
      teacher: { columns: { id: true } },
      parent: { columns: { id: true } },
      driver: { columns: { id: true } },
    },
  });
  if (!user || user.status === 'SUSPENDED') return null;

  const roles = user.roles.map((r) => r.role) as RoleKeyString[];
  const isPlatform = roles.some((r) => ROLE_DEFINITIONS[r]?.isPlatform);

  // A suspended or cancelled tenant locks out every school-scoped user immediately.
  if (!isPlatform && user.school && user.school.status !== 'ACTIVE') return null;

  const student = user.schoolId
    ? await db.query.students.findFirst({ where: eq(t.students.userId, user.id), columns: { id: true } })
    : undefined;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
    schoolCode: user.school?.code ?? null,
    schoolStatus: user.school?.status ?? null,
    roles,
    permissions: computePermissions(roles, user.extraPermissions),
    isPlatform,
    teacherId: user.teacher?.id ?? null,
    parentId: user.parent?.id ?? null,
    studentId: student?.id ?? null,
    driverId: user.driver?.id ?? null,
  };
}

/** Reads and validates the session for the current request. Cached per render pass. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const authSession = await db.query.authSessions.findFirst({ where: eq(t.authSessions.tokenId, payload.sid) });
  if (!authSession || authSession.revokedAt || authSession.expiresAt < new Date()) return null;

  return loadSessionUser(payload.sub);
});

export async function createSession(userId: string, schoolId: string | null) {
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const tokenId = crypto.randomUUID();

  await db.insert(t.authSessions).values({
    userId,
    tokenId,
    expiresAt,
    userAgent: h.get('user-agent')?.slice(0, 250) ?? null,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  const token = await signToken({ sub: userId, sid: tokenId, sc: schoolId }, expiresAt);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  await db.update(t.users).set({ lastLoginAt: new Date() }).where(eq(t.users.id, userId));
  if (schoolId) await db.update(t.schools).set({ lastActiveAt: new Date() }).where(eq(t.schools.id, schoolId));
  return tokenId;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      await db
        .update(t.authSessions)
        .set({ revokedAt: new Date() })
        .where(eq(t.authSessions.tokenId, payload.sid))
        .catch(() => undefined);
    }
  }
  jar.delete(SESSION_COOKIE);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session;
}

export const can = (session: SessionUser, permission: PermissionKey) => session.permissions.includes(permission);

export async function requirePermission(...permissions: PermissionKey[]): Promise<SessionUser> {
  const session = await requireSession();
  if (!permissions.some((p) => session.permissions.includes(p))) throw forbidden();
  return session;
}

/** Every school-scoped entry point goes through this. Returns a guaranteed schoolId. */
export async function requireSchoolContext(
  ...permissions: PermissionKey[]
): Promise<SessionUser & { schoolId: string }> {
  const session = permissions.length ? await requirePermission(...permissions) : await requireSession();
  if (!session.schoolId) throw forbidden('This action must be performed from within a school.');
  return session as SessionUser & { schoolId: string };
}
