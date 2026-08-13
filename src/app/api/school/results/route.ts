import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { assertSameSchool } from '@/lib/tenant';
import { gradeFor } from '@/lib/utils';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { recordAudit } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

const bodySchema = z.object({ examId: z.string(), publish: z.boolean().default(false) });

/**
 * Computes each student's total, percentage, grade and section rank from the
 * entered marks, then optionally publishes and notifies guardians.
 * Publishing is separate from computing so a principal can review first.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('results.publish');
  const { examId, publish } = await parseBody(req, bodySchema);

  const exam = assertSameSchool(await db.query.exams.findFirst({ where: eq(t.exams.id, examId) }), session.schoolId);

  const papers = await db
    .select()
    .from(t.examSubjects)
    .where(and(eq(t.examSubjects.examId, examId), eq(t.examSubjects.schoolId, session.schoolId)));
  if (!papers.length) throw badRequest('Add subjects to this exam before computing results.');

  const paperById = new Map(papers.map((p) => [p.id, p]));
  const allMarks = await db
    .select()
    .from(t.marks)
    .where(and(eq(t.marks.examId, examId), eq(t.marks.schoolId, session.schoolId)));
  if (!allMarks.length) throw badRequest('No marks have been entered for this exam yet.');

  const totals = new Map<string, { total: number; max: number; sectionId: string }>();
  for (const m of allMarks) {
    const paper = paperById.get(m.examSubjectId);
    if (!paper) continue;
    const agg = totals.get(m.studentId) ?? { total: 0, max: 0, sectionId: paper.sectionId };
    agg.total += m.marksObtained ?? 0;
    agg.max += paper.maxMarks;
    totals.set(m.studentId, agg);
  }

  const bySection = new Map<string, { studentId: string; total: number; max: number; pct: number }[]>();
  for (const [studentId, agg] of totals) {
    const pct = agg.max ? (agg.total / agg.max) * 100 : 0;
    const list = bySection.get(agg.sectionId) ?? [];
    list.push({ studentId, total: agg.total, max: agg.max, pct });
    bySection.set(agg.sectionId, list);
  }

  const values: (typeof t.results.$inferInsert)[] = [];
  for (const [sectionId, list] of bySection) {
    list.sort((a, b) => b.pct - a.pct);
    list.forEach((row, i) => {
      values.push({
        schoolId: session.schoolId,
        examId,
        studentId: row.studentId,
        sectionId,
        totalMarks: row.total,
        maxMarks: row.max,
        percentage: Math.round(row.pct * 10) / 10,
        grade: gradeFor(row.pct),
        rank: i + 1,
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
      });
    });
  }

  // Recomputing replaces the whole set for this exam inside one transaction, so a
  // partially-recomputed ranking can never be visible to anyone.
  await db.transaction(async (tx) => {
    await tx.delete(t.results).where(and(eq(t.results.examId, examId), eq(t.results.schoolId, session.schoolId)));
    for (let i = 0; i < values.length; i += 500) {
      await tx.insert(t.results).values(values.slice(i, i + 500));
    }
  });

  if (publish) {
    await db.update(t.exams).set({ status: 'RESULTS_PUBLISHED' }).where(eq(t.exams.id, examId));
    const studentIds = values.map((v) => v.studentId);
    const userIds = await guardianUserIds(session.schoolId, studentIds);
    await notify({
      schoolId: session.schoolId,
      userIds,
      type: 'RESULT',
      title: `${exam.name} results are out`,
      body: `Results for ${exam.name} have been published. Open the parent portal to see the report card.`,
      link: '/parent/results',
      priority: 'HIGH',
      channels: ['IN_APP', 'SMS'],
    });
  }

  await recordAudit({
    session,
    action: publish ? 'results.published' : 'results.computed',
    entity: 'Exam',
    entityId: examId,
    after: { students: values.length, published: publish },
  });

  return ok({ computed: values.length, published: publish });
});

/** Unpublishing is audited and reopens marks entry. */
export const DELETE = handler(async (req: Request) => {
  const session = await requireSchoolContext('results.publish');
  const examId = new URL(req.url).searchParams.get('examId');
  if (!examId) throw badRequest('Exam is required.');
  assertSameSchool(await db.query.exams.findFirst({ where: eq(t.exams.id, examId) }), session.schoolId);

  await db
    .update(t.results)
    .set({ isPublished: false, publishedAt: null })
    .where(and(eq(t.results.examId, examId), eq(t.results.schoolId, session.schoolId)));
  await db.update(t.exams).set({ status: 'COMPLETED' }).where(eq(t.exams.id, examId));

  await recordAudit({ session, action: 'results.unpublished', entity: 'Exam', entityId: examId });
  return ok({ ok: true });
});
