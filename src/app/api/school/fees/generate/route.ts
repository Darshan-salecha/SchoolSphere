import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { feeGenerateSchema } from '@/lib/validation/schemas';
import { generateFees } from '@/lib/services/fees';
import { recordAudit } from '@/lib/audit';

/** Raises an instalment across a year group. Safe to re-run — duplicates are skipped. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.manage');
  const input = await parseBody(req, feeGenerateSchema);

  const result = await generateFees({
    schoolId: session.schoolId,
    academicYearId: input.academicYearId,
    feeStructureId: input.feeStructureId,
    classId: input.classId || null,
    title: input.title,
    dueDate: input.dueDate.toISOString().slice(0, 10),
  });

  await recordAudit({ session, action: 'fees.generated', entity: 'StudentFee', after: { title: input.title, ...result } });
  return ok(result);
});
