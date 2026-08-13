import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { marksEntrySchema } from '@/lib/validation/schemas';
import { assertCanTeach } from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { gradeFor } from '@/lib/utils';
import { recordAudit } from '@/lib/audit';
import { badRequest, forbidden } from '@/lib/errors';

/**
 * Marks entry. Refuses out-of-range scores, refuses papers the teacher does not
 * own, and refuses edits once results have been published.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('exams.marks.enter');
  const input = await parseBody(req, marksEntrySchema);

  const paper = assertSameSchool(
    await db.query.examSubjects.findFirst({
      where: eq(t.examSubjects.id, input.examSubjectId),
      with: { exam: true },
    }),
    session.schoolId,
  );
  await assertCanTeach(session, paper.sectionId, paper.subjectId);

  if (paper.exam.status === 'RESULTS_PUBLISHED') {
    throw forbidden('Results for this exam are published. Ask an administrator to unpublish before editing marks.');
  }

  const enrolled = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .where(
      and(
        eq(t.enrollments.schoolId, session.schoolId),
        eq(t.enrollments.sectionId, paper.sectionId),
        eq(t.enrollments.isCurrent, true),
      ),
    );
  const allowed = new Set(enrolled.map((e) => e.studentId));

  const entries = input.entries.filter((e) => allowed.has(e.studentId));
  for (const e of entries) {
    if (!e.isAbsent && e.marksObtained != null && (e.marksObtained < 0 || e.marksObtained > paper.maxMarks)) {
      throw badRequest(`Marks must be between 0 and ${paper.maxMarks}.`);
    }
  }
  if (!entries.length) throw badRequest('No valid students to save marks for.');

  await db
    .insert(t.marks)
    .values(
      entries.map((e) => ({
        schoolId: session.schoolId,
        examId: paper.examId,
        examSubjectId: paper.id,
        studentId: e.studentId,
        marksObtained: e.isAbsent ? null : (e.marksObtained ?? null),
        isAbsent: e.isAbsent,
        grade: e.isAbsent || e.marksObtained == null ? null : gradeFor((e.marksObtained / paper.maxMarks) * 100),
        remarks: e.remarks || null,
        enteredById: session.teacherId,
      })),
    )
    .onConflictDoUpdate({
      target: [t.marks.examSubjectId, t.marks.studentId],
      set: {
        marksObtained: sql`excluded.marks_obtained`,
        isAbsent: sql`excluded.is_absent`,
        grade: sql`excluded.grade`,
        remarks: sql`excluded.remarks`,
        enteredById: sql`excluded.entered_by_id`,
        updatedAt: new Date(),
      },
    });

  await recordAudit({
    session,
    action: 'marks.entered',
    entity: 'ExamSubject',
    entityId: paper.id,
    after: { examId: paper.examId, count: entries.length },
  });
  return ok({ saved: entries.length });
});

export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('exams.view');
  const examSubjectId = new URL(req.url).searchParams.get('examSubjectId');
  if (!examSubjectId) throw badRequest('Paper is required.');

  const paper = assertSameSchool(
    await db.query.examSubjects.findFirst({ where: eq(t.examSubjects.id, examSubjectId) }),
    session.schoolId,
  );
  await assertCanTeach(session, paper.sectionId, paper.subjectId);

  const students = await db
    .select({
      studentId: t.students.id,
      firstName: t.students.firstName,
      lastName: t.students.lastName,
      rollNumber: t.enrollments.rollNumber,
    })
    .from(t.enrollments)
    .innerJoin(t.students, eq(t.students.id, t.enrollments.studentId))
    .where(and(eq(t.enrollments.sectionId, paper.sectionId), eq(t.enrollments.isCurrent, true)));

  const existing = students.length
    ? await db
        .select()
        .from(t.marks)
        .where(
          and(
            eq(t.marks.examSubjectId, paper.id),
            inArray(t.marks.studentId, students.map((s) => s.studentId)),
          ),
        )
    : [];

  return ok({ paper, students, marks: existing });
});
