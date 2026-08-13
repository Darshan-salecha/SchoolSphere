import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { studentUpdateSchema } from '@/lib/validation/schemas';
import { assertCanViewStudent, hasSchoolWideAccess } from '@/lib/scope';
import { studentProfile } from '@/lib/services/students';
import { recordAudit } from '@/lib/audit';
import { forbidden, notFound } from '@/lib/errors';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const session = await requireSchoolContext('students.view');
  const { id } = await ctx.params;
  await assertCanViewStudent(session, id);
  const profile = await studentProfile(session.schoolId, id);
  if (!profile) throw notFound('Student not found');
  return ok(profile);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const session = await requireSchoolContext('students.edit');
  const { id } = await ctx.params;
  const before = await assertCanViewStudent(session, id);
  const input = await parseBody(req, studentUpdateSchema);

  const { sectionId, rollNumber, dateOfBirth, admissionDate, ...rest } = input;
  const [after] = await db
    .update(t.students)
    .set({
      ...rest,
      dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : undefined,
      admissionDate: admissionDate ? admissionDate.toISOString().slice(0, 10) : undefined,
    })
    .where(and(eq(t.students.id, id), eq(t.students.schoolId, session.schoolId)))
    .returning();

  // Moving a student between sections is a school-wide action.
  if (sectionId && sectionId !== before.enrollments[0]?.sectionId) {
    if (!hasSchoolWideAccess(session)) throw forbidden('Only school administrators can transfer a student.');
    await db
      .update(t.enrollments)
      .set({ sectionId, rollNumber: rollNumber ?? null })
      .where(and(eq(t.enrollments.studentId, id), eq(t.enrollments.isCurrent, true)));
    await recordAudit({ session, action: 'student.transferred', entity: 'Student', entityId: id, before: { sectionId: before.enrollments[0]?.sectionId }, after: { sectionId } });
  }

  await recordAudit({ session, action: 'student.updated', entity: 'Student', entityId: id, before, after });
  return ok(after);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const session = await requireSchoolContext('students.delete');
  const { id } = await ctx.params;
  const before = await assertCanViewStudent(session, id);

  // Soft delete — academic and financial history must survive.
  await db
    .update(t.students)
    .set({ deletedAt: new Date(), status: 'WITHDRAWN' })
    .where(and(eq(t.students.id, id), eq(t.students.schoolId, session.schoolId)));
  await db.update(t.enrollments).set({ isCurrent: false, exitedAt: new Date(), exitReason: 'Withdrawn' }).where(eq(t.enrollments.studentId, id));

  await recordAudit({ session, action: 'student.withdrawn', entity: 'Student', entityId: id, before });
  return ok({ ok: true });
});
