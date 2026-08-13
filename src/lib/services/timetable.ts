import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';

export { DAYS, todayDayOfWeek } from '@/lib/calendar';

export const listPeriods = (schoolId: string) =>
  db.select().from(t.periods).where(eq(t.periods.schoolId, schoolId)).orderBy(asc(t.periods.order));

export async function sectionTimetable(schoolId: string, sectionId: string) {
  return db.query.timetableSlots.findMany({
    where: and(eq(t.timetableSlots.schoolId, schoolId), eq(t.timetableSlots.sectionId, sectionId)),
    with: { subject: true, teacher: { with: { user: { columns: { name: true } } } }, period: true },
  });
}

/** A teacher's own week — used by the teacher dashboard and “today's classes”. */
export async function teacherTimetable(schoolId: string, teacherId: string) {
  return db.query.timetableSlots.findMany({
    where: and(eq(t.timetableSlots.schoolId, schoolId), eq(t.timetableSlots.teacherId, teacherId)),
    with: { subject: true, period: true, section: { with: { class: true } } },
  });
}
