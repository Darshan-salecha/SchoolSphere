import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { reminderSchema } from '@/lib/validation/schemas';
import { refreshOverdue, sendReminders } from '@/lib/services/fees';
import { recordAudit } from '@/lib/audit';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.manage');
  const { stage } = await parseBody(req, reminderSchema);

  await refreshOverdue(session.schoolId);
  const result = await sendReminders({ schoolId: session.schoolId, stage });

  await recordAudit({ session, action: 'fee_reminders.sent', entity: 'StudentFee', after: { stage, ...result } });
  return ok(result);
});
