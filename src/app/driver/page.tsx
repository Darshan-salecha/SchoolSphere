import { and, eq } from 'drizzle-orm';
import { Bus, Route as RouteIcon, LogOut } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

/**
 * Driver portal — deliberately minimal and touch-first. Live GPS, trip control
 * and boarding marks land in phase 6; the data model behind them already exists.
 */
export default async function DriverHome() {
  const session = await requireSchoolPage('portal.driver');

  const routes = await db.query.routes.findMany({
    where: and(eq(t.routes.schoolId, session.schoolId), eq(t.routes.driverId, session.driverId!)),
    with: { bus: true, stops: true },
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Hello, {session.name.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500">{session.schoolName}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </header>

      {routes.length === 0 ? (
        <div className="card">
          <EmptyState icon={RouteIcon} title="No route assigned" description="The school office will assign you a bus and route." />
        </div>
      ) : (
        <div className="space-y-4">
          {routes.map((r) => (
            <Card key={r.id}>
              <CardHeader
                title={r.name}
                description={r.bus ? `${r.bus.busNumber} · ${r.bus.registrationNumber ?? ''}` : 'No bus assigned'}
                action={<Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? 'active' : 'inactive'}</Badge>}
              />
              <CardBody>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Bus className="h-4 w-4" /> {r.stops.length} stops
                </p>
                <ol className="space-y-2">
                  {r.stops
                    .sort((a, b) => a.order - b.order)
                    .map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3">
                        <span className="text-sm font-medium text-slate-900">
                          {s.order}. {s.name}
                        </span>
                        <span className="text-xs text-slate-500">{s.pickupTime ?? ''}</span>
                      </li>
                    ))}
                </ol>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
