import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { academicYearSchema } from '@/lib/validation/schemas';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async () => {
  const session = await requireSchoolContext('school.academicyears.manage', 'school.settings.view');
  const rows = await db
    .select()
    .from(t.academicYears)
    .where(eq(t.academicYears.schoolId, session.schoolId))
    .orderBy(asc(t.academicYears.startDate));
  return ok({ data: rows });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.academicyears.manage');
  const input = await parseBody(req, academicYearSchema);

  const row = await db.transaction(async (tx) => {
    if (input.isCurrent) {
      await tx
        .update(t.academicYears)
        .set({ isCurrent: false })
        .where(eq(t.academicYears.schoolId, session.schoolId));
    }
    const [created] = await tx
      .insert(t.academicYears)
      .values({
        schoolId: session.schoolId,
        name: input.name,
        startDate: input.startDate.toISOString().slice(0, 10),
        endDate: input.endDate.toISOString().slice(0, 10),
        isCurrent: input.isCurrent,
      })
      .returning();
    return created;
  });

  await recordAudit({ session, action: 'academic_year.created', entity: 'AcademicYear', entityId: row.id, after: row });
  return created(row);
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('school.academicyears.manage');
  const { id, action } = (await req.json()) as { id: string; action: 'setCurrent' | 'archive' };

  const year = await db.query.academicYears.findFirst({
    where: and(eq(t.academicYears.id, id), eq(t.academicYears.schoolId, session.schoolId)),
  });
  if (!year) return ok({ ok: false });

  if (action === 'setCurrent') {
    await db.transaction(async (tx) => {
      await tx
        .update(t.academicYears)
        .set({ isCurrent: false })
        .where(and(eq(t.academicYears.schoolId, session.schoolId), ne(t.academicYears.id, id)));
      await tx.update(t.academicYears).set({ isCurrent: true, isArchived: false }).where(eq(t.academicYears.id, id));
    });
  } else {
    await db.update(t.academicYears).set({ isArchived: true, isCurrent: false }).where(eq(t.academicYears.id, id));
  }

  await recordAudit({ session, action: `academic_year.${action}`, entity: 'AcademicYear', entityId: id });
  return ok({ ok: true });
});
