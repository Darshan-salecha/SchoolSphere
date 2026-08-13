import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { ArrowLeft, GraduationCap, UserCog, Users, Layers } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { schoolUsage } from '@/lib/services/schools';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { SchoolActions } from './school-actions';

export const dynamic = 'force-dynamic';

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission('platform.schools.view');
  const { id } = await params;

  const school = await db.query.schools.findFirst({
    where: eq(t.schools.id, id),
    with: { subscription: { with: { plan: true } }, settings: true },
  });
  if (!school) notFound();

  const usage = await schoolUsage(school.id);
  const admins = await db.query.users.findMany({
    where: eq(t.users.schoolId, school.id),
    with: { roles: true },
    limit: 50,
  });
  const schoolAdmins = admins.filter((u) => u.roles.some((r) => r.role === 'SCHOOL_ADMIN' || r.role === 'PRINCIPAL'));

  const audit = await db.query.auditLogs.findMany({
    where: eq(t.auditLogs.schoolId, school.id),
    orderBy: desc(t.auditLogs.createdAt),
    limit: 8,
  });

  const plan = school.subscription?.plan;
  const canManage = session.permissions.includes('platform.schools.manage');

  return (
    <>
      <Link href="/platform/schools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All schools
      </Link>

      <PageHeader
        title={school.name}
        description={`${school.code} · ${[school.city, school.state].filter(Boolean).join(', ') || 'Location not set'}`}
        action={canManage ? <SchoolActions schoolId={school.id} status={school.status} /> : <StatusBadge status={school.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={usage.students} sub={plan ? `of ${plan.maxStudents.toLocaleString('en-IN')} allowed` : undefined} icon={GraduationCap} />
        <StatCard label="Teachers" value={usage.teachers} sub={plan ? `of ${plan.maxTeachers} allowed` : undefined} icon={UserCog} tone="green" />
        <StatCard label="Parents" value={usage.parents} icon={Users} tone="blue" />
        <StatCard label="Sections" value={usage.sections} sub={`${usage.staff} support staff`} icon={Layers} tone="amber" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="School profile" />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ['Status', <StatusBadge key="s" status={school.status} />],
                ['Board', school.board ?? '—'],
                ['Type', school.schoolType ?? '—'],
                ['Medium', school.medium ?? '—'],
                ['Principal', school.principalName ?? '—'],
                ['Email', school.email ?? '—'],
                ['Phone', school.phone ?? '—'],
                ['Website', school.website ?? '—'],
                ['Timezone', school.timezone],
                ['Portal address', `/school/${school.slug}`],
                ['Registration no.', school.registrationNumber ?? '—'],
                ['Setup', school.setupCompleted ? 'Complete' : `Step ${school.setupStep} of 13`],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label as string}</dt>
                  <dd className="mt-1 text-sm text-slate-900">{value as React.ReactNode}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Subscription" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Plan</span>
                <Badge tone="brand">{plan?.name ?? 'None'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Status</span>
                <StatusBadge status={school.subscription?.status ?? 'CANCELLED'} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Price</span>
                <span className="font-medium">{plan ? `${formatCurrency(plan.priceMonthly)}/mo` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Renews</span>
                <span>{formatDate(school.subscription?.currentPeriodEnd)}</span>
              </div>
              {school.subscription?.trialEndsAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Trial ends</span>
                  <span>{formatDate(school.subscription.trialEndsAt)}</span>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="School administrators" />
            <CardBody className="space-y-3">
              {schoolAdmins.length === 0 && <p className="text-sm text-slate-500">No administrators yet.</p>}
              {schoolAdmins.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  <Badge tone="slate">{u.roles.map((r) => r.role.replace('_', ' ').toLowerCase()).join(', ')}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent activity" description="Audit trail for this tenant" />
        {audit.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">No recorded activity yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
              </TR>
            </THead>
            <TBody>
              {audit.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-slate-500">{formatDate(a.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</TD>
                  <TD>{a.actorName ?? 'system'}</TD>
                  <TD><code className="text-xs">{a.action}</code></TD>
                  <TD className="text-slate-500">{a.entity}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
