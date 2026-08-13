import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { accessibleSectionIds } from '@/lib/scope';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { BarsChart } from '@/components/charts/simple-charts';
import { percent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ examId?: string }> }) {
  const session = await requireSchoolPage('results.view');
  const params = await searchParams;

  const exams = await db.query.exams.findMany({
    where: eq(t.exams.schoolId, session.schoolId),
    orderBy: desc(t.exams.startDate),
  });
  const exam = exams.find((e) => e.id === params.examId) ?? exams.find((e) => e.status === 'RESULTS_PUBLISHED') ?? exams[0];

  const allowed = await accessibleSectionIds(session);
  const results = exam
    ? await db.query.results.findMany({
        where: and(
          eq(t.results.examId, exam.id),
          eq(t.results.schoolId, session.schoolId),
          allowed === null ? undefined : allowed.length ? inArray(t.results.sectionId, allowed) : eq(t.results.id, '—'),
        ),
        with: { student: true, section: { with: { class: true } } },
      })
    : [];

  const bySection = new Map<string, { label: string; total: number; sum: number; pass: number }>();
  for (const r of results) {
    const key = `${r.section.class.name}-${r.section.name}`;
    const agg = bySection.get(key) ?? { label: key, total: 0, sum: 0, pass: 0 };
    agg.total += 1;
    agg.sum += r.percentage;
    if (r.percentage >= 35) agg.pass += 1;
    bySection.set(key, agg);
  }
  const chartData = [...bySection.values()].map((a) => ({ section: a.label, average: Math.round((a.sum / a.total) * 10) / 10 }));
  const toppers = [...results].sort((a, b) => b.percentage - a.percentage).slice(0, 10);
  const attention = [...results].filter((r) => r.percentage < 45).sort((a, b) => a.percentage - b.percentage).slice(0, 10);

  if (!exams.length) {
    return (
      <>
        <PageHeader title="Results" />
        <div className="card">
          <EmptyState title="No exams yet" description="Create an exam and enter marks to see results and analytics." />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Results"
        description="Class performance, toppers and students who need attention."
        action={exam ? <StatusBadge status={exam.status} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {exams.map((e) => (
          <Link
            key={e.id}
            href={`/school/results?examId=${e.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${e.id === exam?.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {e.name}
          </Link>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No results computed for this exam"
            description="Enter marks for each paper, then use “Compute results” on the exam page."
          />
        </div>
      ) : (
        <>
          <Card className="mb-5">
            <CardHeader title="Class averages" description={`${results.length} students across ${bySection.size} section${bySection.size === 1 ? '' : 's'}`} />
            <CardBody>
              <BarsChart data={chartData} xKey="section" yKey="average" label="Average %" />
            </CardBody>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top performers" />
              <Table>
                <THead>
                  <TR>
                    <TH>Rank</TH>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    <TH>Percentage</TH>
                    <TH>Grade</TH>
                  </TR>
                </THead>
                <TBody>
                  {toppers.map((r, i) => (
                    <TR key={r.id}>
                      <TD className="text-slate-400">{i + 1}</TD>
                      <TD>
                        <Link href={`/school/students/${r.studentId}`} className="font-medium text-slate-900 hover:text-brand-600">
                          {r.student.firstName} {r.student.lastName}
                        </Link>
                      </TD>
                      <TD>{r.section.class.name}-{r.section.name}</TD>
                      <TD>{r.percentage}%</TD>
                      <TD><Badge tone="green">{r.grade}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            <Card>
              <CardHeader title="Needs attention" description="Below 45%" />
              {attention.length === 0 ? (
                <CardBody><p className="text-sm text-slate-500">Every student is above 45% in this exam.</p></CardBody>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Student</TH>
                      <TH>Class</TH>
                      <TH>Percentage</TH>
                      <TH>Grade</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {attention.map((r) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/school/students/${r.studentId}`} className="font-medium text-slate-900 hover:text-brand-600">
                            {r.student.firstName} {r.student.lastName}
                          </Link>
                        </TD>
                        <TD>{r.section.class.name}-{r.section.name}</TD>
                        <TD>{r.percentage}%</TD>
                        <TD><Badge tone={r.percentage >= 35 ? 'amber' : 'red'}>{r.grade}</Badge></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          </div>

          <Card className="mt-5">
            <CardHeader title="Section summary" />
            <Table>
              <THead>
                <TR>
                  <TH>Section</TH>
                  <TH>Students</TH>
                  <TH>Average</TH>
                  <TH>Pass rate</TH>
                </TR>
              </THead>
              <TBody>
                {[...bySection.values()].map((a) => (
                  <TR key={a.label}>
                    <TD className="font-medium text-slate-900">{a.label}</TD>
                    <TD>{a.total}</TD>
                    <TD>{Math.round((a.sum / a.total) * 10) / 10}%</TD>
                    <TD>{percent(a.pass, a.total)}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
