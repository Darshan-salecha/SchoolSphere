import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { concessionSchema } from '@/lib/validation/schemas';
import { assertCanViewStudent } from '@/lib/scope';
import { recordAudit } from '@/lib/audit';

/**
 * Scholarships, sibling and staff concessions. Recorded rather than applied as
 * a silent edit, so the reason and approver survive an audit.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.manage');
  const input = await parseBody(req, concessionSchema);
  await assertCanViewStudent(session, input.studentId);

  const [row] = await db
    .insert(t.feeConcessions)
    .values({
      schoolId: session.schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      type: input.type,
      percent: input.percent ?? null,
      amount: input.amount ? Math.round(input.amount * 100) : null,
      reason: input.reason || null,
      approvedById: session.id,
    })
    .returning();

  await recordAudit({ session, action: 'fee_concession.granted', entity: 'FeeConcession', entityId: row.id, after: row });
  return created(row);
});
