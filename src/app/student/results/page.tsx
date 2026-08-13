import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { studentContext } from '@/lib/student-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StudentResultsPage() {
  const session = await requireSchoolPage('portal.student');
  const { student } = await studentContext(session);
  if (!student) return <EmptyState title="Record unavailable" description="Please contact the school office." />;

  const results = await db.query.results.findMany({
    where: and(eq(t.results.studentId, student.id), eq(t.results.isPublished, true)),
    with: { exam: true },
    orderBy: desc(t.results.publishedAt),
  });

  const examIds = results.map((r) => r.examId);
  const marks = examIds.length
    ? await db.query.marks.findMany({
        where: and(eq(t.marks.studentId, student.id), inArray(t.marks.examId, examIds)),
        with: { examSubject: { with: { subject: true } } },
      })
    : [];

  return (
    <>
      <PageHeader title="My results" description="Only published results are shown." />
      {results.length === 0 ? (
        <div className="card">
          <EmptyState title="No results published" description="Your report cards will appear here once the school publishes them." />
        </div>
      ) : (
        <div className="space-y-5">
          {results.map((r) => (
            <Card key={r.id}>
              <CardHeader
                title={r.exam.name}
                description={`Published ${formatDate(r.publishedAt)} · rank ${r.rank ?? '—'}`}
                action={
                  <span className="flex items-center gap-2">
                    <Badge tone={r.percentage >= 60 ? 'green' : r.percentage >= 35 ? 'amber' : 'red'}>{r.grade}</Badge>
                    <span className="text-lg font-semibold text-slate-900">{r.percentage}%</span>
                  </span>
                }
              />
              <Table>
                <THead>
                  <TR>
                    <TH>Subject</TH>
                    <TH>Marks</TH>
                    <TH>Out of</TH>
                    <TH>Grade</TH>
                  </TR>
                </THead>
                <TBody>
                  {marks
                    .filter((m) => m.examId === r.examId)
                    .map((m) => (
                      <TR key={m.id}>
                        <TD className="font-medium text-slate-900">{m.examSubject.subject.name}</TD>
                        <TD>{m.isAbsent ? 'Absent' : m.marksObtained}</TD>
                        <TD className="text-slate-500">{m.examSubject.maxMarks}</TD>
                        <TD>{m.grade ? <Badge tone="slate">{m.grade}</Badge> : '—'}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
              <CardBody className="border-t border-slate-100">
                <p className="text-sm text-slate-700">
                  Total {r.totalMarks} / {r.maxMarks}
                  {r.teacherRemark ? ` · ${r.teacherRemark}` : ''}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
