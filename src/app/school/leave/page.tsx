import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { LeaveDecision } from './leave-decision';

export const dynamic = 'force-dynamic';

export default async function LeavePage() {
  const session = await requireSchoolPage('attendance.view');
  const rows = await db.query.leaveRequests.findMany({
    where: eq(t.leaveRequests.schoolId, session.schoolId),
    with: { student: { columns: { firstName: true, lastName: true } }, parent: { with: { user: { columns: { name: true } } } } },
    orderBy: desc(t.leaveRequests.createdAt),
    limit: 100,
  });

  const canDecide = session.permissions.includes('leave.approve');

  return (
    <>
      <PageHeader title="Leave requests" description="Requests raised by parents and staff, with their decision history." />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No leave requests" description="Parent and staff leave requests will appear here for approval." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Requested for</TH>
              <TH>Raised by</TH>
              <TH>Dates</TH>
              <TH>Reason</TH>
              <TH>Status</TH>
              {canDecide && <TH className="text-right">Decision</TH>}
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-slate-900">
                  {r.student ? `${r.student.firstName} ${r.student.lastName}` : 'Staff leave'}
                </TD>
                <TD className="text-slate-500">{r.parent?.user.name ?? '—'}</TD>
                <TD className="whitespace-nowrap">
                  {formatDate(r.fromDate)} – {formatDate(r.toDate)}
                </TD>
                <TD className="max-w-xs truncate text-slate-600">{r.reason}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                {canDecide && (
                  <TD className="text-right">
                    {r.status === 'PENDING' ? <LeaveDecision id={r.id} /> : <span className="text-xs text-slate-400">{formatDate(r.decidedAt)}</span>}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
