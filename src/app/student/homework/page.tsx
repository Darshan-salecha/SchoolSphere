import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { studentContext } from '@/lib/student-context';
import { submissionsFor } from '@/lib/services/homework';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, type Tone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { MarkDone } from './mark-done';

export const dynamic = 'force-dynamic';

export default async function StudentHomeworkPage() {
  const session = await requireSchoolPage('portal.student');
  const { enrollment } = await studentContext(session);

  const rows = enrollment
    ? await db.query.homework.findMany({
        where: and(eq(t.homework.schoolId, session.schoolId), eq(t.homework.sectionId, enrollment.sectionId)),
        with: { subject: true, teacher: { with: { user: { columns: { name: true } } } } },
        orderBy: desc(t.homework.dueDate),
        limit: 50,
      })
    : [];

  const submissions = session.studentId
    ? await submissionsFor(session.schoolId, rows.map((r) => r.id), [session.studentId])
    : new Map<string, typeof t.homeworkSubmissions.$inferSelect>();

  const today = new Date().toISOString().slice(0, 10);
  const items = rows.map((h) => {
    const s = submissions.get(`${h.id}:${session.studentId}`);
    const done = s?.status === 'SUBMITTED' || s?.status === 'LATE';
    const needsRework = s?.reviewStatus === 'NEEDS_REWORK';
    const overdue = h.dueDate < today;
    const state: { label: string; tone: Tone } = needsRework
      ? { label: 'Redo this', tone: 'red' }
      : s?.reviewStatus === 'ACKNOWLEDGED'
        ? { label: 'Acknowledged by teacher', tone: 'brand' }
        : done
          ? { label: s?.status === 'LATE' ? 'Done · handed in late' : 'Done · waiting for teacher', tone: 'green' }
          : overdue
            ? { label: 'Overdue', tone: 'red' }
            : { label: 'To do', tone: 'amber' };
    return { h, s, done, needsRework, overdue, state };
  });

  const todo = items.filter((i) => !i.done || i.needsRework);
  const finished = items.filter((i) => i.done && !i.needsRework);

  return (
    <>
      <PageHeader
        title="Homework"
        description="Tick each one off as you finish it — your teacher and your parents can see it."
      />

      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="No homework yet" description="Homework set by your teachers appears here." />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              To do {todo.length > 0 && <span className="font-normal text-slate-400">· {todo.length}</span>}
            </h2>
            {todo.length === 0 ? (
              <p className="text-sm text-slate-500">All caught up. Nice work.</p>
            ) : (
              <div className="space-y-3">
                {todo.map(({ h, s, done, needsRework, state }) => (
                  <Card key={h.id}>
                    <CardBody>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900">{h.title}</h3>
                          <p className="mt-1 text-sm text-slate-600">{h.description}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            {h.subject.name} · {h.teacher.user.name}
                          </p>
                          {needsRework && s?.feedback && (
                            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                              Your teacher said: “{s.feedback}”
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge tone="blue">due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}</Badge>
                          <Badge tone={state.tone}>{state.label}</Badge>
                          <MarkDone homeworkId={h.id} done={done} locked={false} needsRework={needsRework} />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {finished.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Done</h2>
              <div className="space-y-2">
                {finished.map(({ h, s, state }) => (
                  <div key={h.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{h.title}</p>
                      <p className="text-xs text-slate-400">
                        {h.subject.name} · marked done {formatDate(s?.submittedAt, { day: 'numeric', month: 'short' })}
                      </p>
                      {s?.feedback && <p className="mt-1 text-xs text-slate-500">“{s.feedback}”</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={state.tone}>{state.label}</Badge>
                      <MarkDone homeworkId={h.id} done locked={s?.reviewStatus !== 'PENDING'} needsRework={false} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
