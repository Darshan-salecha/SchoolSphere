import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { schoolStatusSchema } from '@/lib/validation/schemas';
import { notFound } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** Tenant lifecycle. Suspending a school locks out every one of its users on their next request. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const session = await requirePermission('platform.schools.manage');
  const { id } = await ctx.params;
  const { status, reason } = await parseBody(req, schoolStatusSchema);

  const before = await db.query.schools.findFirst({ where: eq(t.schools.id, id) });
  if (!before) throw notFound('School not found');

  const [after] = await db.update(t.schools).set({ status }).where(eq(t.schools.id, id)).returning();

  const subStatus = status === 'SUSPENDED' ? 'SUSPENDED' : status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE';
  await db.update(t.subscriptions).set({ status: subStatus }).where(eq(t.subscriptions.schoolId, id));

  // Revoke live sessions so a suspension takes effect immediately.
  if (status !== 'ACTIVE') {
    const userIds = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.schoolId, id));
    for (const u of userIds) {
      await db.update(t.authSessions).set({ revokedAt: new Date() }).where(eq(t.authSessions.userId, u.id));
    }
  }

  await recordAudit({
    session,
    schoolId: id,
    action: `school.${status.toLowerCase()}`,
    entity: 'School',
    entityId: id,
    before: { status: before.status },
    after: { status: after.status, reason },
  });
  return ok(after);
});
