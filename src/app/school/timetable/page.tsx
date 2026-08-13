import { requireSchoolPage } from '@/lib/page-guards';
import { listSections, listSubjects, listTeacherOptions } from '@/lib/school-data';
import { listPeriods, sectionTimetable } from '@/lib/services/timetable';
import { accessibleSectionIds } from '@/lib/scope';
import { PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { QuickForm } from '@/components/forms/quick-form';
import { TimetableGrid } from './timetable-grid';

export const dynamic = 'force-dynamic';

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ sectionId?: string }> }) {
  const session = await requireSchoolPage('timetable.view');
  const params = await searchParams;

  const all = await listSections(session.schoolId);
  const allowed = await accessibleSectionIds(session);
  const sections = allowed === null ? all : all.filter((s) => allowed.includes(s.id));
  const sectionId = params.sectionId && sections.some((s) => s.id === params.sectionId) ? params.sectionId : sections[0]?.id;

  const [periods, subjects, teachers] = await Promise.all([
    listPeriods(session.schoolId),
    listSubjects(session.schoolId),
    listTeacherOptions(session.schoolId),
  ]);
  const slots = sectionId ? await sectionTimetable(session.schoolId, sectionId) : [];
  const canManage = session.permissions.includes('timetable.manage');

  if (!sections.length) {
    return (
      <>
        <PageHeader title="Timetable" />
        <div className="card">
          <EmptyState title="No sections available" description="Create a class and section before building a timetable." />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Timetable"
        description="Clashes are blocked automatically — a teacher can't be in two classes at once."
        action={
          canManage ? (
            <QuickForm
              title="Add a period"
              description="Periods form the rows of every class timetable."
              endpoint="/api/school/timetable"
              method="PUT"
              triggerLabel="Add period"
              variant="outline"
              successMessage="Period saved"
              fields={[
                { name: 'name', label: 'Name', required: true, placeholder: 'Period 1' },
                { name: 'order', label: 'Order', type: 'number', required: true, min: 1, max: 20 },
                { name: 'startTime', label: 'Start time', required: true, placeholder: '08:00', hint: 'HH:MM' },
                { name: 'endTime', label: 'End time', required: true, placeholder: '08:45', hint: 'HH:MM' },
                { name: 'isBreak', label: 'This is a break', type: 'checkbox', colSpan: 2 },
              ]}
            />
          ) : undefined
        }
      />

      {periods.length === 0 ? (
        <div className="card">
          <EmptyState title="No periods defined" description="Add the school's period structure first — for example Period 1, break, lunch." />
        </div>
      ) : (
        <TimetableGrid
          sections={sections.map((s) => ({ id: s.id, label: s.label }))}
          sectionId={sectionId!}
          periods={periods}
          slots={slots.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            periodId: s.periodId,
            subjectId: s.subjectId,
            subjectName: s.subject?.name ?? null,
            teacherId: s.teacherId,
            teacherName: s.teacher?.user.name ?? null,
            room: s.room,
          }))}
          subjects={subjects.map((s) => ({ value: s.id, label: s.name }))}
          teachers={teachers.map((t) => ({ value: t.id, label: t.name }))}
          canManage={canManage}
        />
      )}
    </>
  );
}
