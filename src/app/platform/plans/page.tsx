import { asc, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Check } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  await requirePagePermission('platform.plans.manage');
  const plans = await db.select().from(t.plans).orderBy(asc(t.plans.priceMonthly));
  const counts = await db
    .select({ planId: t.subscriptions.planId, value: count() })
    .from(t.subscriptions)
    .groupBy(t.subscriptions.planId);
  const countMap = new Map(counts.map((c) => [c.planId, c.value]));

  return (
    <>
      <PageHeader title="Plans" description="Feature and usage limits available to schools." />
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardBody className="flex flex-1 flex-col">
              <div className="flex items-start justify-between">
                <h2 className="text-base font-semibold text-slate-900">{p.name}</h2>
                {p.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Retired</Badge>}
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                {formatCurrency(p.priceMonthly, p.currency)}
                <span className="text-sm font-normal text-slate-500">/month</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {countMap.get(p.id) ?? 0} school{(countMap.get(p.id) ?? 0) === 1 ? '' : 's'} subscribed
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" /> Up to {p.maxStudents.toLocaleString('en-IN')} students
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" /> Up to {p.maxTeachers} teachers
                </li>
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 capitalize">
                    <Check className="h-4 w-4 text-emerald-600" /> {f}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
