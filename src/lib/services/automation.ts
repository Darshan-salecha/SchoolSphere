import { and, count, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { refreshOverdue, sendReminders } from '@/lib/services/fees';
import { reapStaleTrips } from '@/lib/services/transport';
import { schoolSettingsFor } from '@/lib/tenant';

/**
 * Smart notification rules.
 *
 * The rules from the brief, expressed once, in one place, so a school never
 * receives the same alert from two code paths:
 *
 *   attendance below the school's threshold  → tell the guardians
 *   fee overdue                              → escalate through the stages
 *   exam within three days                   → remind the families
 *   trip phone stopped reporting             → close the trip
 *
 * Every rule is idempotent and dedupes against what it has already sent, so
 * this is safe to run on a schedule *and* safe to run twice by hand. Nothing
 * here decides anything on a family's behalf — these are prompts to a human.
 */

export type RuleResult = { rule: string; matched: number; notified: number };

/** Guardians of students whose attendance has fallen below the school threshold. */
async function lowAttendanceRule(schoolId: string): Promise<RuleResult> {
  const settings = await schoolSettingsFor(schoolId);
  const threshold = settings?.lowAttendanceThreshold ?? 75;

  const rows = await db
    .select({
      studentId: t.studentAttendance.studentId,
      firstName: t.students.firstName,
      total: count(),
      present: sql<number>`sum(case when ${t.studentAttendance.status} in ('PRESENT','LATE','HALF_DAY') then 1 else 0 end)::int`,
    })
    .from(t.studentAttendance)
    .innerJoin(t.students, eq(t.students.id, t.studentAttendance.studentId))
    .where(and(eq(t.studentAttendance.schoolId, schoolId), isNull(t.students.deletedAt)))
    .groupBy(t.studentAttendance.studentId, t.students.firstName)
    // At least ten recorded days, so a new joiner is not flagged on day two.
    .having(sql`count(*) >= 10 and sum(case when ${t.studentAttendance.status} in ('PRESENT','LATE','HALF_DAY') then 1 else 0 end) * 100.0 / count(*) < ${threshold}`);

  let notified = 0;
  for (const row of rows) {
    const percent = Math.round((Number(row.present) / row.total) * 1000) / 10;

    // One notice per student per calendar month — a daily nag helps nobody.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const guardians = await guardianUserIds(schoolId, [row.studentId]);
    if (!guardians.length) continue;

    const [already] = await db
      .select({ value: count() })
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.schoolId, schoolId),
          eq(t.notifications.type, 'ATTENDANCE_RISK'),
          inArray(t.notifications.userId, guardians),
          gte(t.notifications.createdAt, monthStart),
        ),
      );
    if (Number(already?.value ?? 0) > 0) continue;

    await notify({
      schoolId,
      userIds: guardians,
      type: 'ATTENDANCE_RISK',
      title: `${row.firstName}'s attendance is ${percent}%`,
      body: `This is below the school's expectation of ${threshold}%. Please get in touch with the class teacher if there is something we should know.`,
      link: '/parent/attendance',
      priority: 'HIGH',
    });
    notified += guardians.length;
  }
  return { rule: 'attendance.low', matched: rows.length, notified };
}

/** Exams starting within three days. */
async function upcomingExamRule(schoolId: string): Promise<RuleResult> {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

  const exams = await db
    .select()
    .from(t.exams)
    .where(and(eq(t.exams.schoolId, schoolId), gte(t.exams.startDate, today), lt(t.exams.startDate, soon)));

  let notified = 0;
  for (const exam of exams) {
    const students = await db
      .select({ studentId: t.enrollments.studentId })
      .from(t.enrollments)
      .where(and(eq(t.enrollments.schoolId, schoolId), eq(t.enrollments.isCurrent, true)));
    const guardians = await guardianUserIds(schoolId, students.map((s) => s.studentId));
    if (!guardians.length) continue;

    const [already] = await db
      .select({ value: count() })
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.schoolId, schoolId),
          eq(t.notifications.type, 'EXAM_SOON'),
          eq(t.notifications.title, `${exam.name} starts on ${exam.startDate}`),
        ),
      );
    if (Number(already?.value ?? 0) > 0) continue;

    await notify({
      schoolId,
      userIds: guardians,
      type: 'EXAM_SOON',
      title: `${exam.name} starts on ${exam.startDate}`,
      body: 'The exam timetable is available in the portal.',
      link: '/parent/results',
    });
    notified += guardians.length;
  }
  return { rule: 'exam.upcoming', matched: exams.length, notified };
}

/** Runs every rule. Returns what fired, so an operator can see the effect. */
export async function runAutomation(schoolId: string) {
  const overdueMarked = await refreshOverdue(schoolId);
  const staleTrips = await reapStaleTrips(schoolId);

  const results: RuleResult[] = [
    await lowAttendanceRule(schoolId),
    await upcomingExamRule(schoolId),
  ];

  const fees = await sendReminders({ schoolId, stage: 'OVERDUE' });
  results.push({ rule: 'fee.overdue', matched: overdueMarked, notified: fees.sent });
  results.push({ rule: 'trip.stale', matched: staleTrips, notified: 0 });

  return results;
}
