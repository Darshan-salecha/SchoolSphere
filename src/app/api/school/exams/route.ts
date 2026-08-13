import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { examSchema, examSubjectSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('exams.manage');
  const input = await parseBody(req, examSchema);
  assertSameSchool(
    await db.query.academicYears.findFirst({ where: eq(t.academicYears.id, input.academicYearId) }),
    session.schoolId,
  );

  const [row] = await db
    .insert(t.exams)
    .values({
      schoolId: session.schoolId,
      academicYearId: input.academicYearId,
      name: input.name,
      type: input.type,
      startDate: input.startDate.toISOString().slice(0, 10),
      endDate: input.endDate.toISOString().slice(0, 10),
      weightage: input.weightage,
      status: 'SCHEDULED',
    })
    .returning();

  await recordAudit({ session, action: 'exam.created', entity: 'Exam', entityId: row.id, after: row });
  return created(row);
});

/** Adds a paper (section + subject) to an exam. */
export const PUT = handler(async (req: Request) => {
  const session = await requireSchoolContext('exams.manage');
  const input = await parseBody(req, examSubjectSchema.extend({ examId: z.string() }));

  assertSameSchool(await db.query.exams.findFirst({ where: eq(t.exams.id, input.examId) }), session.schoolId);
  assertSameSchool(await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId) }), session.schoolId);
  assertSameSchool(await db.query.subjects.findFirst({ where: eq(t.subjects.id, input.subjectId) }), session.schoolId);

  const [row] = await db
    .insert(t.examSubjects)
    .values({
      schoolId: session.schoolId,
      examId: input.examId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      examDate: input.examDate ? input.examDate.toISOString().slice(0, 10) : null,
      startTime: input.startTime || null,
      maxMarks: input.maxMarks,
      passingMarks: input.passingMarks,
    })
    .onConflictDoUpdate({
      target: [t.examSubjects.examId, t.examSubjects.sectionId, t.examSubjects.subjectId],
      set: {
        examDate: input.examDate ? input.examDate.toISOString().slice(0, 10) : null,
        startTime: input.startTime || null,
        maxMarks: input.maxMarks,
        passingMarks: input.passingMarks,
      },
    })
    .returning();

  await recordAudit({ session, action: 'exam.paper_saved', entity: 'ExamSubject', entityId: row.id, after: row });
  return ok(row);
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('exams.manage');
  const { id, status } = await parseBody(
    req,
    z.object({ id: z.string(), status: z.enum(['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED']) }),
  );
  const before = assertSameSchool(await db.query.exams.findFirst({ where: eq(t.exams.id, id) }), session.schoolId);
  const [after] = await db
    .update(t.exams)
    .set({ status })
    .where(and(eq(t.exams.id, id), eq(t.exams.schoolId, session.schoolId)))
    .returning();
  await recordAudit({ session, action: 'exam.status_changed', entity: 'Exam', entityId: id, before: { status: before.status }, after: { status: after.status } });
  return ok(after);
});
