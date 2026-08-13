import Link from 'next/link';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { Layers, ClipboardCheck, NotebookPen, Users } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { accessibleSectionIds, classTeacherSectionIds } from '@/lib/scope';
import { teacherTimetable, todayDayOfWeek, DAYS } from '@/lib/services/timetable';
import { dailyAttendance } from '@/lib/services/attendance';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export async function TeacherDashboard({ session }: { session: SessionUser & { schoolId: string } }) {
  const schoolId = session.schoolId;
  const today = new Date().toISOString().slice(0, 10);
  const day = todayDayOfWeek();

  const sectionIds = (await accessibleSectionIds(session)) ?? [];
  const classTeacherOf = await classTeacherSectionIds(session);

  const slots = session.teacherId ? await teacherTimetable(schoolId, session.teacherId) : [];
  const todaySlots = slots
    .filter((s) => s.dayOfWeek === day)
    .sort((a, b) => a.period.order - b.period.order);

  const [students] = sectionIds.length
    ? await db
        .select({ value: count() })
        .from(t.enrollments)
        .where(and(eq(t.enrollments.schoolId, schoolId), eq(t.enrollments.isCurrent, true), inArray(t.enrollments.sectionId, sectionIds)))
    : [{ value: 0 }];

  const homework = sectionIds.length
    ? await db.query.homework.findMany({
        where: and(eq(t.homework.schoolId, schoolId), inArray(t.homework.sectionId, sectionIds)),
        with: { section: { with: { class: true } }, subject: true },
        orderBy: desc(t.homework.dueDate),
        limit: 5,
      })
    : [];

  const marked = await dailyAttendance(schoolId, today);

  const sections = sectionIds.length
    ? await db.query.sections.findMany({
        where: inArray(t.sections.id, sectionIds),
        with: { class: true, enrollments: { where: eq(t.enrollments.isCurrent, true), columns: { id: true } } },
      })
    : [];

  const announcements = await db
    .select()
    .from(t.announcements)
    .where(eq(t.announcements.schoolId, schoolId))
    .orderBy(desc(t.announcements.publishedAt))
    .limit(3);

  return (
    <>
      <PageHeader
        title={`Good to see you, ${session.name.split(' ')[0]}`}
        description={`${DAYS.find((d) => d.value === day)?.label ?? 'Today'} · ${formatDate(new Date())}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My classes" value={sections.length} sub={`${classTeacherOf.length} as class teacher`} icon={Layers} />
        <StatCard label="My students" value={students.value} icon={Users} tone="blue" />
        <StatCard label="Classes today" value={todaySlots.length} sub="from your timetable" icon={ClipboardCheck} tone="green" />
        <StatCard label="Homework set" value={homework.length} sub="most recent" icon={NotebookPen} tone="amber" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today's timetable"
            description={marked.total ? `School attendance today: ${marked.percent}%` : 'Attendance not marked yet'}
            action={<Link href="/school/timetable" className="text-xs font-medium text-brand-600 hover:underline">Full timetable</Link>}
          />
          {todaySlots.length === 0 ? (
            <EmptyState title="No classes scheduled today" description="Your timetable for today is clear." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {todaySlots.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-20 shrink-0 text-xs text-slate-500">
                    <p className="font-medium text-slate-700">{s.period.startTime}</p>
                    <p>{s.period.endTime}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{s.subject?.name ?? 'Free period'}</p>
                    <p className="text-xs text-slate-500">
                      {s.section.class.name}-{s.section.name}
                      {s.room ? ` · Room ${s.room}` : ''}
                    </p>
                  </div>
                  <Link
                    href={`/school/attendance?sectionId=${s.sectionId}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Take register
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="My classes" />
            <CardBody className="space-y-2">
              {sections.length === 0 && <p className="text-sm text-slate-500">You have no class assignments yet.</p>}
              {sections.map((s) => (
                <Link
                  key={s.id}
                  href={`/school/students?sectionId=${s.id}`}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100"
                >
                  <span className="text-sm font-medium text-slate-900">
                    {s.class.name}-{s.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {classTeacherOf.includes(s.id) && <Badge tone="green">Class teacher</Badge>}
                    <span className="text-xs text-slate-500">{s.enrollments.length}</span>
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Announcements" />
            <CardBody className="space-y-3">
              {announcements.length === 0 && <p className="text-sm text-slate-500">Nothing published yet.</p>}
              {announcements.map((a) => (
                <div key={a.id} className="border-l-2 border-brand-200 pl-3">
                  <p className="text-sm font-medium text-slate-900">{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{a.body}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent homework" action={<Link href="/school/homework" className="text-xs font-medium text-brand-600 hover:underline">All homework</Link>} />
        <CardBody className="space-y-3">
          {homework.length === 0 && <p className="text-sm text-slate-500">You haven&apos;t set any homework yet.</p>}
          {homework.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{h.title}</p>
                <p className="text-xs text-slate-500">
                  {h.section.class.name}-{h.section.name} · {h.subject.name}
                </p>
              </div>
              <Badge tone={h.dueDate < today ? 'slate' : 'blue'}>due {formatDate(h.dueDate)}</Badge>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
