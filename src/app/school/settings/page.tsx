import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSchoolPage('school.settings.view');
  const school = await db.query.schools.findFirst({
    where: eq(t.schools.id, session.schoolId),
    with: { settings: true, subscription: { with: { plan: true } } },
  });
  if (!school) return null;

  const canManage = session.permissions.includes('school.settings.manage');

  return (
    <>
      <PageHeader title="School settings" description="Attendance rules, notifications and subscription." />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SettingsForm
            canManage={canManage}
            settings={{
              attendanceEditWindowHours: school.settings?.attendanceEditWindowHours ?? 24,
              lowAttendanceThreshold: school.settings?.lowAttendanceThreshold ?? 75,
              notifyParentOnAbsence: school.settings?.notifyParentOnAbsence ?? true,
              studentLoginEnabled: school.settings?.studentLoginEnabled ?? false,
              parentOtpEnabled: school.settings?.parentOtpEnabled ?? true,
              resultsRequireApproval: school.settings?.resultsRequireApproval ?? true,
              primaryColor: school.settings?.primaryColor ?? '#4f46e5',
              accentColor: school.settings?.accentColor ?? '#0ea5e9',
            }}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="School profile" />
            <CardBody className="space-y-3 text-sm">
              {[
                ['Name', school.name],
                ['School ID', school.code],
                ['Portal path', `/school/${school.slug}`],
                ['Board', school.board ?? '—'],
                ['Medium', school.medium ?? '—'],
                ['Timezone', school.timezone],
                ['Principal', school.principalName ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-slate-600">{label}</span>
                  <span className="text-right font-medium text-slate-900">{value}</span>
                </div>
              ))}
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                Contact platform support to change your school&apos;s name, address or board.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Subscription" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Plan</span>
                <Badge tone="brand">{school.subscription?.plan?.name ?? 'None'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Status</span>
                <StatusBadge status={school.subscription?.status ?? 'CANCELLED'} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Price</span>
                <span className="font-medium">
                  {school.subscription?.plan ? `${formatCurrency(school.subscription.plan.priceMonthly)}/mo` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Student limit</span>
                <span className="font-medium">{school.subscription?.plan?.maxStudents.toLocaleString('en-IN') ?? '—'}</span>
              </div>
              {school.subscription?.trialEndsAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Trial ends</span>
                  <span>{formatDate(school.subscription.trialEndsAt)}</span>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
