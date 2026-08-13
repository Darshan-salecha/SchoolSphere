import { asc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { MapPin, CalendarDays } from 'lucide-react';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['GENERAL', 'PTM', 'SPORTS', 'CULTURAL', 'ACADEMIC', 'HOLIDAY', 'TRIP'];

export default async function EventsPage() {
  const session = await requireSchoolPage('events.view');
  const events = await db
    .select()
    .from(t.events)
    .where(eq(t.events.schoolId, session.schoolId))
    .orderBy(asc(t.events.startAt))
    .limit(100);

  const now = new Date();
  const upcoming = events.filter((e) => e.startAt >= now);
  const past = events.filter((e) => e.startAt < now).reverse();

  return (
    <>
      <PageHeader
        title="Events"
        description="The school calendar as parents, students and staff see it."
        action={
          session.permissions.includes('events.manage') ? (
            <QuickForm
              title="Create an event"
              endpoint="/api/school/events"
              triggerLabel="New event"
              successMessage="Event created"
              fields={[
                { name: 'title', label: 'Title', required: true, colSpan: 2, placeholder: 'Annual Sports Day' },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'category', label: 'Category', type: 'select', required: true, defaultValue: 'GENERAL', options: CATEGORIES.map((c) => ({ value: c, label: c.toLowerCase() })) },
                { name: 'startAt', label: 'Starts', type: 'date', required: true },
                { name: 'endAt', label: 'Ends', type: 'date' },
                { name: 'location', label: 'Location', placeholder: 'Main ground' },
                { name: 'requiresRsvp', label: 'Require RSVP', type: 'checkbox', colSpan: 2 },
              ]}
            />
          ) : undefined
        }
      />

      {events.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarDays} title="No events scheduled" description="Add sports days, PTMs, trips and holidays to the school calendar." />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Upcoming</h2>
            <div className="space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled yet.</p>}
              {upcoming.map((e) => (
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
                        <h3 className="text-sm font-semibold text-slate-900">{e.title}</h3>
                        <Badge tone="brand">{e.category.toLowerCase()}</Badge>
                      </div>
                      {e.description && <p className="mt-1 text-sm text-slate-600">{e.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{formatDate(e.startAt, { dateStyle: 'medium' })}</span>
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
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Past events</h2>
            <div className="space-y-2">
              {past.length === 0 && <p className="text-sm text-slate-500">No past events.</p>}
              {past.slice(0, 10).map((e) => (
                <div key={e.id} className="card flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{e.title}</p>
                    <p className="text-xs text-slate-400">{formatDate(e.startAt)}</p>
                  </div>
                  <Badge tone="slate">{e.category.toLowerCase()}</Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
