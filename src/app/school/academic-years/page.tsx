import { requireSchoolPage } from '@/lib/page-guards';
import { listAcademicYears } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { YearActions } from './year-actions';

export const dynamic = 'force-dynamic';

export default async function AcademicYearsPage() {
  const session = await requireSchoolPage('school.academicyears.manage');
  const years = await listAcademicYears(session.schoolId);
  const thisYear = new Date().getFullYear();

  return (
    <>
      <PageHeader
        title="Academic years"
        description="Everything — enrolment, exams, fees — is scoped to an academic year."
        action={
          <QuickForm
            title="Add an academic year"
            description="Marking a year as current moves new enrolments and exams into it."
            endpoint="/api/school/academic-years"
            triggerLabel="Add year"
            successMessage="Academic year created"
            fields={[
              { name: 'name', label: 'Name', required: true, placeholder: `${thisYear}-${String(thisYear + 1).slice(2)}`, hint: 'For example 2026-27' },
              { name: 'startDate', label: 'Start date', type: 'date', required: true, defaultValue: `${thisYear}-04-01` },
              { name: 'endDate', label: 'End date', type: 'date', required: true, defaultValue: `${thisYear + 1}-03-31` },
              { name: 'isCurrent', label: 'Make this the current academic year', type: 'checkbox', colSpan: 2 },
            ]}
          />
        }
      />

      {years.length === 0 ? (
        <div className="card">
          <EmptyState title="No academic years yet" description="Add your first academic year to start creating classes and enrolling students." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Year</TH>
              <TH>Starts</TH>
              <TH>Ends</TH>
              <TH>State</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {years.map((y) => (
              <TR key={y.id}>
                <TD className="font-medium text-slate-900">{y.name}</TD>
                <TD>{formatDate(y.startDate)}</TD>
                <TD>{formatDate(y.endDate)}</TD>
                <TD>
                  {y.isCurrent ? <Badge tone="green">Current</Badge> : y.isArchived ? <Badge tone="slate">Archived</Badge> : <Badge tone="blue">Upcoming</Badge>}
                </TD>
                <TD className="text-right">
                  <YearActions id={y.id} isCurrent={y.isCurrent} isArchived={y.isArchived} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
