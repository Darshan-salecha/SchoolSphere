import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { visibleStudentIds } from '@/lib/scope';
import { currentAcademicYear } from '@/lib/tenant';
import { badRequest } from '@/lib/errors';

export type StudentFilters = { q?: string; sectionId?: string; status?: string; page: number; pageSize: number };

/** Tenant + role scoped student list. Teachers only ever see their own sections. */
export async function listStudents(session: SessionUser & { schoolId: string }, filters: StudentFilters) {
  const allowed = await visibleStudentIds(session);
  if (allowed?.length === 0) return { rows: [], total: 0 };

  const conditions = [eq(t.students.schoolId, session.schoolId), isNull(t.students.deletedAt)];
  if (allowed) conditions.push(inArray(t.students.id, allowed));
  if (filters.status) conditions.push(eq(t.students.status, filters.status as 'ACTIVE'));
  if (filters.sectionId) conditions.push(eq(t.enrollments.sectionId, filters.sectionId));
  if (filters.q) {
    conditions.push(
      or(
        ilike(t.students.firstName, `%${filters.q}%`),
        ilike(t.students.lastName, `%${filters.q}%`),
        ilike(t.students.admissionNumber, `%${filters.q}%`),
      )!,
    );
  }
  const where = and(...conditions);

  const base = db
    .select({
      id: t.students.id,
      admissionNumber: t.students.admissionNumber,
      firstName: t.students.firstName,
      lastName: t.students.lastName,
      gender: t.students.gender,
      status: t.students.status,
      photoUrl: t.students.photoUrl,
      rollNumber: t.enrollments.rollNumber,
      sectionId: t.sections.id,
      sectionName: t.sections.name,
      className: t.classLevels.name,
    })
    .from(t.students)
    .leftJoin(t.enrollments, and(eq(t.enrollments.studentId, t.students.id), eq(t.enrollments.isCurrent, true)))
    .leftJoin(t.sections, eq(t.sections.id, t.enrollments.sectionId))
    .leftJoin(t.classLevels, eq(t.classLevels.id, t.sections.classId));

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(t.students)
    .leftJoin(t.enrollments, and(eq(t.enrollments.studentId, t.students.id), eq(t.enrollments.isCurrent, true)))
    .where(where);

  const rows = await base
    .where(where)
    .orderBy(t.classLevels.level, t.sections.name, t.enrollments.rollNumber, t.students.firstName)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { rows, total };
}

/** Flags likely duplicates before a create or import commits. */
export async function findPossibleDuplicates(
  schoolId: string,
  input: { admissionNumber?: string; firstName?: string; lastName?: string; dateOfBirth?: Date | null },
) {
  const clauses = [];
  if (input.admissionNumber) clauses.push(eq(t.students.admissionNumber, input.admissionNumber));
  if (input.firstName && input.lastName) {
    clauses.push(
      and(
        ilike(t.students.firstName, input.firstName),
        ilike(t.students.lastName, input.lastName),
        input.dateOfBirth ? eq(t.students.dateOfBirth, input.dateOfBirth.toISOString().slice(0, 10)) : sql`true`,
      )!,
    );
  }
  if (!clauses.length) return [];
  return db
    .select({
      id: t.students.id,
      admissionNumber: t.students.admissionNumber,
      firstName: t.students.firstName,
      lastName: t.students.lastName,
    })
    .from(t.students)
    .where(and(eq(t.students.schoolId, schoolId), isNull(t.students.deletedAt), or(...clauses)))
    .limit(5);
}

export async function nextRollNumber(schoolId: string, sectionId: string) {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${t.enrollments.rollNumber}), 0)` })
    .from(t.enrollments)
    .where(and(eq(t.enrollments.schoolId, schoolId), eq(t.enrollments.sectionId, sectionId), eq(t.enrollments.isCurrent, true)));
  return Number(row?.value ?? 0) + 1;
}

export async function requireCurrentYear(schoolId: string) {
  const year = await currentAcademicYear(schoolId);
  if (!year) throw badRequest('Set a current academic year before enrolling students.');
  return year;
}

export async function studentProfile(schoolId: string, studentId: string) {
  return db.query.students.findFirst({
    where: and(eq(t.students.id, studentId), eq(t.students.schoolId, schoolId)),
    with: {
      enrollments: { with: { section: { with: { class: true } }, academicYear: true }, orderBy: desc(t.enrollments.enrolledAt) },
      guardians: { with: { parent: { with: { user: { columns: { name: true, phone: true, email: true } } } } } },
    },
  });
}
