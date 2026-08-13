import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { teacherAssignmentSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('teachers.manage');
  const input = await parseBody(req, teacherAssignmentSchema);

  assertSameSchool(await db.query.teachers.findFirst({ where: eq(t.teachers.id, input.teacherId) }), session.schoolId);
  const section = assertSameSchool(
    await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId) }),
    session.schoolId,
  );
  if (input.subjectId) {
    assertSameSchool(await db.query.subjects.findFirst({ where: eq(t.subjects.id, input.subjectId) }), session.schoolId);
  }

  const [row] = await db
    .insert(t.teacherAssignments)
    .values({
      schoolId: session.schoolId,
      teacherId: input.teacherId,
      sectionId: input.sectionId,
      subjectId: input.subjectId || null,
      isClassTeacher: input.isClassTeacher,
    })
    .onConflictDoNothing()
    .returning();

  if (input.isClassTeacher) {
    await db.update(t.sections).set({ classTeacherId: input.teacherId }).where(eq(t.sections.id, section.id));
  }

  await recordAudit({ session, action: 'teacher.assigned', entity: 'TeacherAssignment', entityId: row?.id ?? null, after: input });
  return created(row ?? { ok: true });
});

export const DELETE = handler(async (req: Request) => {
  const session = await requireSchoolContext('teachers.manage');
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw badRequest('Assignment is required.');

  const row = assertSameSchool(
    await db.query.teacherAssignments.findFirst({ where: eq(t.teacherAssignments.id, id) }),
    session.schoolId,
  );
  await db.delete(t.teacherAssignments).where(and(eq(t.teacherAssignments.id, id), eq(t.teacherAssignments.schoolId, session.schoolId)));
  if (row.isClassTeacher) {
    await db.update(t.sections).set({ classTeacherId: null }).where(eq(t.sections.id, row.sectionId));
  }

  await recordAudit({ session, action: 'teacher.unassigned', entity: 'TeacherAssignment', entityId: id, before: row });
  return ok({ ok: true });
});
