import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { homeworkSubmitSchema } from '@/lib/validation/schemas';
import { markHomeworkDone, undoHomeworkDone } from '@/lib/services/homework';
import { recordAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** Student marks their own homework as done. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const session = await requireSchoolContext('portal.student');
  const { id } = await ctx.params;
  const input = await parseBody(req, homeworkSubmitSchema);

  const row = await markHomeworkDone(session, id, { note: input.note, link: input.link || undefined });
  await recordAudit({
    session,
    action: 'homework.marked_done',
    entity: 'HomeworkSubmission',
    entityId: row.id,
    after: { homeworkId: id, status: row.status },
  });
  return created(row);
});

/** Student undoes the tick, while the teacher has not reviewed it yet. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const session = await requireSchoolContext('portal.student');
  const { id } = await ctx.params;
  await undoHomeworkDone(session, id);
  await recordAudit({ session, action: 'homework.undone', entity: 'Homework', entityId: id });
  return ok({ ok: true });
});
