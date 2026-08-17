import Link from 'next/link';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { Building2, GraduationCap, Wallet, AlertTriangle } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Usage against plan, per tenant.
 *
 * This is the page that tells the platform who is about to outgrow their plan —
 * the commercial signal that matters most in a per-seat SaaS.
 */
export default async function UsagePage() {
  await requirePagePermission('platform.analytics.view', 'platform.schools.view');

  const schools = await db.query.schools.findMany({
    where: isNull(t.schools.deletedAt),
    with: { subscription: { with: { plan: true } } },
    orderBy: desc(t.schools.createdAt),
  });

  const [students, teachers] = await Promise.all([
    db
      .select({ schoolId: t.students.schoolId, value: count() })
      .from(t.students)
      .where(isNull(t.students.deletedAt))
      .groupBy(t.students.schoolId),
    db
      .select({ schoolId: t.teachers.schoolId, value: count() })
      .from(t.teachers)
      .where(isNull(t.teachers.deletedAt))
      .groupBy(t.teachers.schoolId),
  ]);
  const studentMap = new Map(students.map((r) => [r.schoolId, r.value]));
  const teacherMap = new Map(teachers.map((r) => [r.schoolId, r.value]));

  const rows = schools.map((school) => {
    const plan = school.subscription?.plan;
    const studentCount = studentMap.get(school.id) ?? 0;
    const teacherCount = teacherMap.get(school.id) ?? 0;
    return {
      school,
      plan,
      studentCount,
      teacherCount,
      studentsPercent: plan ? Math.round((studentCount / plan.maxStudents) * 100) : 0,
      teachersPercent: plan ? Math.round((teacherCount / plan.maxTeachers) * 100) : 0,
    };
  });

  const nearLimit = rows.filter((r) => r.studentsPercent >= 80 || r.teachersPercent >= 80);
  const mrr = schools
    .filter((s) => s.subscription?.status === 'ACTIVE')
    .reduce((sum, s) => sum + (s.subscription?.plan?.priceMonthly ?? 0), 0);

  const invoices = await db
    .select()
    .from(t.platformInvoices)
    .orderBy(desc(t.platformInvoices.createdAt))
    .limit(20);

  return (
    <>
      <PageHeader title="Usage and billing" description="What each school consumes against the plan they pay for." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Schools" value={schools.length} icon={Building2} />
        <StatCard label="Total students" value={[...studentMap.values()].reduce((a, b) => a + b, 0)} icon={GraduationCap} tone="blue" />
        <StatCard label="Monthly recurring" value={formatCurrency(mrr)} icon={Wallet} tone="green" />
        <StatCard label="Near plan limit" value={nearLimit.length} sub="at 80% or above" icon={AlertTriangle} tone={nearLimit.length ? 'amber' : 'green'} />
      </div>

      <Card className="mt-5">
        <CardHeader title="Consumption by school" description="Upgrade conversations start here" />
        <Table>
          <THead>
            <TR>
              <TH>School</TH>
              <TH>Plan</TH>
              <TH>Students</TH>
              <TH>Teachers</TH>
              <TH>Status</TH>
              <TH>Last active</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.school.id}>
                <TD>
                  <Link href={`/platform/schools/${r.school.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {r.school.name}
                  </Link>
                  <p className="text-xs text-slate-500">{r.school.code}</p>
                </TD>
                <TD>{r.plan ? <Badge tone="brand">{r.plan.name}</Badge> : '—'}</TD>
                <TD>
                  <span className="flex items-center gap-2">
                    <span className={cn('text-sm', r.studentsPercent >= 100 ? 'font-semibold text-rose-600' : 'text-slate-900')}>
                      {r.studentCount}
                      {r.plan ? ` / ${r.plan.maxStudents}` : ''}
                    </span>
                    {r.plan && (
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={cn('block h-full rounded-full', r.studentsPercent >= 100 ? 'bg-rose-500' : r.studentsPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500')}
                          style={{ width: `${Math.min(100, r.studentsPercent)}%` }}
                        />
                      </span>
                    )}
                  </span>
                </TD>
                <TD>
                  <span className={cn('text-sm', r.teachersPercent >= 100 ? 'font-semibold text-rose-600' : 'text-slate-900')}>
                    {r.teacherCount}
                    {r.plan ? ` / ${r.plan.maxTeachers}` : ''}
                  </span>
                </TD>
                <TD><StatusBadge status={r.school.subscription?.status ?? 'CANCELLED'} /></TD>
                <TD className="text-slate-500">{r.school.lastActiveAt ? formatDate(r.school.lastActiveAt) : 'Never'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Invoices" description="Platform billing history" />
        {invoices.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">
              No invoices raised yet. Connect a billing provider through the payment abstraction to issue them
              automatically at the end of each period.
            </p>
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Period</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD><code className="text-xs">{i.number}</code></TD>
                  <TD className="whitespace-nowrap">{formatDate(i.periodStart)} – {formatDate(i.periodEnd)}</TD>
                  <TD>{formatCurrency(i.amount, i.currency)}</TD>
                  <TD><StatusBadge status={i.status === 'DUE' ? 'PENDING' : i.status === 'PAID' ? 'PAID' : 'CANCELLED'} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
