import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';

/** A user's own notifications. Scoped to the signed-in user, never a parameter. */
export const GET = handler(async () => {
  const session = await requireSchoolContext();
  const rows = await db
    .select()
    .from(t.notifications)
    .where(and(eq(t.notifications.schoolId, session.schoolId), eq(t.notifications.userId, session.id)))
    .orderBy(desc(t.notifications.createdAt))
    .limit(100);
  return ok({ data: rows, unread: rows.filter((r) => !r.readAt).length });
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext();
  const { id } = await parseBody(req, z.object({ id: z.string().optional() }));

  // No id means "mark everything read".
  await db
    .update(t.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(t.notifications.schoolId, session.schoolId),
        eq(t.notifications.userId, session.id),
        isNull(t.notifications.readAt),
        id ? eq(t.notifications.id, id) : undefined,
      ),
    );
  return ok({ ok: true });
});
