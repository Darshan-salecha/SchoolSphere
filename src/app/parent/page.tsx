import Link from 'next/link';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { ClipboardCheck, NotebookPen, Trophy, Wallet } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { attendanceSummary } from '@/lib/services/attendance';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatCurrency, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ParentDashboard() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);

  if (!selected) {
    return (
      <div className="card">
        <EmptyState
          title="No children linked to your number yet"
          description="Please contact the school office so they can link your child to your mobile number."
        />
      </div>
    );
  }

  const section = currentSection(selected);
  const summary = await attendanceSummary(session.schoolId, [selected.id]);
  const attendance = summary.get(selected.id) ?? { present: 0, total: 0, percent: 0 };
  const today = new Date().toISOString().slice(0, 10);

  const homework = section
    ? await db.query.homework.findMany({
        where: and(eq(t.homework.sectionId, section.sectionId), gte(t.homework.dueDate, today)),
        with: { subject: true },
        orderBy: t.homework.dueDate,
        limit: 5,
      })
    : [];

  const results = await db.query.results.findMany({
    where: and(eq(t.results.studentId, selected.id), eq(t.results.isPublished, true)),
    with: { exam: true },
    orderBy: desc(t.results.publishedAt),
    limit: 3,
  });

  const fees = await db
    .select()
    .from(t.studentFees)
    .where(and(eq(t.studentFees.studentId, selected.id), inArray(t.studentFees.status, ['PENDING', 'OVERDUE', 'PARTIAL'])));
  const pending = fees.reduce((sum, f) => sum + (f.amount - f.discount - f.paidAmount), 0);

  const announcements = await db
    .select()
    .from(t.announcements)
    .where(eq(t.announcements.schoolId, session.schoolId))
    .orderBy(desc(t.announcements.publishedAt))
    .limit(4);

  const events = await db
    .select()
    .from(t.events)
    .where(and(eq(t.events.schoolId, session.schoolId), gte(t.events.startAt, new Date())))
    .orderBy(t.events.startAt)
    .limit(3);

  const attendanceToday = await db.query.studentAttendance.findFirst({
    where: and(eq(t.studentAttendance.studentId, selected.id), eq(t.studentAttendance.date, today)),
  });

  return (
    <>
      <PageHeader
        title={`${selected.firstName}'s day`}
        description={section ? `${section.section.class.name} — ${section.section.name} · ${session.schoolName}` : session.schoolName ?? undefined}
      />

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today"
          value={attendanceToday ? attendanceToday.status.replaceAll('_', ' ').toLowerCase() : 'Not marked'}
          sub={formatDate(new Date())}
          icon={ClipboardCheck}
          tone={attendanceToday?.status === 'ABSENT' ? 'red' : 'green'}
        />
        <StatCard
          label="Attendance"
          value={`${attendance.percent}%`}
          sub={`${attendance.present} of ${attendance.total} days`}
          icon={ClipboardCheck}
          tone={attendance.percent < 75 ? 'amber' : 'blue'}
        />
        <StatCard label="Homework due" value={homework.length} sub="in the next few days" icon={NotebookPen} />
        <StatCard
          label="Fees pending"
          value={pending ? formatCurrency(pending) : 'All clear'}
          sub={fees.length ? `${fees.length} instalment${fees.length === 1 ? '' : 's'}` : 'Nothing outstanding'}
          icon={Wallet}
          tone={pending ? 'red' : 'green'}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Homework" action={<Link href="/parent/homework" className="text-xs font-medium text-brand-600 hover:underline">See all</Link>} />
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

        <Card>
          <CardHeader title="Recent results" action={<Link href="/parent/results" className="text-xs font-medium text-brand-600 hover:underline">Report cards</Link>} />
          <CardBody className="space-y-3">
            {results.length === 0 && <p className="text-sm text-slate-500">No results published yet.</p>}
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{r.exam.name}</p>
                  <p className="text-xs text-slate-500">
                    {r.totalMarks} / {r.maxMarks} · rank {r.rank ?? '—'}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <Badge tone={r.percentage >= 60 ? 'green' : r.percentage >= 35 ? 'amber' : 'red'}>{r.grade}</Badge>
                  <span className="text-sm font-semibold text-slate-900">{r.percentage}%</span>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="School announcements" action={<Link href="/parent/announcements" className="text-xs font-medium text-brand-600 hover:underline">See all</Link>} />
          <CardBody className="space-y-4">
            {announcements.length === 0 && <p className="text-sm text-slate-500">Nothing from the school yet.</p>}
            {announcements.map((a) => (
              <div key={a.id} className="border-l-2 border-brand-200 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{a.title}</p>
                  <Badge tone={a.type === 'EMERGENCY' ? 'red' : 'slate'}>{a.type.toLowerCase()}</Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(a.publishedAt, { dateStyle: 'medium' })}</p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming events" action={<Link href="/parent/events" className="text-xs font-medium text-brand-600 hover:underline">Calendar</Link>} />
          <CardBody className="space-y-3">
            {events.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <div className="w-11 shrink-0 rounded-lg bg-brand-50 py-1.5 text-center">
                  <p className="text-[10px] font-medium uppercase text-brand-600">
                    {e.startAt.toLocaleDateString('en-IN', { month: 'short' })}
                  </p>
                  <p className="text-sm font-semibold text-brand-700">{e.startAt.getDate()}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                  <p className="truncate text-xs text-slate-500">{e.location ?? e.category.toLowerCase()}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
