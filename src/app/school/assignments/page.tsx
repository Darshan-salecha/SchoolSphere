import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections, listSubjects } from '@/lib/school-data';
import { accessibleSectionIds } from '@/lib/scope';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  const session = await requireSchoolPage('assignments.view');
  const all = await listSections(session.schoolId);
  const allowed = await accessibleSectionIds(session);
  const sections = allowed === null ? all : all.filter((s) => allowed.includes(s.id));
  const subjects = await listSubjects(session.schoolId);

  const rows = sections.length
    ? await db.query.assignments.findMany({
        where: and(
          eq(t.assignments.schoolId, session.schoolId),
          inArray(t.assignments.sectionId, sections.map((s) => s.id)),
        ),
        with: {
          section: { with: { class: true } },
          subject: true,
          teacher: { with: { user: { columns: { name: true } } } },
          submissions: { columns: { id: true, status: true } },
        },
        orderBy: desc(t.assignments.dueDate),
        limit: 100,
      })
    : [];

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Graded work with due dates, submissions and feedback."
        action={
          session.permissions.includes('assignments.manage') ? (
            <QuickForm
              title="Create an assignment"
              endpoint="/api/school/assignments"
              triggerLabel="New assignment"
              successMessage="Assignment created"
              size="lg"
              disabled={!sections.length || !subjects.length}
              disabledHint="You need a section and a subject first"
              fields={[
                { name: 'sectionId', label: 'Class', type: 'select', required: true, options: sections.map((s) => ({ value: s.id, label: s.label })) },
                { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
                { name: 'title', label: 'Title', required: true, colSpan: 2 },
                { name: 'description', label: 'Brief', type: 'textarea', required: true },
                { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, defaultValue: 20, min: 1, max: 500 },
                { name: 'dueDate', label: 'Due date', type: 'date', required: true },
                { name: 'allowLate', label: 'Accept late submissions', type: 'checkbox', defaultValue: true, colSpan: 2 },
              ]}
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No assignments yet" description="Create an assignment to collect and grade student work." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Assignment</TH>
              <TH>Class</TH>
              <TH>Subject</TH>
              <TH>Marks</TH>
              <TH>Due</TH>
              <TH>Submitted</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((a) => {
              const submitted = a.submissions.filter((s) => s.status !== 'PENDING').length;
              return (
                <TR key={a.id}>
                  <TD>
                    <p className="font-medium text-slate-900">{a.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{a.description}</p>
                  </TD>
                  <TD>{a.section.class.name}-{a.section.name}</TD>
                  <TD><Badge tone="slate">{a.subject.name}</Badge></TD>
                  <TD>{a.maxMarks}</TD>
                  <TD>{formatDate(a.dueDate)}</TD>
                  <TD>
                    {submitted} / {a.submissions.length || '—'}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
