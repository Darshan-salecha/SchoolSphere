import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { assertCanTeach } from '@/lib/scope';
import { PageHeader } from '@/components/ui/page';
import { MarksEntry } from './marks-entry';

export const dynamic = 'force-dynamic';

export default async function MarksPage({ params }: { params: Promise<{ id: string; paperId: string }> }) {
  const session = await requireSchoolPage('exams.marks.enter', 'exams.view');
  const { id, paperId } = await params;

  const paper = await db.query.examSubjects.findFirst({
    where: and(eq(t.examSubjects.id, paperId), eq(t.examSubjects.schoolId, session.schoolId)),
    with: { exam: true, subject: true, section: { with: { class: true } } },
  });
  if (!paper || paper.examId !== id) notFound();

  // Throws (and the error boundary catches) if this teacher doesn't own the paper.
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
    .where(
      and(
        eq(t.enrollments.sectionId, paper.sectionId),
        eq(t.enrollments.isCurrent, true),
        eq(t.students.status, 'ACTIVE'),
      ),
    );

  const existing = students.length
    ? await db
        .select()
        .from(t.marks)
        .where(and(eq(t.marks.examSubjectId, paper.id), inArray(t.marks.studentId, students.map((s) => s.studentId))))
    : [];

  return (
    <>
      <Link href={`/school/exams/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to {paper.exam.name}
      </Link>

      <PageHeader
        title={`${paper.subject.name} — ${paper.section.class.name}-${paper.section.name}`}
        description={`${paper.exam.name} · out of ${paper.maxMarks} · pass mark ${paper.passingMarks}`}
      />

      <MarksEntry
        paperId={paper.id}
        maxMarks={paper.maxMarks}
        passingMarks={paper.passingMarks}
        locked={paper.exam.status === 'RESULTS_PUBLISHED'}
        canEnter={session.permissions.includes('exams.marks.enter')}
        students={students.sort((a, b) => (a.rollNumber ?? 999) - (b.rollNumber ?? 999))}
        existing={existing.map((m) => ({ studentId: m.studentId, marksObtained: m.marksObtained, isAbsent: m.isAbsent }))}
      />
    </>
  );
}
