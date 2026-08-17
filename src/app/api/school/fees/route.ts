import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { feeCategorySchema } from '@/lib/validation/schemas';
import { visibleStudentIds } from '@/lib/scope';
import { feeTotals, refreshOverdue } from '@/lib/services/fees';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.view');
  const { status } = parseQuery(req, z.object({ status: z.string().optional() }));
  await refreshOverdue(session.schoolId);

  // Teachers and parents only ever see fees for students they may already view.
  const allowed = await visibleStudentIds(session);
  const rows = await db.query.studentFees.findMany({
    where: and(
      eq(t.studentFees.schoolId, session.schoolId),
      allowed ? inArray(t.studentFees.studentId, allowed.length ? allowed : ['—']) : undefined,
      status ? eq(t.studentFees.status, status as 'PENDING') : undefined,
    ),
    with: { student: { columns: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
    orderBy: desc(t.studentFees.dueDate),
    limit: 500,
  });

  return ok({ data: rows, totals: await feeTotals(session.schoolId) });
});

/** Fee categories — tuition, transport, exam and so on. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.manage');
  const input = await parseBody(req, feeCategorySchema);
  const [row] = await db
    .insert(t.feeCategories)
    .values({ schoolId: session.schoolId, name: input.name, code: input.code.toUpperCase(), isRecurring: input.isRecurring })
    .returning();
  await recordAudit({ session, action: 'fee_category.created', entity: 'FeeCategory', entityId: row.id, after: row });
  return created(row);
});
