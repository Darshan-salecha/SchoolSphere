import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { Pin } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ParentAnnouncementsPage() {
  const session = await requireSchoolPage('portal.parent');
  const { selected } = await parentContext(session);
  const section = currentSection(selected);

  const rows = await db
    .select()
    .from(t.announcements)
    .where(eq(t.announcements.schoolId, session.schoolId))
    .orderBy(desc(t.announcements.isPinned), desc(t.announcements.publishedAt))
    .limit(80);

  // Parents see school-wide notices plus anything aimed at their child's class.
  const visible = rows.filter(
    (a) =>
      (a.audience.length === 0 || a.audience.includes('PARENT')) &&
      (a.sectionIds.length === 0 || (section ? a.sectionIds.includes(section.sectionId) : false)),
  );

  return (
    <>
      <PageHeader title="Announcements" description="Notices from the school office and your child's teachers." />
      {visible.length === 0 ? (
        <div className="card">
          <EmptyState title="Nothing right now" description="School announcements will appear here." />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <Card key={a.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {a.isPinned && <Pin className="h-3.5 w-3.5 text-brand-600" />}
                    {a.title}
                  </h2>
                  <Badge tone={a.type === 'EMERGENCY' ? 'red' : a.type === 'EXAM' ? 'brand' : 'slate'}>{a.type.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                <p className="mt-2 text-xs text-slate-400">{formatDate(a.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
