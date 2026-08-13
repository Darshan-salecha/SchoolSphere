import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listAcademicYears } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const EXAM_TYPES = ['UNIT_TEST', 'MID_TERM', 'FINAL', 'PRACTICAL', 'PRE_BOARD'];

export default async function ExamsPage() {
  const session = await requireSchoolPage('exams.view');
  const years = await listAcademicYears(session.schoolId);
  const currentYear = years.find((y) => y.isCurrent) ?? years[0];

  const exams = await db.query.exams.findMany({
    where: eq(t.exams.schoolId, session.schoolId),
    with: { academicYear: true, subjects: { columns: { id: true } } },
    orderBy: desc(t.exams.startDate),
  });

  return (
    <>
      <PageHeader
        title="Exams"
        description="Create an exam, add its papers, then teachers enter marks."
        action={
          session.permissions.includes('exams.manage') ? (
            <QuickForm
              title="Create an exam"
              endpoint="/api/school/exams"
              triggerLabel="New exam"
              successMessage="Exam created"
              disabled={!years.length}
              disabledHint="Create an academic year first"
              fields={[
                { name: 'name', label: 'Exam name', required: true, placeholder: 'Unit Test 1', colSpan: 2 },
                { name: 'academicYearId', label: 'Academic year', type: 'select', required: true, defaultValue: currentYear?.id, options: years.map((y) => ({ value: y.id, label: y.name })) },
                { name: 'type', label: 'Type', type: 'select', required: true, defaultValue: 'UNIT_TEST', options: EXAM_TYPES.map((v) => ({ value: v, label: v.replaceAll('_', ' ').toLowerCase() })) },
                { name: 'startDate', label: 'Starts', type: 'date', required: true },
                { name: 'endDate', label: 'Ends', type: 'date', required: true },
                { name: 'weightage', label: 'Weightage (%)', type: 'number', defaultValue: 100, min: 1, max: 100, colSpan: 2 },
              ]}
            />
          ) : undefined
        }
      />

      {exams.length === 0 ? (
        <div className="card">
          <EmptyState title="No exams yet" description="Create your first exam to schedule papers and collect marks." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Exam</TH>
              <TH>Academic year</TH>
              <TH>Dates</TH>
              <TH>Papers</TH>
              <TH>Weightage</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {exams.map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`/school/exams/${e.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {e.name}
                  </Link>
                  <p className="text-xs capitalize text-slate-500">{e.type.replaceAll('_', ' ').toLowerCase()}</p>
                </TD>
                <TD>{e.academicYear.name}</TD>
                <TD className="whitespace-nowrap text-slate-500">
                  {formatDate(e.startDate)} – {formatDate(e.endDate)}
                </TD>
                <TD>{e.subjects.length}</TD>
                <TD>{e.weightage}%</TD>
                <TD><StatusBadge status={e.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
