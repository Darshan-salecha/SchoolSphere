import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { submissionsFor } from '@/lib/services/homework';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, type Tone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Read-only for guardians: what was set, whether it was done, what the teacher said. */
function statusFor(
  submission: typeof t.homeworkSubmissions.$inferSelect | undefined,
  overdue: boolean,
): { label: string; tone: Tone } {
  const done = submission?.status === 'SUBMITTED' || submission?.status === 'LATE';
  if (submission?.reviewStatus === 'ACKNOWLEDGED') return { label: 'Acknowledged by teacher', tone: 'brand' };
  if (submission?.reviewStatus === 'NEEDS_REWORK') return { label: 'Teacher asked for a redo', tone: 'red' };
  if (done) {
    return submission?.status === 'LATE'
      ? { label: 'Done · late', tone: 'amber' }
      : { label: 'Done · awaiting teacher', tone: 'green' };
  }
  return overdue ? { label: 'Not done · overdue', tone: 'red' } : { label: 'Not done yet', tone: 'amber' };
}

export default async function ParentHomeworkPage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const section = currentSection(selected);
  const rows = section
    ? await db.query.homework.findMany({
        where: and(eq(t.homework.schoolId, session.schoolId), eq(t.homework.sectionId, section.sectionId)),
        with: { subject: true, teacher: { with: { user: { columns: { name: true } } } } },
        orderBy: desc(t.homework.dueDate),
        limit: 60,
      })
    : [];

  const submissions = await submissionsFor(session.schoolId, rows.map((r) => r.id), [selected.id]);

  const today = new Date().toISOString().slice(0, 10);
  const items = rows.map((h) => {
    const submission = submissions.get(`${h.id}:${selected.id}`);
    const overdue = h.dueDate < today;
    return { h, submission, overdue, state: statusFor(submission, overdue) };
  });

  const upcoming = items.filter((i) => !i.overdue);
  const past = items.filter((i) => i.overdue);
  const outstanding = items.filter(
    (i) => i.submission?.status !== 'SUBMITTED' && i.submission?.status !== 'LATE' && !i.overdue,
  ).length;

  return (
    <>
      <PageHeader
        title="Homework"
        description={`What ${selected.firstName}'s class has been set, and how ${selected.firstName} is tracking against it.`}
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

      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="No homework yet" description="Homework set by teachers appears here as soon as it is posted." />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Due now
              {outstanding > 0 && (
                <span className="ml-2 font-normal text-slate-500">· {outstanding} still to do</span>
              )}
            </h2>
            <div className="space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing outstanding.</p>}
              {upcoming.map(({ h, submission, state }) => (
                <Card key={h.id}>
                  <CardBody>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">{h.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{h.description}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {h.subject.name} · set by {h.teacher.user.name}
                        </p>
                        {submission?.note && (
                          <p className="mt-2 text-xs text-slate-500">
                            {selected.firstName} noted: “{submission.note}”
                          </p>
                        )}
                        {submission?.feedback && (
                          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Teacher: “{submission.feedback}”
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone="blue">due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}</Badge>
                        <Badge tone={state.tone}>{state.label}</Badge>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Earlier</h2>
              <div className="space-y-2">
                {past.slice(0, 20).map(({ h, submission, state }) => (
                  <div key={h.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{h.title}</p>
                      <p className="text-xs text-slate-400">
                        {h.subject.name} · due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}
                      </p>
                      {submission?.feedback && (
                        <p className="mt-1 text-xs text-slate-500">Teacher: “{submission.feedback}”</p>
                      )}
                    </div>
                    <Badge tone={state.tone}>{state.label}</Badge>
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
