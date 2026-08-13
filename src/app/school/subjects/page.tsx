import { requireSchoolPage } from '@/lib/page-guards';
import { listClasses, listSubjects } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

export default async function SubjectsPage() {
  const session = await requireSchoolPage('school.subjects.manage');
  const [subjects, classes] = await Promise.all([listSubjects(session.schoolId), listClasses(session.schoolId)]);
  const classMap = new Map(classes.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects drive the timetable, homework, exams and marks entry."
        action={
          <QuickForm
            title="Add a subject"
            endpoint="/api/school/subjects"
            triggerLabel="Add subject"
            successMessage="Subject created"
            fields={[
              { name: 'name', label: 'Subject name', required: true, placeholder: 'Mathematics' },
              { name: 'code', label: 'Code', required: true, placeholder: 'MAT', maxLength: 16, hint: 'Unique within your school' },
              { name: 'classId', label: 'Restrict to class', type: 'select', options: classes.map((c) => ({ value: c.id, label: c.name })), hint: 'Leave empty to offer it to every class' },
              { name: 'isElective', label: 'This is an elective', type: 'checkbox' },
            ]}
          />
        }
      />

      {subjects.length === 0 ? (
        <div className="card">
          <EmptyState title="No subjects yet" description="Add the subjects your school teaches to unlock the timetable and exams." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Subject</TH>
              <TH>Code</TH>
              <TH>Class</TH>
              <TH>Type</TH>
            </TR>
          </THead>
          <TBody>
            {subjects.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium text-slate-900">{s.name}</TD>
                <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.code}</code></TD>
                <TD>{s.classId ? classMap.get(s.classId) ?? '—' : 'All classes'}</TD>
                <TD>{s.isElective ? <Badge tone="purple">Elective</Badge> : <Badge tone="slate">Core</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
