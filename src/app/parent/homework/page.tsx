import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.dueDate >= today);
  const past = rows.filter((r) => r.dueDate < today);

  return (
    <>
      <PageHeader title="Homework" description={`Everything set for ${selected.firstName}'s class.`} />
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

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No homework yet" description="Homework set by teachers appears here as soon as it is posted." />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Due now</h2>
            <div className="space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing outstanding.</p>}
              {upcoming.map((h) => (
                <Card key={h.id}>
                  <CardBody>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">{h.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{h.description}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {h.subject.name} · set by {h.teacher.user.name}
                        </p>
                      </div>
                      <Badge tone="blue">due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}</Badge>
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
                {past.slice(0, 20).map((h) => (
                  <div key={h.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{h.title}</p>
                      <p className="text-xs text-slate-400">{h.subject.name}</p>
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(h.dueDate)}</span>
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
