import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { studentContext } from '@/lib/student-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

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

  return (
    <>
      <PageHeader title="Homework" description="Everything set for your class." />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No homework yet" description="Homework set by your teachers appears here." />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((h) => (
            <Card key={h.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900">{h.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">{h.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {h.subject.name} · {h.teacher.user.name}
                    </p>
                  </div>
                  <Badge tone="blue">due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}</Badge>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
