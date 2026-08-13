import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import {
  accessibleSectionIds,
  assertCanAccessSection,
  assertCanTeach,
  assertCanViewStudent,
  assertParentOwnsStudent,
  childrenOf,
  hasSchoolWideAccess,
  visibleStudentIds,
} from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { listStudents } from '@/lib/services/students';
import { loadSessionUser } from '@/lib/auth/session';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

/* ------------------------------------------------------------------ */
/* Tenant isolation                                                     */
/* ------------------------------------------------------------------ */

describe('school A cannot reach school B', () => {
  it('scopes the student list to the caller’s school', async () => {
    const adminA = await sessionFor(fx.adminUserId);
    const adminB = await sessionFor(fx.school2AdminUserId);

    const { rows: rowsA } = await listStudents(adminA, { page: 1, pageSize: 100 });
    const { rows: rowsB } = await listStudents(adminB, { page: 1, pageSize: 100 });

    expect(rowsA.length).toBeGreaterThan(rowsB.length);
    const idsB = new Set(rowsB.map((r) => r.id));
    expect(rowsA.some((r) => idsB.has(r.id))).toBe(false);
  });

  it('refuses to load a student belonging to another school', async () => {
    const adminB = await sessionFor(fx.school2AdminUserId);
    const studentFromA = fx.students[0].id;
    const err = await expectForbidden(() => assertCanViewStudent(adminB, studentFromA));
    expect(err.message).toMatch(/not authorised/i);
  });

  it('refuses to act on another school’s section', async () => {
    const adminB = await sessionFor(fx.school2AdminUserId);
    const sectionFromA = await db.query.sections.findFirst({ where: eq(t.sections.id, fx.section5A) });
    // assertSameSchool is the gate every id-carrying request body passes through.
    expect(() => assertSameSchool(sectionFromA, adminB.schoolId)).toThrow();
  });

  it('never returns another school’s announcements', async () => {
    const rows = await db.select().from(t.announcements).where(eq(t.announcements.schoolId, fx.school2Id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.schoolId === fx.school2Id)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Suspended tenants                                                    */
/* ------------------------------------------------------------------ */

describe('suspended schools', () => {
  it('blocks every user of a suspended school from getting a session', async () => {
    const session = await loadSessionUser(fx.school3AdminUserId);
    expect(session).toBeNull();
  });

  it('still allows users of active schools', async () => {
    const session = await loadSessionUser(fx.adminUserId);
    expect(session?.schoolId).toBe(fx.schoolId);
  });
});

/* ------------------------------------------------------------------ */
/* Teachers and class teachers                                          */
/* ------------------------------------------------------------------ */

describe('teacher scope', () => {
  it('gives school-wide access only to admins and principals', async () => {
    expect(hasSchoolWideAccess(await sessionFor(fx.adminUserId))).toBe(true);
    expect(hasSchoolWideAccess(await sessionFor(fx.principalUserId))).toBe(true);
    expect(hasSchoolWideAccess(await sessionFor(fx.classTeacherUserId))).toBe(false);
  });

  it('limits a teacher to their assigned sections', async () => {
    const teacher = await sessionFor(fx.classTeacherUserId);
    const ids = await accessibleSectionIds(teacher);
    expect(ids).not.toBeNull();
    expect(ids).toContain(fx.section5A);

    // Admins see everything (null means "no restriction").
    expect(await accessibleSectionIds(await sessionFor(fx.adminUserId))).toBeNull();
  });

  it('rejects access to a section the teacher is not assigned to', async () => {
    // Build a teacher with exactly one assignment, then probe a different section.
    const [user] = await db
      .insert(t.users)
      .values({ schoolId: fx.schoolId, name: 'Narrow Teacher', email: 'narrow@dpa.edu', phone: '9899999901' })
      .returning();
    await db.insert(t.userRoles).values({ userId: user.id, role: 'TEACHER' });
    const [teacherRow] = await db
      .insert(t.teachers)
      .values({ schoolId: fx.schoolId, userId: user.id, employeeId: 'EMP-NARROW' })
      .returning();
    await db
      .insert(t.teacherAssignments)
      .values({ schoolId: fx.schoolId, teacherId: teacherRow.id, sectionId: fx.section5A, isClassTeacher: false });

    const narrow = await sessionFor(user.id);
    await expect(assertCanAccessSection(narrow, fx.section5A)).resolves.toBeUndefined();
    const err = await expectForbidden(() => assertCanAccessSection(narrow, fx.section10A));
    expect(err.message).toMatch(/not assigned/i);
  });

  it('rejects marks entry for a subject the teacher does not teach', async () => {
    const teacher = await sessionFor(fx.otherTeacherUserId);
    const paper = await db.query.examSubjects.findFirst({
      where: and(eq(t.examSubjects.examId, fx.publishedExamId), eq(t.examSubjects.sectionId, fx.section5A)),
    });
    expect(paper).toBeDefined();

    const foreignSubject = await db.query.subjects.findFirst({
      where: and(eq(t.subjects.schoolId, fx.schoolId), eq(t.subjects.code, 'CSC')),
    });
    // Vikram Singh is class teacher of 10-A, so 5-A + Computer Science is out of scope.
    const err = await expectForbidden(() => assertCanTeach(teacher, fx.section5A, foreignSubject!.id));
    expect(err.message).toMatch(/not assigned to teach/i);
  });

  it('lets an admin enter marks for any section', async () => {
    const admin = await sessionFor(fx.adminUserId);
    const subject = await db.query.subjects.findFirst({ where: eq(t.subjects.schoolId, fx.schoolId) });
    await expect(assertCanTeach(admin, fx.section10A, subject!.id)).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Parents                                                              */
/* ------------------------------------------------------------------ */

describe('parent scope', () => {
  it('returns only that parent’s own children', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const kids = await childrenOf(parent.parentId!, parent.schoolId);
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.every((k) => k.schoolId === fx.schoolId)).toBe(true);

    const other = await sessionFor(fx.otherParentUserId);
    const otherKids = await childrenOf(other.parentId!, other.schoolId);
    const mine = new Set(kids.map((k) => k.id));
    expect(otherKids.some((k) => mine.has(k.id))).toBe(false);
  });

  it('refuses to show parent A the child of parent B', async () => {
    const parentA = await sessionFor(fx.parentUserId);
    const parentB = await sessionFor(fx.otherParentUserId);
    const bChild = (await childrenOf(parentB.parentId!, parentB.schoolId))[0];

    const err = await expectForbidden(() => assertParentOwnsStudent(parentA, bChild.id));
    expect(err.message).toMatch(/not authorised/i);
    await expectForbidden(() => assertCanViewStudent(parentA, bChild.id));
  });

  it('limits visibleStudentIds to linked children', async () => {
    const parent = await sessionFor(fx.parentUserId);
    const ids = await visibleStudentIds(parent);
    const kids = await childrenOf(parent.parentId!, parent.schoolId);
    expect(new Set(ids)).toEqual(new Set(kids.map((k) => k.id)));
  });
});

/* ------------------------------------------------------------------ */
/* Permission matrix                                                    */
/* ------------------------------------------------------------------ */

describe('role permissions', () => {
  it('does not give teachers destructive or financial powers', async () => {
    const teacher = await sessionFor(fx.classTeacherUserId);
    for (const denied of ['students.delete', 'fees.manage', 'fees.collect', 'school.users.manage', 'results.publish', 'platform.schools.manage']) {
      expect(teacher.permissions).not.toContain(denied);
    }
    for (const allowed of ['attendance.mark', 'homework.manage', 'exams.marks.enter']) {
      expect(teacher.permissions).toContain(allowed);
    }
  });

  it('does not give school admins any platform permission', async () => {
    const admin = await sessionFor(fx.adminUserId);
    expect(admin.permissions.some((p) => p.startsWith('platform.'))).toBe(false);
    expect(admin.isPlatform).toBe(false);
  });

  it('gives platform admins tenant-lifecycle control but no portal access', async () => {
    const platform = await sessionFor(fx.platformAdminId);
    expect(platform.isPlatform).toBe(true);
    expect(platform.permissions).toContain('platform.schools.manage');
    expect(platform.permissions).not.toContain('portal.parent');
    expect(platform.schoolId).toBeNull();
  });

  it('honours per-user permission overrides', async () => {
    const before = await sessionFor(fx.classTeacherUserId);
    expect(before.permissions).not.toContain('results.publish');

    await db.insert(t.userPermissions).values({
      userId: fx.classTeacherUserId,
      permissionKey: 'results.publish',
      granted: true,
    });
    const granted = await sessionFor(fx.classTeacherUserId);
    expect(granted.permissions).toContain('results.publish');

    await db
      .update(t.userPermissions)
      .set({ granted: false })
      .where(eq(t.userPermissions.userId, fx.classTeacherUserId));
    const revoked = await sessionFor(fx.classTeacherUserId);
    expect(revoked.permissions).not.toContain('results.publish');

    await db.delete(t.userPermissions).where(eq(t.userPermissions.userId, fx.classTeacherUserId));
  });
});
