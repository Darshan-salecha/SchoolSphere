import Link from 'next/link';
import { Upload } from 'lucide-react';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections } from '@/lib/school-data';
import { listStudents } from '@/lib/services/students';
import { accessibleSectionIds, hasSchoolWideAccess } from '@/lib/scope';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TBody, TD, TH, THead, TR, Pagination } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 20;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sectionId?: string; page?: string }>;
}) {
  const session = await requireSchoolPage('students.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const allSections = await listSections(session.schoolId);
  const allowedSectionIds = await accessibleSectionIds(session);
  const sections = allowedSectionIds === null ? allSections : allSections.filter((s) => allowedSectionIds.includes(s.id));

  const { rows, total } = await listStudents(session, {
    q: params.q,
    sectionId: params.sectionId,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = session.permissions.includes('students.create');
  const query = new URLSearchParams({
    ...(params.q ? { q: params.q } : {}),
    ...(params.sectionId ? { sectionId: params.sectionId } : {}),
  }).toString();

  return (
    <>
      <PageHeader
        title="Students"
        description={
          hasSchoolWideAccess(session)
            ? 'Every enrolled student in your school.'
            : 'Students in the classes you are assigned to.'
        }
        action={
          canCreate ? (
            <div className="flex gap-2">
              {hasSchoolWideAccess(session) && (
                <Link
                  href="/school/students/import"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-4 w-4" /> Bulk import
                </Link>
              )}
              <QuickForm
                title="Add a student"
                description="Creates the student record and enrols them in the current academic year."
                endpoint="/api/school/students"
                triggerLabel="Add student"
                successMessage="Student enrolled"
                size="lg"
                disabled={!sections.length}
                disabledHint="Create a section first"
                fields={[
                  { name: 'admissionNumber', label: 'Admission number', required: true, placeholder: 'DPA-1001' },
                  { name: 'sectionId', label: 'Section', type: 'select', required: true, options: sections.map((s) => ({ value: s.id, label: s.label })) },
                  { name: 'firstName', label: 'First name', required: true },
                  { name: 'lastName', label: 'Last name', required: true },
                  { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
                  { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }] },
                  { name: 'bloodGroup', label: 'Blood group', placeholder: 'O+' },
                  { name: 'rollNumber', label: 'Roll number', type: 'number', min: 1, hint: 'Auto-assigned if left empty' },
                  { name: 'addressLine', label: 'Address', colSpan: 2 },
                  { name: 'city', label: 'City' },
                  { name: 'previousSchool', label: 'Previous school' },
                  { name: 'emergencyContactName', label: 'Emergency contact name' },
                  { name: 'emergencyContactPhone', label: 'Emergency contact phone', type: 'tel', maxLength: 10 },
                ]}
              />
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search by name or admission number…" />
        <div className="flex flex-wrap gap-1">
          <Link
            href="/school/students"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${!params.sectionId ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            All classes
          </Link>
          {sections.map((s) => (
            <Link
              key={s.id}
              href={`/school/students?sectionId=${s.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${params.sectionId === s.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No students here yet"
            description={canCreate ? 'Add your first student, or import a whole class from a spreadsheet.' : 'No students match this view.'}
          />
        </div>
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Admission no.</TH>
                <TH>Class</TH>
                <TH>Roll</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/school/students/${s.id}`} className="flex items-center gap-3">
                      <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} />
                      <span className="font-medium text-slate-900 hover:text-brand-600">
                        {s.firstName} {s.lastName}
                      </span>
                    </Link>
                  </TD>
                  <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.admissionNumber}</code></TD>
                  <TD>{s.className ? `${s.className} — ${s.sectionName}` : 'Not enrolled'}</TD>
                  <TD>{s.rollNumber ?? '—'}</TD>
                  <TD><StatusBadge status={s.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} baseHref={`/school/students?${query}`} />
        </>
      )}
    </>
  );
}
