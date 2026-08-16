import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { homeworkReviewSchema } from '@/lib/validation/schemas';
import { reviewHomework } from '@/lib/services/homework';
import { recordAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** Teacher acknowledges — or sends back — one or more students on a homework item. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const session = await requireSchoolContext('homework.manage');
  const { id } = await ctx.params;
  const { entries } = await parseBody(req, homeworkReviewSchema);

  const saved = await reviewHomework(session, id, entries);
  await recordAudit({
    session,
    action: 'homework.reviewed',
    entity: 'Homework',
    entityId: id,
    after: { count: saved.length, statuses: [...new Set(saved.map((s) => s.reviewStatus))] },
  });
  return ok({ data: saved });
});
