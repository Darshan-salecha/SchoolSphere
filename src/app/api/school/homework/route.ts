import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { homeworkSchema } from '@/lib/validation/schemas';
import { assertCanTeach } from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { recordAudit } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('homework.manage');
  const input = await parseBody(req, homeworkSchema);

  const section = assertSameSchool(
    await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId), with: { class: true } }),
    session.schoolId,
  );
  assertSameSchool(await db.query.subjects.findFirst({ where: eq(t.subjects.id, input.subjectId) }), session.schoolId);
  await assertCanTeach(session, input.sectionId, input.subjectId);

  // Admins can post on behalf of the section's class teacher.
  const teacherId = session.teacherId ?? section.classTeacherId;
  if (!teacherId) throw badRequest('Assign a class teacher to this section first.');

  const [row] = await db
    .insert(t.homework)
    .values({
      schoolId: session.schoolId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      teacherId,
      title: input.title,
      description: input.description,
      assignedOn: new Date().toISOString().slice(0, 10),
      dueDate: input.dueDate.toISOString().slice(0, 10),
      allowSubmission: input.allowSubmission,
    })
    .returning();

  const students = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .where(eq(t.enrollments.sectionId, input.sectionId));
  const userIds = await guardianUserIds(session.schoolId, students.map((s) => s.studentId));
  await notify({
    schoolId: session.schoolId,
    userIds,
    type: 'HOMEWORK',
    title: `New homework for ${section.class.name}-${section.name}`,
    body: `${input.title} — due ${input.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.`,
    link: '/parent/homework',
  });

  await recordAudit({ session, action: 'homework.created', entity: 'Homework', entityId: row.id, after: { title: row.title, sectionId: row.sectionId } });
  return created(row);
});
