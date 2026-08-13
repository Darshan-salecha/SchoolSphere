import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections } from '@/lib/school-data';
import { accessibleSectionIds } from '@/lib/scope';
import { schoolSettingsFor } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { AttendanceBoard } from './attendance-board';

export const dynamic = 'force-dynamic';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; date?: string }>;
}) {
  const session = await requireSchoolPage('attendance.view');
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const date = params.date && params.date <= today ? params.date : today;

  const all = await listSections(session.schoolId);
  const allowed = await accessibleSectionIds(session);
  const sections = allowed === null ? all : all.filter((s) => allowed.includes(s.id));

  const sectionId = params.sectionId && sections.some((s) => s.id === params.sectionId) ? params.sectionId : sections[0]?.id;
  const settings = await schoolSettingsFor(session.schoolId);

  if (!sections.length) {
    return (
      <>
        <PageHeader title="Attendance" />
        <div className="card">
          <EmptyState
            title="No classes assigned to you"
            description="Attendance appears here once you are assigned to a section."
          />
        </div>
      </>
    );
  }

  const students = sectionId
    ? await db
        .select({
          studentId: t.students.id,
          firstName: t.students.firstName,
          lastName: t.students.lastName,
          rollNumber: t.enrollments.rollNumber,
          photoUrl: t.students.photoUrl,
        })
        .from(t.enrollments)
        .innerJoin(t.students, eq(t.students.id, t.enrollments.studentId))
        .where(
          and(
            eq(t.enrollments.schoolId, session.schoolId),
            eq(t.enrollments.sectionId, sectionId),
            eq(t.enrollments.isCurrent, true),
            eq(t.students.status, 'ACTIVE'),
          ),
        )
    : [];

  const existing = sectionId
    ? await db
        .select()
        .from(t.studentAttendance)
        .where(
          and(
            eq(t.studentAttendance.schoolId, session.schoolId),
            eq(t.studentAttendance.sectionId, sectionId),
            eq(t.studentAttendance.date, date),
          ),
        )
    : [];

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark the register, then guardians of absent students are notified automatically."
      />
      <AttendanceBoard
        sections={sections.map((s) => ({ id: s.id, label: s.label }))}
        sectionId={sectionId!}
        date={date}
        students={students.sort((a, b) => (a.rollNumber ?? 999) - (b.rollNumber ?? 999))}
        existing={existing.map((e) => ({ studentId: e.studentId, status: e.status }))}
        canEditPast={session.permissions.includes('attendance.edit')}
        canMark={session.permissions.includes('attendance.mark')}
        editWindowHours={settings?.attendanceEditWindowHours ?? 24}
      />
    </>
  );
}
