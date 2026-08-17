import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { forbidden } from '@/lib/errors';

const schema = z.object({
  notifyByPush: z.boolean().optional(),
  notifyBySms: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
});

/**
 * A guardian's own delivery preferences. Scoped to their own parent row —
 * the id is never taken from the request.
 *
 * Note these govern *optional* channels only. Safeguarding notices (absence,
 * emergency, transport) are sent regardless, which is why the school controls
 * those in school settings rather than the parent here.
 */
export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('portal.parent');
  if (!session.parentId) throw forbidden();
  const input = await parseBody(req, schema);

  const [row] = await db
    .update(t.parents)
    .set(input)
    .where(eq(t.parents.id, session.parentId))
    .returning({
      notifyByPush: t.parents.notifyByPush,
      notifyBySms: t.parents.notifyBySms,
      notifyByEmail: t.parents.notifyByEmail,
    });
  return ok(row);
});
