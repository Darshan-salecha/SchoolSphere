import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

const DESIGNATIONS = ['Receptionist', 'Accountant', 'Librarian', 'Security', 'Office staff', 'Lab assistant', 'Maintenance', 'Other'];

export default async function StaffPage() {
  const session = await requireSchoolPage('staff.view');
  const rows = await db
    .select({
      id: t.staff.id,
      employeeId: t.staff.employeeId,
      designation: t.staff.designation,
      department: t.staff.department,
      status: t.staff.status,
      name: t.users.name,
      email: t.users.email,
      phone: t.users.phone,
    })
    .from(t.staff)
    .innerJoin(t.users, eq(t.users.id, t.staff.userId))
    .where(and(eq(t.staff.schoolId, session.schoolId), isNull(t.staff.deletedAt)))
    .orderBy(asc(t.users.name));

  return (
    <>
      <PageHeader
        title="Staff"
        description="Non-teaching staff with narrow, role-specific access."
        action={
          session.permissions.includes('staff.manage') ? (
            <QuickForm
              title="Add a staff member"
              endpoint="/api/school/staff"
              triggerLabel="Add staff"
              successMessage="Staff member added"
              fields={[
                { name: 'name', label: 'Full name', required: true },
                { name: 'employeeId', label: 'Employee ID', required: true, placeholder: 'STF-001' },
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'phone', label: 'Mobile', type: 'tel', required: true, maxLength: 10 },
                { name: 'designation', label: 'Designation', type: 'select', required: true, options: DESIGNATIONS.map((d) => ({ value: d, label: d })) },
                { name: 'department', label: 'Department', placeholder: 'Front office' },
                { name: 'password', label: 'Temporary password', type: 'password', hint: 'Defaults to Password123!', colSpan: 2 },
              ]}
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No staff added yet" description="Add receptionists, accountants, librarians and other support staff." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Staff member</TH>
              <TH>Employee ID</TH>
              <TH>Designation</TH>
              <TH>Department</TH>
              <TH>Contact</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} />
                    <span className="font-medium text-slate-900">{s.name}</span>
                  </div>
                </TD>
                <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.employeeId}</code></TD>
                <TD>{s.designation ?? '—'}</TD>
                <TD className="text-slate-500">{s.department ?? '—'}</TD>
                <TD>
                  <p className="text-sm">{s.phone ?? '—'}</p>
                  <p className="truncate text-xs text-slate-500">{s.email}</p>
                </TD>
                <TD><StatusBadge status={s.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
