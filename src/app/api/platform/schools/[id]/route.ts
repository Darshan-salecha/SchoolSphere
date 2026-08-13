import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { schoolUpdateSchema } from '@/lib/validation/schemas';
import { notFound } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requirePermission('platform.schools.view');
  const { id } = await ctx.params;
  const school = await db.query.schools.findFirst({
    where: eq(t.schools.id, id),
    with: { subscription: { with: { plan: true } }, settings: true },
  });
  if (!school) throw notFound('School not found');
  return ok(school);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const session = await requirePermission('platform.schools.manage');
  const { id } = await ctx.params;
  const before = await db.query.schools.findFirst({ where: eq(t.schools.id, id) });
  if (!before) throw notFound('School not found');

  const input = await parseBody(req, schoolUpdateSchema);
  const [after] = await db.update(t.schools).set(input).where(eq(t.schools.id, id)).returning();
  await recordAudit({ session, schoolId: id, action: 'school.updated', entity: 'School', entityId: id, before, after });
  return ok(after);
});
