import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections, listSubjects } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';
import { SearchInput } from '@/components/ui/search-input';
import { AssignmentManager } from './assignment-manager';

export const dynamic = 'force-dynamic';

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSchoolPage('teachers.view');
  const { q } = await searchParams;
  const canManage = session.permissions.includes('teachers.manage');

  const rows = await db
    .select({
      id: t.teachers.id,
      employeeId: t.teachers.employeeId,
      designation: t.teachers.designation,
      qualification: t.teachers.qualification,
      status: t.teachers.status,
      name: t.users.name,
      email: t.users.email,
      phone: t.users.phone,
    })
    .from(t.teachers)
    .innerJoin(t.users, eq(t.users.id, t.teachers.userId))
    .where(and(eq(t.teachers.schoolId, session.schoolId), isNull(t.teachers.deletedAt)))
    .orderBy(asc(t.users.name));

  const filtered = q
    ? rows.filter((r) => `${r.name} ${r.employeeId}`.toLowerCase().includes(q.toLowerCase()))
    : rows;

  const [subjects, sections, assignments] = await Promise.all([
    listSubjects(session.schoolId),
    listSections(session.schoolId),
    db.query.teacherAssignments.findMany({
      where: eq(t.teacherAssignments.schoolId, session.schoolId),
      with: { section: { with: { class: true } }, subject: true },
    }),
  ]);

  const byTeacher = new Map<string, typeof assignments>();
  for (const a of assignments) {
    byTeacher.set(a.teacherId, [...(byTeacher.get(a.teacherId) ?? []), a]);
  }

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Assign teachers to sections and subjects — that assignment is what grants them access."
        action={
          canManage ? (
            <QuickForm
              title="Add a teacher"
              description="Creates a staff login and a teacher profile."
              endpoint="/api/school/teachers"
              triggerLabel="Add teacher"
              successMessage="Teacher added"
              size="lg"
              fields={[
                { name: 'name', label: 'Full name', required: true, placeholder: 'Meera Iyer' },
                { name: 'employeeId', label: 'Employee ID', required: true, placeholder: 'EMP-001' },
                { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'meera@school.edu' },
                { name: 'phone', label: 'Mobile', type: 'tel', required: true, placeholder: '9820000001', maxLength: 10 },
                { name: 'qualification', label: 'Qualification', placeholder: 'M.Sc, B.Ed' },
                { name: 'designation', label: 'Designation', placeholder: 'Senior Teacher' },
                { name: 'joiningDate', label: 'Joining date', type: 'date' },
                { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }, { value: 'OTHER', label: 'Other' }] },
                { name: 'password', label: 'Temporary password', type: 'password', hint: 'Defaults to Password123! if left empty' },
                { name: 'isPrincipal', label: 'Also grant principal access', type: 'checkbox' },
              ]}
            />
          ) : undefined
        }
      />

      <div className="mb-4">
        <SearchInput placeholder="Search teachers…" />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="No teachers found" description="Add your teaching staff so they can mark attendance and enter marks." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Teacher</TH>
              <TH>Employee ID</TH>
              <TH>Contact</TH>
              <TH>Classes and subjects</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((teacher) => {
              const list = byTeacher.get(teacher.id) ?? [];
              return (
                <TR key={teacher.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={teacher.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{teacher.name}</p>
                        <p className="truncate text-xs text-slate-500">{teacher.designation ?? teacher.qualification ?? '—'}</p>
                      </div>
                    </div>
                  </TD>
                  <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{teacher.employeeId}</code></TD>
                  <TD>
                    <p className="text-sm">{teacher.phone ?? '—'}</p>
                    <p className="truncate text-xs text-slate-500">{teacher.email}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1">
                      {list.length === 0 && <span className="text-xs text-slate-400">Not assigned</span>}
                      {list.slice(0, 4).map((a) => (
                        <Badge key={a.id} tone={a.isClassTeacher ? 'green' : 'slate'}>
                          {a.section.class.name}-{a.section.name}
                          {a.subject ? ` · ${a.subject.code}` : ' · class teacher'}
                        </Badge>
                      ))}
                      {list.length > 4 && <Badge tone="slate">+{list.length - 4}</Badge>}
                      {canManage && (
                        <AssignmentManager
                          teacherId={teacher.id}
                          teacherName={teacher.name}
                          assignments={list.map((a) => ({
                            id: a.id,
                            label: `${a.section.class.name}-${a.section.name}${a.subject ? ` · ${a.subject.name}` : ''}`,
                            isClassTeacher: a.isClassTeacher,
                          }))}
                          sections={sections.map((s) => ({ value: s.id, label: s.label }))}
                          subjects={subjects.map((s) => ({ value: s.id, label: s.name }))}
                        />
                      )}
                    </div>
                  </TD>
                  <TD><StatusBadge status={teacher.status} /></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
