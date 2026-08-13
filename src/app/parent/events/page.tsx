import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { CalendarDays, MapPin } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ParentEventsPage() {
  const session = await requireSchoolPage('portal.parent');
  const events = await db
    .select()
    .from(t.events)
    .where(and(eq(t.events.schoolId, session.schoolId), gte(t.events.startAt, new Date())))
    .orderBy(asc(t.events.startAt))
    .limit(40);

  return (
    <>
      <PageHeader title="School calendar" description="Upcoming events, meetings and holidays." />
      {events.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Upcoming school events will appear here." />
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id}>
              <CardBody className="flex gap-4">
                <div className="w-14 shrink-0 rounded-lg bg-brand-50 py-2 text-center">
                  <p className="text-[11px] font-medium uppercase text-brand-600">
                    {e.startAt.toLocaleDateString('en-IN', { month: 'short' })}
                  </p>
                  <p className="text-lg font-semibold text-brand-700">{e.startAt.getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">{e.title}</h2>
                    <Badge tone="brand">{e.category.toLowerCase()}</Badge>
                  </div>
                  {e.description && <p className="mt-1 text-sm text-slate-600">{e.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{formatDate(e.startAt, { dateStyle: 'full' })}</span>
                    {e.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {e.location}
                      </span>
                    )}
                    {e.requiresRsvp && <Badge tone="amber">RSVP required</Badge>}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
