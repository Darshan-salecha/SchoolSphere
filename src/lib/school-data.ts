import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';

/** Small shared readers used by several school pages. */

export const listAcademicYears = (schoolId: string) =>
  db.select().from(t.academicYears).where(eq(t.academicYears.schoolId, schoolId)).orderBy(desc(t.academicYears.startDate));

export const listClasses = (schoolId: string) =>
  db.select().from(t.classLevels).where(eq(t.classLevels.schoolId, schoolId)).orderBy(asc(t.classLevels.level));

export const listSubjects = (schoolId: string) =>
  db.select().from(t.subjects).where(eq(t.subjects.schoolId, schoolId)).orderBy(asc(t.subjects.name));

export const listTeacherOptions = async (schoolId: string) => {
  const rows = await db
    .select({ id: t.teachers.id, name: t.users.name, employeeId: t.teachers.employeeId })
    .from(t.teachers)
    .innerJoin(t.users, eq(t.users.id, t.teachers.userId))
    .where(and(eq(t.teachers.schoolId, schoolId), isNull(t.teachers.deletedAt)))
    .orderBy(asc(t.users.name));
  return rows;
};

/** Sections for the current academic year, with class name and headcount. */
export async function listSections(schoolId: string, academicYearId?: string) {
  const rows = await db.query.sections.findMany({
    where: and(
      eq(t.sections.schoolId, schoolId),
      academicYearId ? eq(t.sections.academicYearId, academicYearId) : undefined,
    ),
    with: {
      class: true,
      academicYear: true,
      classTeacher: { with: { user: { columns: { name: true } } } },
      enrollments: { where: eq(t.enrollments.isCurrent, true), columns: { id: true } },
    },
  });
  return rows
    .map((s) => ({ ...s, studentCount: s.enrollments.length, label: `${s.class.name} — ${s.name}` }))
    .sort((a, b) => a.class.level - b.class.level || a.name.localeCompare(b.name));
}

export const sectionOptions = (sections: { id: string; label: string }[]) =>
  sections.map((s) => ({ value: s.id, label: s.label }));
