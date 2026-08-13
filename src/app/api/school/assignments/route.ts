import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { assignmentSchema } from '@/lib/validation/schemas';
import { assertCanTeach } from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('assignments.manage');
  const input = await parseBody(req, assignmentSchema);

  const section = assertSameSchool(
    await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId) }),
    session.schoolId,
  );
  assertSameSchool(await db.query.subjects.findFirst({ where: eq(t.subjects.id, input.subjectId) }), session.schoolId);
  await assertCanTeach(session, input.sectionId, input.subjectId);

  const teacherId = session.teacherId ?? section.classTeacherId;
  if (!teacherId) throw badRequest('Assign a class teacher to this section first.');

  const [row] = await db
    .insert(t.assignments)
    .values({
      schoolId: session.schoolId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      teacherId,
      title: input.title,
      description: input.description,
      maxMarks: input.maxMarks,
      dueDate: input.dueDate.toISOString().slice(0, 10),
      allowLate: input.allowLate,
    })
    .returning();

  await recordAudit({ session, action: 'assignment.created', entity: 'Assignment', entityId: row.id, after: { title: row.title } });
  return created(row);
});
