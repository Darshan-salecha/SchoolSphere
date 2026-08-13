import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatDate, percent } from '@/lib/utils';
import { ClipboardCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ParentAttendancePage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const breakdown = await db
    .select({ status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.studentId, selected.id))
    .groupBy(t.studentAttendance.status);

  const total = breakdown.reduce((a, b) => a + b.value, 0);
  const present = breakdown.filter((b) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(b.status)).reduce((a, b) => a + b.value, 0);
  const absent = breakdown.find((b) => b.status === 'ABSENT')?.value ?? 0;

  const recent = await db
    .select()
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.studentId, selected.id))
    .orderBy(desc(t.studentAttendance.date))
    .limit(40);

  return (
    <>
      <PageHeader title="Attendance" description={`${selected.firstName}'s record for this academic year.`} />
      <ChildSwitcher
        selectedId={selected.id}
        children={children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          photoUrl: c.photoUrl,
          label: currentSection(c) ? `${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : 'Not enrolled',
        }))}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Attendance" value={`${percent(present, total)}%`} sub={`${present} of ${total} days`} icon={ClipboardCheck} tone={percent(present, total) < 75 ? 'red' : 'green'} />
        <StatCard label="Days absent" value={absent} sub="this academic year" tone="amber" />
        <StatCard label="Days recorded" value={total} sub="since enrolment" tone="blue" />
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent days" description="Most recent first" />
        {recent.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">No attendance has been recorded yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Remarks</TH>
              </TR>
            </THead>
            <TBody>
              {recent.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-slate-900">{formatDate(r.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="text-slate-500">{r.remarks ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
