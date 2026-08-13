import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';

const PRESENTISH = ['PRESENT', 'LATE', 'HALF_DAY'] as const;

/** Attendance percentage per student over an optional window. */
export async function attendanceSummary(schoolId: string, studentIds: string[], since?: Date) {
  if (!studentIds.length) return new Map<string, { present: number; total: number; percent: number }>();
  const rows = await db
    .select({ studentId: t.studentAttendance.studentId, status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(
      and(
        eq(t.studentAttendance.schoolId, schoolId),
        inArray(t.studentAttendance.studentId, studentIds),
        since ? gte(t.studentAttendance.date, since.toISOString().slice(0, 10)) : undefined,
      ),
    )
    .groupBy(t.studentAttendance.studentId, t.studentAttendance.status);

  const map = new Map<string, { present: number; total: number; percent: number }>();
  for (const r of rows) {
    const entry = map.get(r.studentId) ?? { present: 0, total: 0, percent: 0 };
    entry.total += r.value;
    if ((PRESENTISH as readonly string[]).includes(r.status)) entry.present += r.value;
    map.set(r.studentId, entry);
  }
  for (const entry of map.values()) {
    entry.percent = entry.total ? Math.round((entry.present / entry.total) * 1000) / 10 : 0;
  }
  return map;
}

/** School-wide attendance for a single day, used by dashboards. */
export async function dailyAttendance(schoolId: string, date: string) {
  const rows = await db
    .select({ status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(and(eq(t.studentAttendance.schoolId, schoolId), eq(t.studentAttendance.date, date)))
    .groupBy(t.studentAttendance.status);

  const total = rows.reduce((a, b) => a + b.value, 0);
  const present = rows.filter((r) => (PRESENTISH as readonly string[]).includes(r.status)).reduce((a, b) => a + b.value, 0);
  return { total, present, percent: total ? Math.round((present / total) * 1000) / 10 : 0, breakdown: rows };
}

/** Daily attendance percentage over the last N school days, for trend charts. */
export async function attendanceTrend(schoolId: string, days = 14) {
  const rows = await db
    .select({
      date: t.studentAttendance.date,
      total: count(),
      present: sql<number>`sum(case when ${t.studentAttendance.status} in ('PRESENT','LATE','HALF_DAY') then 1 else 0 end)::int`,
    })
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.schoolId, schoolId))
    .groupBy(t.studentAttendance.date)
    .orderBy(desc(t.studentAttendance.date))
    .limit(days);

  return rows
    .reverse()
    .map((r) => ({
      date: new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      percent: r.total ? Math.round((Number(r.present) / r.total) * 1000) / 10 : 0,
    }));
}
