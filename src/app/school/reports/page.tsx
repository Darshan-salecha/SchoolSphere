import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { attendanceTrend } from '@/lib/services/attendance';
import { currentAcademicYear } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendChart, BarsChart } from '@/components/charts/simple-charts';
import { EmptyState } from '@/components/ui/states';
import { formatCurrency, percent } from '@/lib/utils';
import { GraduationCap, Wallet, ClipboardCheck } from 'lucide-react';
import { ExportButtons } from './export-buttons';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await requireSchoolPage('reports.view');
  const schoolId = session.schoolId;
  const year = await currentAcademicYear(schoolId);

  const [[students], trend] = await Promise.all([
    db.select({ value: count() }).from(t.students).where(and(eq(t.students.schoolId, schoolId), isNull(t.students.deletedAt))),
    attendanceTrend(schoolId, 20),
  ]);

  // Attendance per section
  const perSection = await db
    .select({
      className: t.classLevels.name,
      sectionName: t.sections.name,
      total: count(),
      present: sql<number>`sum(case when ${t.studentAttendance.status} in ('PRESENT','LATE','HALF_DAY') then 1 else 0 end)::int`,
    })
    .from(t.studentAttendance)
    .innerJoin(t.sections, eq(t.sections.id, t.studentAttendance.sectionId))
    .innerJoin(t.classLevels, eq(t.classLevels.id, t.sections.classId))
    .where(eq(t.studentAttendance.schoolId, schoolId))
    .groupBy(t.classLevels.name, t.sections.name, t.classLevels.level)
    .orderBy(t.classLevels.level, t.sections.name);

  const attendanceBySection = perSection.map((r) => ({
    section: `${r.className}-${r.sectionName}`,
    percent: percent(Number(r.present), r.total),
  }));

  // Academic performance per section from the latest published exam
  const latestExam = await db.query.exams.findFirst({
    where: and(eq(t.exams.schoolId, schoolId), eq(t.exams.status, 'RESULTS_PUBLISHED')),
    orderBy: desc(t.exams.startDate),
  });

  const performance = latestExam
    ? await db
        .select({
          className: t.classLevels.name,
          sectionName: t.sections.name,
          students: count(),
          average: sql<number>`round(avg(${t.results.percentage})::numeric, 1)`,
          passRate: sql<number>`round((sum(case when ${t.results.percentage} >= 35 then 1 else 0 end) * 100.0 / count(*))::numeric, 1)`,
        })
        .from(t.results)
        .innerJoin(t.sections, eq(t.sections.id, t.results.sectionId))
        .innerJoin(t.classLevels, eq(t.classLevels.id, t.sections.classId))
        .where(and(eq(t.results.examId, latestExam.id), eq(t.results.isPublished, true)))
        .groupBy(t.classLevels.name, t.sections.name, t.classLevels.level)
        .orderBy(t.classLevels.level, t.sections.name)
    : [];

  // Finance
  const finance = await db
    .select({
      billed: sql<number>`coalesce(sum(${t.studentFees.amount} - ${t.studentFees.discount}), 0)::int`,
      collected: sql<number>`coalesce(sum(${t.studentFees.paidAmount}), 0)::int`,
      overdue: sql<number>`coalesce(sum(case when ${t.studentFees.status} = 'OVERDUE' then ${t.studentFees.amount} - ${t.studentFees.discount} - ${t.studentFees.paidAmount} else 0 end), 0)::int`,
    })
    .from(t.studentFees)
    .where(eq(t.studentFees.schoolId, schoolId));
  const fin = finance[0] ?? { billed: 0, collected: 0, overdue: 0 };

  // Teacher workload
  const workload = await db
    .select({ teacher: t.users.name, periods: count() })
    .from(t.timetableSlots)
    .innerJoin(t.teachers, eq(t.teachers.id, t.timetableSlots.teacherId))
    .innerJoin(t.users, eq(t.users.id, t.teachers.userId))
    .where(eq(t.timetableSlots.schoolId, schoolId))
    .groupBy(t.users.name)
    .orderBy(desc(count()))
    .limit(12);

  const overallAttendance = perSection.length
    ? percent(
        perSection.reduce((a, b) => a + Number(b.present), 0),
        perSection.reduce((a, b) => a + b.total, 0),
      )
    : 0;

  return (
    <>
      <PageHeader
        title="Reports and analytics"
        description={year ? `Academic year ${year.name}` : 'Executive view of the whole school.'}
        action={<ExportButtons canFees={session.permissions.includes('fees.view')} canTransport={session.permissions.includes('transport.view')} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={students.value} icon={GraduationCap} />
        <StatCard label="Attendance (all time)" value={`${overallAttendance}%`} icon={ClipboardCheck} tone={overallAttendance < 85 ? 'amber' : 'green'} />
        <StatCard
          label="Fees collected"
          value={formatCurrency(fin.collected)}
          sub={fin.billed ? `${percent(fin.collected, fin.billed)}% of ${formatCurrency(fin.billed)}` : 'No fees raised'}
          icon={Wallet}
          tone="blue"
        />
        <StatCard label="Overdue fees" value={formatCurrency(fin.overdue)} icon={Wallet} tone={fin.overdue ? 'red' : 'green'} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance trend" description="Last 20 school days" />
          <CardBody>
            {trend.length ? <TrendChart data={trend} xKey="date" yKey="percent" label="Attendance %" /> : <EmptyState title="No attendance recorded" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Attendance by class" />
          <CardBody>
            {attendanceBySection.length ? (
              <BarsChart data={attendanceBySection} xKey="section" yKey="percent" label="Attendance %" />
            ) : (
              <EmptyState title="No attendance recorded" />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Academic performance"
          description={latestExam ? `Based on ${latestExam.name}` : 'No published exam yet'}
        />
        {performance.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">Publish an exam&apos;s results to see class performance here.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Class</TH>
                <TH>Students</TH>
                <TH>Average</TH>
                <TH>Pass rate</TH>
              </TR>
            </THead>
            <TBody>
              {performance.map((p) => (
                <TR key={`${p.className}-${p.sectionName}`}>
                  <TD className="font-medium text-slate-900">
                    {p.className}-{p.sectionName}
                  </TD>
                  <TD>{p.students}</TD>
                  <TD>{Number(p.average)}%</TD>
                  <TD>
                    <Badge tone={Number(p.passRate) >= 90 ? 'green' : Number(p.passRate) >= 70 ? 'amber' : 'red'}>
                      {Number(p.passRate)}%
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Teacher workload" description="Timetabled periods per week" />
        {workload.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">Build the timetable to see teacher workload.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Teacher</TH>
                <TH>Periods per week</TH>
                <TH>Load</TH>
              </TR>
            </THead>
            <TBody>
              {workload.map((w) => (
                <TR key={w.teacher}>
                  <TD className="font-medium text-slate-900">{w.teacher}</TD>
                  <TD>{w.periods}</TD>
                  <TD>
                    <Badge tone={w.periods > 28 ? 'red' : w.periods > 20 ? 'amber' : 'green'}>
                      {w.periods > 28 ? 'heavy' : w.periods > 20 ? 'balanced' : 'light'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
