import Link from 'next/link';
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { GraduationCap, UserCog, ClipboardCheck, Wallet, ArrowRight } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { attendanceTrend, dailyAttendance } from '@/lib/services/attendance';
import { currentAcademicYear } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TrendChart, DonutChart } from '@/components/charts/simple-charts';
import { EmptyState } from '@/components/ui/states';
import { formatCurrency, formatDate, percent } from '@/lib/utils';

export async function AdminDashboard({ session }: { session: SessionUser & { schoolId: string } }) {
  const schoolId = session.schoolId;
  const today = new Date().toISOString().slice(0, 10);
  const year = await currentAcademicYear(schoolId);

  const [[students], [teachers], [staffCount]] = await Promise.all([
    db.select({ value: count() }).from(t.students).where(and(eq(t.students.schoolId, schoolId), isNull(t.students.deletedAt))),
    db.select({ value: count() }).from(t.teachers).where(and(eq(t.teachers.schoolId, schoolId), isNull(t.teachers.deletedAt))),
    db.select({ value: count() }).from(t.staff).where(eq(t.staff.schoolId, schoolId)),
  ]);

  const attendance = await dailyAttendance(schoolId, today);
  const trend = await attendanceTrend(schoolId, 14);

  const fees = await db
    .select({
      billed: sql<number>`coalesce(sum(${t.studentFees.amount} - ${t.studentFees.discount}), 0)::int`,
      collected: sql<number>`coalesce(sum(${t.studentFees.paidAmount}), 0)::int`,
    })
    .from(t.studentFees)
    .where(eq(t.studentFees.schoolId, schoolId));
  const billed = fees[0]?.billed ?? 0;
  const collected = fees[0]?.collected ?? 0;

  const upcomingExams = await db.query.exams.findMany({
    where: and(eq(t.exams.schoolId, schoolId), gte(t.exams.startDate, today)),
    orderBy: t.exams.startDate,
    limit: 4,
  });

  const events = await db
    .select()
    .from(t.events)
    .where(and(eq(t.events.schoolId, schoolId), gte(t.events.startAt, new Date())))
    .orderBy(t.events.startAt)
    .limit(4);

  const announcements = await db
    .select()
    .from(t.announcements)
    .where(eq(t.announcements.schoolId, schoolId))
    .orderBy(desc(t.announcements.publishedAt))
    .limit(4);

  const lowAttendance = await db
    .select({
      studentId: t.studentAttendance.studentId,
      firstName: t.students.firstName,
      lastName: t.students.lastName,
      total: count(),
      present: sql<number>`sum(case when ${t.studentAttendance.status} in ('PRESENT','LATE','HALF_DAY') then 1 else 0 end)::int`,
    })
    .from(t.studentAttendance)
    .innerJoin(t.students, eq(t.students.id, t.studentAttendance.studentId))
    .where(eq(t.studentAttendance.schoolId, schoolId))
    .groupBy(t.studentAttendance.studentId, t.students.firstName, t.students.lastName)
    .having(sql`sum(case when ${t.studentAttendance.status} in ('PRESENT','LATE','HALF_DAY') then 1 else 0 end) * 100.0 / count(*) < 80`)
    .limit(6);

  const setupIncomplete = !year || students.value === 0;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${session.name.split(' ')[0]}`}
        description={year ? `${session.schoolName} · academic year ${year.name}` : session.schoolName ?? undefined}
      />

      {setupIncomplete && (
        <Link href="/school/setup" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 hover:bg-brand-100/70">
          <div>
            <p className="text-sm font-medium text-brand-900">Finish setting up your school</p>
            <p className="text-xs text-brand-700">Academic year, classes, subjects, teachers and students.</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand-700" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={students.value} sub={`${staffCount.value} support staff`} icon={GraduationCap} />
        <StatCard label="Teachers" value={teachers.value} icon={UserCog} tone="green" />
        <StatCard
          label="Attendance today"
          value={attendance.total ? `${attendance.percent}%` : '—'}
          sub={attendance.total ? `${attendance.present} of ${attendance.total} present` : 'Not marked yet'}
          icon={ClipboardCheck}
          tone={attendance.percent && attendance.percent < 85 ? 'amber' : 'blue'}
        />
        <StatCard
          label="Fees collected"
          value={formatCurrency(collected)}
          sub={billed ? `${percent(collected, billed)}% of ${formatCurrency(billed)} billed` : 'No fees raised yet'}
          icon={Wallet}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance trend" description="Last 14 school days" />
          <CardBody>
            {trend.length ? (
              <TrendChart data={trend} xKey="date" yKey="percent" label="Attendance %" />
            ) : (
              <EmptyState title="No attendance recorded yet" description="Once teachers start marking the register, the trend appears here." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Today's register" />
          <CardBody>
            {attendance.total ? (
              <DonutChart
                data={attendance.breakdown.map((b) => ({ name: b.status.replaceAll('_', ' ').toLowerCase(), value: b.value }))}
              />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">Attendance has not been marked today.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming exams" action={<Link href="/school/exams" className="text-xs font-medium text-brand-600 hover:underline">All exams</Link>} />
          <CardBody className="space-y-3">
            {upcomingExams.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled.</p>}
            {upcomingExams.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">{formatDate(e.startDate)}</p>
                </div>
                <StatusBadge status={e.status} />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming events" action={<Link href="/school/events" className="text-xs font-medium text-brand-600 hover:underline">Calendar</Link>} />
          <CardBody className="space-y-3">
            {events.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(e.startAt)}</p>
                </div>
                <Badge tone="brand">{e.category.toLowerCase()}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Students needing attention" description="Attendance below 80%" />
          <CardBody className="space-y-3">
            {lowAttendance.length === 0 && <p className="text-sm text-slate-500">Every student is above 80%.</p>}
            {lowAttendance.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between gap-3">
                <Link href={`/school/students/${s.studentId}`} className="truncate text-sm font-medium text-slate-900 hover:text-brand-600">
                  {s.firstName} {s.lastName}
                </Link>
                <Badge tone="red">{percent(Number(s.present), s.total)}%</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Latest announcements" action={<Link href="/school/announcements" className="text-xs font-medium text-brand-600 hover:underline">All announcements</Link>} />
        <CardBody className="space-y-4">
          {announcements.length === 0 && <p className="text-sm text-slate-500">Nothing published yet.</p>}
          {announcements.map((a) => (
            <div key={a.id} className="border-l-2 border-brand-200 pl-3">
              <p className="text-sm font-medium text-slate-900">{a.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDate(a.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
