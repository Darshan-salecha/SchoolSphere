import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections, listSubjects } from '@/lib/school-data';
import { accessibleSectionIds } from '@/lib/scope';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { ResultActions } from './result-actions';

export const dynamic = 'force-dynamic';

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolPage('exams.view');
  const { id } = await params;

  const exam = await db.query.exams.findFirst({
    where: and(eq(t.exams.id, id), eq(t.exams.schoolId, session.schoolId)),
    with: { academicYear: true },
  });
  if (!exam) notFound();

  const papers = await db.query.examSubjects.findMany({
    where: and(eq(t.examSubjects.examId, id), eq(t.examSubjects.schoolId, session.schoolId)),
    with: { section: { with: { class: true } }, subject: true, marks: { columns: { id: true } } },
  });

  const allowed = await accessibleSectionIds(session);
  const visiblePapers = allowed === null ? papers : papers.filter((p) => allowed.includes(p.sectionId));

  const [sections, subjects] = await Promise.all([listSections(session.schoolId), listSubjects(session.schoolId)]);
  const [{ value: resultCount }] = await db
    .select({ value: count() })
    .from(t.results)
    .where(eq(t.results.examId, id));

  const canManage = session.permissions.includes('exams.manage');
  const canPublish = session.permissions.includes('results.publish');

  return (
    <>
      <Link href="/school/exams" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All exams
      </Link>

      <PageHeader
        title={exam.name}
        description={`${exam.academicYear.name} · ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)} · weightage ${exam.weightage}%`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={exam.status} />
            {canManage && (
              <QuickForm
                title="Add a paper"
                description="One paper per section and subject."
                endpoint="/api/school/exams"
                method="PUT"
                triggerLabel="Add paper"
                variant="outline"
                successMessage="Paper saved"
                fields={[
                  { name: 'examId', label: 'Exam', type: 'select', required: true, defaultValue: exam.id, options: [{ value: exam.id, label: exam.name }], colSpan: 2 },
                  { name: 'sectionId', label: 'Class', type: 'select', required: true, options: sections.map((s) => ({ value: s.id, label: s.label })) },
                  { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
                  { name: 'examDate', label: 'Paper date', type: 'date' },
                  { name: 'startTime', label: 'Start time', placeholder: '09:00' },
                  { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, defaultValue: 100, min: 1, max: 500 },
                  { name: 'passingMarks', label: 'Passing marks', type: 'number', required: true, defaultValue: 35, min: 0, max: 500 },
                ]}
              />
            )}
            {canPublish && <ResultActions examId={exam.id} status={exam.status} resultCount={resultCount} />}
          </div>
        }
      />

      {visiblePapers.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No papers scheduled"
            description={canManage ? 'Add a paper for each class and subject sitting this exam.' : 'No papers are scheduled for your classes.'}
          />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Class</TH>
              <TH>Subject</TH>
              <TH>Date</TH>
              <TH>Max marks</TH>
              <TH>Pass mark</TH>
              <TH>Marks entered</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {visiblePapers.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium text-slate-900">{p.section.class.name}-{p.section.name}</TD>
                <TD><Badge tone="slate">{p.subject.name}</Badge></TD>
                <TD className="whitespace-nowrap">{p.examDate ? formatDate(p.examDate) : '—'}{p.startTime ? ` · ${p.startTime}` : ''}</TD>
                <TD>{p.maxMarks}</TD>
                <TD>{p.passingMarks}</TD>
                <TD>{p.marks.length}</TD>
                <TD className="text-right">
                  <Link
                    href={`/school/exams/${exam.id}/marks/${p.id}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {p.marks.length ? 'Review marks' : 'Enter marks'}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
