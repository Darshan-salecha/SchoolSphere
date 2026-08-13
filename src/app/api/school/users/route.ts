import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { ALL_PERMISSIONS } from '@/lib/rbac/permissions';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';
import { badRequest, forbidden } from '@/lib/errors';

const bodySchema = z.object({
  userId: z.string(),
  permissionKey: z.string(),
  granted: z.boolean().nullable(),
});

/**
 * Per-user permission overrides on top of role defaults.
 * `granted: null` removes the override and restores the role default.
 */
export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.users.manage');
  const { userId, permissionKey, granted } = await parseBody(req, bodySchema);

  if (!(ALL_PERMISSIONS as readonly string[]).includes(permissionKey)) throw badRequest('Unknown permission.');
  if (permissionKey.startsWith('platform.')) throw forbidden('Platform permissions cannot be granted from a school.');
  if (userId === session.id) throw forbidden('You cannot change your own permissions.');

  const user = assertSameSchool(await db.query.users.findFirst({ where: eq(t.users.id, userId) }), session.schoolId);

  if (granted === null) {
    await db
      .delete(t.userPermissions)
      .where(and(eq(t.userPermissions.userId, user.id), eq(t.userPermissions.permissionKey, permissionKey)));
  } else {
    await db
      .insert(t.userPermissions)
      .values({ userId: user.id, permissionKey, granted })
      .onConflictDoUpdate({
        target: [t.userPermissions.userId, t.userPermissions.permissionKey],
        set: { granted },
      });
  }

  await recordAudit({
    session,
    action: 'user.permission_changed',
    entity: 'User',
    entityId: user.id,
    after: { permissionKey, granted },
  });
  return ok({ ok: true });
});

/** Suspending a school user revokes their live sessions immediately. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.users.manage');
  const { userId, status } = await parseBody(req, z.object({ userId: z.string(), status: z.enum(['ACTIVE', 'SUSPENDED']) }));
  if (userId === session.id) throw forbidden('You cannot change your own account status.');

  const user = assertSameSchool(await db.query.users.findFirst({ where: eq(t.users.id, userId) }), session.schoolId);
  await db.update(t.users).set({ status }).where(eq(t.users.id, user.id));
  if (status === 'SUSPENDED') {
    await db.update(t.authSessions).set({ revokedAt: new Date() }).where(eq(t.authSessions.userId, user.id));
  }

  await recordAudit({ session, action: `user.${status.toLowerCase()}`, entity: 'User', entityId: user.id, before: { status: user.status }, after: { status } });
  return ok({ ok: true });
});
