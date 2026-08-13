import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { AnnouncementComposer } from './composer';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { Pin } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage() {
  const session = await requireSchoolPage('announcements.view');
  const sections = await listSections(session.schoolId);

  const rows = await db.query.announcements.findMany({
    where: eq(t.announcements.schoolId, session.schoolId),
    orderBy: [desc(t.announcements.isPinned), desc(t.announcements.publishedAt)],
    limit: 50,
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Choose an audience and a channel, preview, then send."
        action={
          session.permissions.includes('announcements.create') ? (
            <AnnouncementComposer sections={sections.map((s) => ({ id: s.id, label: s.label }))} />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Nothing published yet" description="Announcements you publish reach parents, teachers and students instantly." />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Card key={a.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      {a.isPinned && <Pin className="h-3.5 w-3.5 text-brand-600" />}
                      {a.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                  </div>
                  <Badge tone={a.type === 'EMERGENCY' ? 'red' : a.type === 'EXAM' ? 'brand' : 'slate'}>
                    {a.type.toLowerCase()}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(a.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span>·</span>
                  <span className="capitalize">{a.audience.map((x) => x.toLowerCase()).join(', ') || 'everyone'}</span>
                  {a.sectionIds.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{a.sectionIds.length} specific class{a.sectionIds.length === 1 ? '' : 'es'}</span>
                    </>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
