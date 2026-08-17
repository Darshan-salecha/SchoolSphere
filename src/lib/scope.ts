import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { forbidden } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Row-level scoping. Permissions decide *what* a user may do; these helpers decide
 * *which rows* they may do it to.
 *
 *  School admin / principal → every section in their school
 *  Teacher                  → only sections they are assigned to
 *  Class teacher            → wider rights, still only their own sections
 *  Parent                   → only linked children
 *  Student                  → only themselves
 */
const WIDE_ROLES = ['SCHOOL_ADMIN', 'PRINCIPAL'];

/**
 * Privileged access: may write across the whole school, transfer a student,
 * enrol, link guardians, and audit any conversation. Deliberately only two roles.
 */
export const hasSchoolWideAccess = (session: SessionUser) => session.roles.some((r) => WIDE_ROLES.includes(r));

/**
 * School-wide *read* of the student directory.
 *
 * Separate from `hasSchoolWideAccess` on purpose. A receptionist needs to look
 * up any child in the school to handle a gate pass or an early pickup, but must
 * never be able to enrol one — so the read predicate is wider than the write
 * predicate, and the two must not be conflated.
 *
 * This is also a bug fix: non-teaching staff previously fell through to the
 * teacher branch, found no class assignments, and were handed an empty list.
 * They held `students.view` and saw nothing, which reads as a broken page
 * rather than as a permission boundary.
 */
export function hasSchoolWideRead(session: SessionUser) {
  if (hasSchoolWideAccess(session)) return true;
  // Guardians and students are scoped to themselves, never to the directory.
  if (session.parentId || session.studentId) return false;
  // A teacher is scoped to their own classes even though they can view students.
  if (session.teacherId) return false;
  return session.permissions.includes('students.view');
}

/** Section ids this user may read. `null` means "every section in the school". */
export async function accessibleSectionIds(session: SessionUser): Promise<string[] | null> {
  if (!session.schoolId) throw forbidden();
  if (hasSchoolWideAccess(session)) return null;
  if (session.teacherId) {
    const rows = await db
      .select({ sectionId: t.teacherAssignments.sectionId })
      .from(t.teacherAssignments)
      .where(
        and(eq(t.teacherAssignments.schoolId, session.schoolId), eq(t.teacherAssignments.teacherId, session.teacherId)),
      );
    return [...new Set(rows.map((r) => r.sectionId))];
  }
  return [];
}

export async function assertCanAccessSection(session: SessionUser, sectionId: string) {
  const ids = await accessibleSectionIds(session);
  if (ids === null) return;
  if (!ids.includes(sectionId)) throw forbidden('You are not assigned to this class.');
}

export async function classTeacherSectionIds(session: SessionUser): Promise<string[]> {
  if (!session.schoolId || !session.teacherId) return [];
  const rows = await db
    .select({ sectionId: t.teacherAssignments.sectionId })
    .from(t.teacherAssignments)
    .where(
      and(
        eq(t.teacherAssignments.schoolId, session.schoolId),
        eq(t.teacherAssignments.teacherId, session.teacherId),
        eq(t.teacherAssignments.isClassTeacher, true),
      ),
    );
  return [...new Set(rows.map((r) => r.sectionId))];
}

export async function isClassTeacherOf(session: SessionUser, sectionId: string) {
  if (hasSchoolWideAccess(session)) return true;
  return (await classTeacherSectionIds(session)).includes(sectionId);
}

/** Which (section, subject) pairs a teacher may enter marks / set homework for. */
export async function assertCanTeach(session: SessionUser, sectionId: string, subjectId: string) {
  if (hasSchoolWideAccess(session)) return;
  if (!session.teacherId || !session.schoolId) throw forbidden();
  const rows = await db
    .select({ id: t.teacherAssignments.id })
    .from(t.teacherAssignments)
    .where(
      and(
        eq(t.teacherAssignments.schoolId, session.schoolId),
        eq(t.teacherAssignments.teacherId, session.teacherId),
        eq(t.teacherAssignments.sectionId, sectionId),
        or(eq(t.teacherAssignments.subjectId, subjectId), eq(t.teacherAssignments.isClassTeacher, true)),
      ),
    )
    .limit(1);
  if (!rows.length) throw forbidden('You are not assigned to teach this subject in this class.');
}

/** Students a parent is authorised for, with their current class. */
export async function childrenOf(parentId: string, schoolId: string) {
  const links = await db.query.studentParents.findMany({
    where: and(eq(t.studentParents.parentId, parentId), eq(t.studentParents.schoolId, schoolId)),
    with: {
      student: {
        with: {
          enrollments: {
            where: eq(t.enrollments.isCurrent, true),
            with: { section: { with: { class: true } } },
          },
        },
      },
    },
  });
  return links
    .filter((l) => l.student && !l.student.deletedAt)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((l) => ({ ...l.student, relation: l.relation, access: l.access }));
}

export async function assertParentOwnsStudent(session: SessionUser, studentId: string) {
  if (!session.parentId || !session.schoolId) throw forbidden();
  const link = await db.query.studentParents.findFirst({
    where: and(
      eq(t.studentParents.parentId, session.parentId),
      eq(t.studentParents.studentId, studentId),
      eq(t.studentParents.schoolId, session.schoolId),
    ),
  });
  if (!link) throw forbidden('You are not authorised to view this student.');
  return link;
}

/** Single gate used by every student-detail read, whatever the caller's role. */
export async function assertCanViewStudent(session: SessionUser, studentId: string) {
  if (!session.schoolId) throw forbidden();
  const student = await db.query.students.findFirst({
    where: and(eq(t.students.id, studentId), eq(t.students.schoolId, session.schoolId), isNull(t.students.deletedAt)),
    with: { enrollments: { where: eq(t.enrollments.isCurrent, true) } },
  });
  if (!student) throw forbidden('You are not authorised to view this student.');

  if (hasSchoolWideRead(session)) return student;
  if (session.parentId) {
    await assertParentOwnsStudent(session, studentId);
    return student;
  }
  if (session.studentId) {
    if (session.studentId !== studentId) throw forbidden();
    return student;
  }
  if (session.teacherId) {
    const ids = await accessibleSectionIds(session);
    if (ids === null || student.enrollments.some((e) => ids.includes(e.sectionId))) return student;
  }
  throw forbidden('You are not authorised to view this student.');
}

/** Students visible to the caller, already tenant- and role-scoped. */
export async function visibleStudentIds(session: SessionUser): Promise<string[] | null> {
  if (!session.schoolId) throw forbidden();
  if (hasSchoolWideRead(session)) return null;
  if (session.parentId) {
    const rows = await db
      .select({ studentId: t.studentParents.studentId })
      .from(t.studentParents)
      .where(and(eq(t.studentParents.schoolId, session.schoolId), eq(t.studentParents.parentId, session.parentId)));
    return rows.map((r) => r.studentId);
  }
  if (session.studentId) return [session.studentId];
  const sectionIds = await accessibleSectionIds(session);
  if (sectionIds === null) return null;
  if (!sectionIds.length) return [];
  const rows = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .where(
      and(
        eq(t.enrollments.schoolId, session.schoolId),
        eq(t.enrollments.isCurrent, true),
        inArray(t.enrollments.sectionId, sectionIds),
      ),
    );
  return [...new Set(rows.map((r) => r.studentId))];
}
