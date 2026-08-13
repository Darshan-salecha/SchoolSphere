import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ParentResultsPage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const section = currentSection(selected);

  // Only published results are ever readable from the parent portal.
  const results = await db.query.results.findMany({
    where: and(eq(t.results.studentId, selected.id), eq(t.results.isPublished, true)),
    with: { exam: true },
    orderBy: desc(t.results.publishedAt),
  });

  const examIds = results.map((r) => r.examId);
  const marks = examIds.length
    ? await db.query.marks.findMany({
        where: and(eq(t.marks.studentId, selected.id), inArray(t.marks.examId, examIds)),
        with: { examSubject: { with: { subject: true } } },
      })
    : [];

  return (
    <>
      <PageHeader title="Results" description={`Published report cards for ${selected.firstName}.`} />
      <ChildSwitcher
        selectedId={selected.id}
        children={children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          photoUrl: c.photoUrl,
          label: currentSection(c) ? `${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : 'Not enrolled',
        }))}
      />

      {results.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No results published yet"
            description="Report cards appear here as soon as the school publishes them, and you'll get a notification."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {results.map((r) => {
            const subjectMarks = marks.filter((m) => m.examId === r.examId);
            return (
              <Card key={r.id}>
                <CardHeader
                  title={r.exam.name}
                  description={`${session.schoolName} · ${section ? `${section.section.class.name}-${section.section.name}` : ''} · published ${formatDate(r.publishedAt)}`}
                  action={
                    <div className="flex items-center gap-2">
                      <Badge tone={r.percentage >= 60 ? 'green' : r.percentage >= 35 ? 'amber' : 'red'}>{r.grade}</Badge>
                      <span className="text-lg font-semibold text-slate-900">{r.percentage}%</span>
                    </div>
                  }
                />
                {subjectMarks.length > 0 && (
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
                      {subjectMarks.map((m) => (
                        <TR key={m.id}>
                          <TD className="font-medium text-slate-900">{m.examSubject.subject.name}</TD>
                          <TD>{m.isAbsent ? 'Absent' : m.marksObtained}</TD>
                          <TD className="text-slate-500">{m.examSubject.maxMarks}</TD>
                          <TD>{m.grade ? <Badge tone="slate">{m.grade}</Badge> : '—'}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                <CardBody className="grid gap-4 border-t border-slate-100 sm:grid-cols-4">
                  {[
                    ['Total', `${r.totalMarks} / ${r.maxMarks}`],
                    ['Percentage', `${r.percentage}%`],
                    ['Grade', r.grade ?? '—'],
                    ['Class rank', r.rank ?? '—'],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{label as string}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{value as string}</p>
                    </div>
                  ))}
                  {r.teacherRemark && (
                    <div className="sm:col-span-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Teacher&apos;s remark</p>
                      <p className="mt-1 text-sm text-slate-700">{r.teacherRemark}</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
