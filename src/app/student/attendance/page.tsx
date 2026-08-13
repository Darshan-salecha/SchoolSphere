import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { studentContext } from '@/lib/student-context';
import { PageHeader } from '@/components/ui/page';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate, percent } from '@/lib/utils';
import { ClipboardCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StudentAttendancePage() {
  const session = await requireSchoolPage('portal.student');
  const { student } = await studentContext(session);
  if (!student) return <EmptyState title="Record unavailable" description="Please contact the school office." />;

  const breakdown = await db
    .select({ status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.studentId, student.id))
    .groupBy(t.studentAttendance.status);
  const total = breakdown.reduce((a, b) => a + b.value, 0);
  const present = breakdown.filter((b) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(b.status)).reduce((a, b) => a + b.value, 0);

  const recent = await db
    .select()
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.studentId, student.id))
    .orderBy(desc(t.studentAttendance.date))
    .limit(40);

  return (
    <>
      <PageHeader title="My attendance" />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Attendance" value={`${percent(present, total)}%`} icon={ClipboardCheck} tone={percent(present, total) < 75 ? 'amber' : 'green'} />
        <StatCard label="Days present" value={present} tone="blue" />
        <StatCard label="Days recorded" value={total} />
      </div>
      <Card className="mt-5">
        <CardHeader title="Recent days" />
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {recent.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-slate-900">{formatDate(r.date, { weekday: 'short', day: '2-digit', month: 'short' })}</TD>
                <TD><StatusBadge status={r.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
