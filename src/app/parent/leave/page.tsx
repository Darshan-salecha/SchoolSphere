import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ParentLeavePage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);

  const rows = await db.query.leaveRequests.findMany({
    where: eq(t.leaveRequests.parentId, session.parentId!),
    with: { student: { columns: { firstName: true, lastName: true } } },
    orderBy: desc(t.leaveRequests.createdAt),
    limit: 40,
  });

  return (
    <>
      <PageHeader
        title="Leave requests"
        description="Ask the class teacher for leave and track the decision."
        action={
          children.length ? (
            <QuickForm
              title="Request leave"
              description="The class teacher is notified and will approve or decline."
              endpoint="/api/school/leave"
              triggerLabel="Request leave"
              successMessage="Leave request submitted"
              fields={[
                {
                  name: 'studentId',
                  label: 'Child',
                  type: 'select',
                  required: true,
                  defaultValue: selected?.id,
                  colSpan: 2,
                  options: children.map((c) => ({
                    value: c.id,
                    label: `${c.firstName} ${c.lastName}${currentSection(c) ? ` — ${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : ''}`,
                  })),
                },
                { name: 'fromDate', label: 'From', type: 'date', required: true },
                { name: 'toDate', label: 'To', type: 'date', required: true },
                { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Family function out of town' },
              ]}
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No leave requests yet" description="Requests you submit and their decisions appear here." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Child</TH>
              <TH>Dates</TH>
              <TH>Reason</TH>
              <TH>Status</TH>
              <TH>Decision note</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-slate-900">
                  {r.student ? `${r.student.firstName} ${r.student.lastName}` : '—'}
                </TD>
                <TD className="whitespace-nowrap">
                  {formatDate(r.fromDate)} – {formatDate(r.toDate)}
                </TD>
                <TD className="max-w-xs truncate text-slate-600">{r.reason}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD className="text-slate-500">{r.decisionNote ?? '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
