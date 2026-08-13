import Link from 'next/link';
import { requireSchoolPage } from '@/lib/page-guards';
import { listAcademicYears, listClasses, listSections, listTeacherOptions } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { SectionTeacherPicker } from './section-teacher-picker';

export const dynamic = 'force-dynamic';

export default async function ClassesPage() {
  const session = await requireSchoolPage('school.classes.manage');
  const [classes, years, teachers] = await Promise.all([
    listClasses(session.schoolId),
    listAcademicYears(session.schoolId),
    listTeacherOptions(session.schoolId),
  ]);
  const currentYear = years.find((y) => y.isCurrent) ?? years[0];
  const sections = currentYear ? await listSections(session.schoolId, currentYear.id) : [];

  const teacherOptions = teachers.map((t) => ({ value: t.id, label: `${t.name} (${t.employeeId})` }));

  return (
    <>
      <PageHeader
        title="Classes and sections"
        description={currentYear ? `Showing the ${currentYear.name} academic year.` : 'Create an academic year first.'}
        action={
          <div className="flex gap-2">
            <QuickForm
              title="Add a class"
              description="A class is a grade level, for example Class 5."
              endpoint="/api/school/classes"
              triggerLabel="Add class"
              variant="outline"
              successMessage="Class created"
              size="sm"
              fields={[
                { name: 'name', label: 'Class name', required: true, placeholder: 'Class 5', colSpan: 2 },
                { name: 'level', label: 'Level', type: 'number', required: true, min: 0, max: 20, hint: 'Used for ordering and promotion', colSpan: 2 },
              ]}
            />
            <QuickForm
              title="Add a section"
              description="Sections hold students, a class teacher and a timetable."
              endpoint="/api/school/sections"
              triggerLabel="Add section"
              successMessage="Section created"
              disabled={!classes.length || !currentYear}
              disabledHint="Add a class and an academic year first"
              fields={[
                { name: 'classId', label: 'Class', type: 'select', required: true, options: classes.map((c) => ({ value: c.id, label: c.name })) },
                { name: 'academicYearId', label: 'Academic year', type: 'select', required: true, defaultValue: currentYear?.id, options: years.map((y) => ({ value: y.id, label: y.name })) },
                { name: 'name', label: 'Section name', required: true, placeholder: 'A', maxLength: 4 },
                { name: 'capacity', label: 'Capacity', type: 'number', defaultValue: 40, min: 1, max: 200 },
                { name: 'roomNumber', label: 'Room number', placeholder: '501' },
                { name: 'classTeacherId', label: 'Class teacher', type: 'select', options: teacherOptions, hint: 'Gets section-wide rights' },
              ]}
            />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader title="Classes" description={`${classes.length} grade level${classes.length === 1 ? '' : 's'}`} />
          <CardBody className="space-y-2">
            {classes.length === 0 && <p className="text-sm text-slate-500">No classes yet.</p>}
            {classes.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                <Badge tone="slate">Level {c.level}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <div className="lg:col-span-3">
          {sections.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No sections in this academic year"
                description="Add a section to start enrolling students and building a timetable."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Section</TH>
                  <TH>Class teacher</TH>
                  <TH>Students</TH>
                  <TH>Room</TH>
                  <TH>Capacity</TH>
                </TR>
              </THead>
              <TBody>
                {sections.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/school/students?sectionId=${s.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {s.label}
                      </Link>
                    </TD>
                    <TD>
                      <SectionTeacherPicker
                        sectionId={s.id}
                        current={s.classTeacherId}
                        options={teacherOptions}
                        currentName={s.classTeacher?.user.name ?? null}
                      />
                    </TD>
                    <TD>
                      <span className={s.studentCount > s.capacity ? 'font-medium text-rose-600' : ''}>{s.studentCount}</span>
                    </TD>
                    <TD>{s.roomNumber ?? '—'}</TD>
                    <TD className="text-slate-500">{s.capacity}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
