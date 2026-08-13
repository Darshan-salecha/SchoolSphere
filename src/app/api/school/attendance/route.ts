import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody, parseQuery } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { attendanceMarkSchema } from '@/lib/validation/schemas';
import { assertCanAccessSection, hasSchoolWideAccess } from '@/lib/scope';
import { assertSameSchool, schoolSettingsFor } from '@/lib/tenant';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { recordAudit } from '@/lib/audit';
import { forbidden } from '@/lib/errors';

export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('attendance.view');
  const { sectionId, date } = parseQuery(req, z.object({ sectionId: z.string(), date: z.string() }));
  await assertCanAccessSection(session, sectionId);

  const rows = await db
    .select()
    .from(t.studentAttendance)
    .where(
      and(
        eq(t.studentAttendance.schoolId, session.schoolId),
        eq(t.studentAttendance.sectionId, sectionId),
        eq(t.studentAttendance.date, date),
      ),
    );
  return ok({ data: rows });
});

/**
 * Marks or corrects a day's attendance for one section.
 * Editing a past day needs `attendance.edit` and stays inside the school's window.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('attendance.mark');
  const input = await parseBody(req, attendanceMarkSchema);

  const section = assertSameSchool(
    await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId) }),
    session.schoolId,
  );
  await assertCanAccessSection(session, section.id);

  const date = input.date.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const settings = await schoolSettingsFor(session.schoolId);

  if (date < today) {
    const windowMs = (settings?.attendanceEditWindowHours ?? 24) * 3600_000;
    const withinWindow = Date.now() - new Date(date).getTime() <= windowMs;
    const canEdit = session.permissions.includes('attendance.edit');
    if (!withinWindow && !canEdit) {
      throw forbidden('The edit window for that day has closed. Ask an administrator to make the correction.');
    }
  }
  if (date > today) throw forbidden('Attendance cannot be marked for a future date.');

  // Only students actually enrolled in this section may be marked here.
  const enrolled = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .where(
      and(
        eq(t.enrollments.schoolId, session.schoolId),
        eq(t.enrollments.sectionId, section.id),
        eq(t.enrollments.isCurrent, true),
      ),
    );
  const allowed = new Set(enrolled.map((e) => e.studentId));
  const entries = input.entries.filter((e) => allowed.has(e.studentId));
  if (!entries.length) throw forbidden('None of those students are enrolled in this class.');

  const before = await db
    .select()
    .from(t.studentAttendance)
    .where(
      and(
        eq(t.studentAttendance.schoolId, session.schoolId),
        eq(t.studentAttendance.sectionId, section.id),
        eq(t.studentAttendance.date, date),
      ),
    );
  const previous = new Map(before.map((b) => [b.studentId, b.status]));

  await db
    .insert(t.studentAttendance)
    .values(
      entries.map((e) => ({
        schoolId: session.schoolId,
        studentId: e.studentId,
        sectionId: section.id,
        date,
        status: e.status,
        remarks: e.remarks || null,
        markedById: session.teacherId,
      })),
    )
    .onConflictDoUpdate({
      target: [t.studentAttendance.studentId, t.studentAttendance.date],
      set: {
        status: sql`excluded.status`,
        remarks: sql`excluded.remarks`,
        sectionId: sql`excluded.section_id`,
        markedById: sql`excluded.marked_by_id`,
        updatedAt: new Date(),
      },
    });

  // Notify guardians only for newly-absent students, so corrections don't spam.
  const newlyAbsent = entries
    .filter((e) => e.status === 'ABSENT' && previous.get(e.studentId) !== 'ABSENT')
    .map((e) => e.studentId);

  if (settings?.notifyParentOnAbsence && newlyAbsent.length) {
    const students = await db
      .select({ id: t.students.id, firstName: t.students.firstName })
      .from(t.students)
      .where(inArray(t.students.id, newlyAbsent));
    for (const student of students) {
      const userIds = await guardianUserIds(session.schoolId, [student.id]);
      await notify({
        schoolId: session.schoolId,
        userIds,
        type: 'ATTENDANCE',
        title: `${student.firstName} was marked absent`,
        body: `${student.firstName} was recorded absent on ${new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}. Contact the school office if this is unexpected.`,
        link: '/parent/attendance',
        priority: 'HIGH',
        channels: ['IN_APP', 'SMS'],
      });
    }
  }

  await recordAudit({
    session,
    action: before.length ? 'attendance.updated' : 'attendance.marked',
    entity: 'StudentAttendance',
    entityId: section.id,
    before: { date, counts: before.length },
    after: { date, counts: entries.length, absent: newlyAbsent.length },
  });

  return ok({ saved: entries.length, notified: newlyAbsent.length });
});
