import { desc, eq } from 'drizzle-orm';
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

export default async function StudentAnnouncementsPage() {
  const session = await requireSchoolPage('portal.student');
  const { enrollment } = await studentContext(session);

  const rows = await db
    .select()
    .from(t.announcements)
    .where(eq(t.announcements.schoolId, session.schoolId))
    .orderBy(desc(t.announcements.isPinned), desc(t.announcements.publishedAt))
    .limit(60);

  const visible = rows.filter(
    (a) =>
      (a.audience.length === 0 || a.audience.includes('STUDENT')) &&
      (a.sectionIds.length === 0 || (enrollment ? a.sectionIds.includes(enrollment.sectionId) : false)),
  );

  return (
    <>
      <PageHeader title="Announcements" />
      {visible.length === 0 ? (
        <div className="card">
          <EmptyState title="Nothing right now" description="School notices will appear here." />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <Card key={a.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">{a.title}</h2>
                  <Badge tone={a.type === 'EMERGENCY' ? 'red' : 'slate'}>{a.type.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                <p className="mt-2 text-xs text-slate-400">{formatDate(a.publishedAt, { dateStyle: 'medium' })}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
