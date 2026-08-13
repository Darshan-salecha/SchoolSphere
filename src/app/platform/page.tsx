import Link from 'next/link';
import { count, desc, eq, isNull, sql } from 'drizzle-orm';
import { Building2, GraduationCap, UserCog, Wallet, Plus } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { DonutChart } from '@/components/charts/simple-charts';
import { EmptyState } from '@/components/ui/states';
import { formatCurrency, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PlatformDashboard() {
  await requirePagePermission('platform.schools.view', 'platform.analytics.view');

  const [[{ value: schoolCount }], [{ value: studentCount }], [{ value: teacherCount }]] = await Promise.all([
    db.select({ value: count() }).from(t.schools).where(isNull(t.schools.deletedAt)),
    db.select({ value: count() }).from(t.students).where(isNull(t.students.deletedAt)),
    db.select({ value: count() }).from(t.teachers).where(isNull(t.teachers.deletedAt)),
  ]);

  const byStatus = await db
    .select({ status: t.schools.status, value: count() })
    .from(t.schools)
    .where(isNull(t.schools.deletedAt))
    .groupBy(t.schools.status);

  const subs = await db.query.subscriptions.findMany({ with: { plan: true, school: { columns: { name: true } } } });
  const mrr = subs.filter((s) => s.status === 'ACTIVE').reduce((sum, s) => sum + (s.plan?.priceMonthly ?? 0), 0);

  const recent = await db.query.schools.findMany({
    where: isNull(t.schools.deletedAt),
    with: { subscription: { with: { plan: true } } },
    orderBy: desc(t.schools.createdAt),
    limit: 6,
  });

  const studentsBySchool = await db
    .select({ schoolId: t.students.schoolId, value: count() })
    .from(t.students)
    .groupBy(t.students.schoolId);
  const studentMap = new Map(studentsBySchool.map((r) => [r.schoolId, r.value]));

  const planMix = subs.reduce<Record<string, number>>((acc, s) => {
    const name = s.plan?.name ?? 'Unassigned';
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});

  const openTickets = await db
    .select({ value: count() })
    .from(t.supportTickets)
    .where(eq(t.supportTickets.status, 'OPEN'));

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Every school on SchoolSphere, at a glance."
        action={
          <Link
            href="/platform/schools/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Onboard a school
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Schools" value={schoolCount} sub={`${byStatus.find((s) => s.status === 'ACTIVE')?.value ?? 0} active`} icon={Building2} />
        <StatCard label="Students" value={studentCount.toLocaleString('en-IN')} sub="across all tenants" icon={GraduationCap} tone="blue" />
        <StatCard label="Teachers" value={teacherCount.toLocaleString('en-IN')} sub="across all tenants" icon={UserCog} tone="green" />
        <StatCard label="Monthly recurring" value={formatCurrency(mrr)} sub={`${subs.filter((s) => s.status === 'ACTIVE').length} paying schools`} icon={Wallet} tone="amber" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recently onboarded" description="Newest tenants first" action={<Link href="/platform/schools" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>} />
          {recent.length === 0 ? (
            <EmptyState title="No schools yet" description="Onboard your first school to get started." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>School</TH>
                  <TH>Plan</TH>
                  <TH>Students</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {recent.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/platform/schools/${s.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {s.name}
                      </Link>
                      <p className="text-xs text-slate-500">{s.code}{s.city ? ` · ${s.city}` : ''}</p>
                    </TD>
                    <TD>{s.subscription?.plan ? <Badge tone="brand">{s.subscription.plan.name}</Badge> : '—'}</TD>
                    <TD>{studentMap.get(s.id) ?? 0}</TD>
                    <TD><StatusBadge status={s.status} /></TD>
                    <TD className="text-slate-500">{formatDate(s.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Plan mix" description="Subscriptions by plan" />
            <CardBody>
              <DonutChart data={Object.entries(planMix).map(([name, value]) => ({ name, value }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="System health" />
            <CardBody className="space-y-3 text-sm">
              {byStatus.map((s) => (
                <div key={s.status} className="flex items-center justify-between">
                  <StatusBadge status={s.status} />
                  <span className="font-medium text-slate-900">{s.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-slate-600">Open support tickets</span>
                <span className="font-medium text-slate-900">{openTickets[0]?.value ?? 0}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
