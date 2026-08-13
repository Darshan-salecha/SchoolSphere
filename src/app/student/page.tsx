import Link from 'next/link';
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { ClipboardCheck, NotebookPen, Trophy, CalendarClock } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { studentContext } from '@/lib/student-context';
import { teacherTimetable, todayDayOfWeek, DAYS, sectionTimetable } from '@/lib/services/timetable';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate, percent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StudentDashboard() {
  const session = await requireSchoolPage('portal.student');
  const { student, enrollment } = await studentContext(session);
  if (!student) return <EmptyState title="Your student record is unavailable" description="Please contact the school office." />;

  const today = new Date().toISOString().slice(0, 10);
  const day = todayDayOfWeek();

  const breakdown = await db
    .select({ status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.studentId, student.id))
    .groupBy(t.studentAttendance.status);
  const total = breakdown.reduce((a, b) => a + b.value, 0);
  const present = breakdown.filter((b) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(b.status)).reduce((a, b) => a + b.value, 0);

  const slots = enrollment ? await sectionTimetable(session.schoolId, enrollment.sectionId) : [];
  const todaySlots = slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.period.order - b.period.order);

  const homework = enrollment
    ? await db.query.homework.findMany({
        where: and(eq(t.homework.sectionId, enrollment.sectionId), gte(t.homework.dueDate, today)),
        with: { subject: true },
        orderBy: t.homework.dueDate,
        limit: 5,
      })
    : [];

  const results = await db.query.results.findMany({
    where: and(eq(t.results.studentId, student.id), eq(t.results.isPublished, true)),
    with: { exam: true },
    orderBy: desc(t.results.publishedAt),
    limit: 3,
  });

  return (
    <>
      <PageHeader
        title={`Hello, ${student.firstName}`}
        description={
          enrollment
            ? `${enrollment.section.class.name} — ${enrollment.section.name} · ${DAYS.find((d) => d.value === day)?.label ?? ''}`
            : session.schoolName ?? undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attendance" value={`${percent(present, total)}%`} sub={`${present} of ${total} days`} icon={ClipboardCheck} tone={percent(present, total) < 75 ? 'amber' : 'green'} />
        <StatCard label="Classes today" value={todaySlots.length} icon={CalendarClock} tone="blue" />
        <StatCard label="Homework due" value={homework.length} icon={NotebookPen} />
        <StatCard label="Latest result" value={results[0] ? `${results[0].percentage}%` : '—'} sub={results[0]?.exam.name ?? 'None published'} icon={Trophy} tone="amber" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Today's classes" action={<Link href="/student/timetable" className="text-xs font-medium text-brand-600 hover:underline">Full week</Link>} />
          {todaySlots.length === 0 ? (
            <EmptyState title="No classes today" description="Enjoy the break." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {todaySlots.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-16 shrink-0 text-xs text-slate-500">
                    <p className="font-medium text-slate-700">{s.period.startTime}</p>
                    <p>{s.period.endTime}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{s.subject?.name ?? 'Free period'}</p>
                    <p className="text-xs text-slate-500">{s.teacher?.user.name ?? ''}{s.room ? ` · Room ${s.room}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Homework due" action={<Link href="/student/homework" className="text-xs font-medium text-brand-600 hover:underline">See all</Link>} />
          <CardBody className="space-y-3">
            {homework.length === 0 && <p className="text-sm text-slate-500">Nothing due right now.</p>}
            {homework.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{h.title}</p>
                  <p className="text-xs text-slate-500">{h.subject.name}</p>
                </div>
                <Badge tone="blue">due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
