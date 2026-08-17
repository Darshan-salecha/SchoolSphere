import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import { hasSchoolWideAccess, hasSchoolWideRead, visibleStudentIds, assertCanViewStudent } from '@/lib/scope';
import { listStudents } from '@/lib/services/students';
import { issueBook, listCatalogue, listLoans, returnBook, fineFor, FINE_PER_DAY, MAX_OPEN_LOANS } from '@/lib/services/library';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

/**
 * Non-teaching staff previously held `students.view` and were handed an empty
 * list, because the row-scoping assumed every non-admin was a teacher. These
 * tests pin the fix, and pin that read access did not become write access.
 */

describe('receptionist can do the front-desk job', () => {
  it('sees the whole student directory', async () => {
    const reception = await sessionFor(fx.receptionistUserId);
    expect(await visibleStudentIds(reception)).toBeNull(); // null = unrestricted

    const { rows, total } = await listStudents(reception, { page: 1, pageSize: 100 });
    expect(total).toBeGreaterThan(20);
    expect(rows.length).toBeGreaterThan(20);
  });

  it('can open any individual student', async () => {
    const reception = await sessionFor(fx.receptionistUserId);
    await expect(assertCanViewStudent(reception, fx.students[0].id)).resolves.toBeTruthy();
    await expect(assertCanViewStudent(reception, fx.students[20].id)).resolves.toBeTruthy();
  });

  it('can see parents, so a phone call can be answered', async () => {
    const reception = await sessionFor(fx.receptionistUserId);
    expect(reception.permissions).toContain('parents.view');
  });

  it('but cannot enrol, transfer or delete a student', async () => {
    const reception = await sessionFor(fx.receptionistUserId);
    expect(hasSchoolWideAccess(reception)).toBe(false); // the write predicate
    expect(hasSchoolWideRead(reception)).toBe(true); // the read predicate
    for (const denied of ['students.create', 'students.edit', 'students.delete', 'parents.manage']) {
      expect(reception.permissions).not.toContain(denied);
    }
  });

  it('cannot reach another school’s directory', async () => {
    const reception = await sessionFor(fx.receptionistUserId);
    const otherStudent = await db.query.students.findFirst({ where: eq(t.students.schoolId, fx.school2Id) });
    await expectForbidden(() => assertCanViewStudent(reception, otherStudent!.id));
  });
});

describe('job titles grant the right extras', () => {
  it('gives the accountant fees, and not the library', async () => {
    const accountant = await sessionFor(fx.accountantUserId);
    expect(accountant.permissions).toContain('fees.view');
    expect(accountant.permissions).toContain('fees.collect');
    expect(accountant.permissions).not.toContain('library.manage');
  });

  it('gives the librarian the library, and not the fee desk', async () => {
    const librarian = await sessionFor(fx.librarianUserId);
    expect(librarian.permissions).toContain('library.view');
    expect(librarian.permissions).toContain('library.manage');
    expect(librarian.permissions).not.toContain('fees.collect');
  });

  it('gives no staff member a platform or destructive permission', async () => {
    for (const userId of fx.staffUserIds) {
      const session = await sessionFor(userId);
      expect(session.permissions.some((p) => p.startsWith('platform.'))).toBe(false);
      expect(session.permissions).not.toContain('students.delete');
      expect(session.permissions).not.toContain('results.publish');
    }
  });

  it('records the extras as visible overrides an admin can change', async () => {
    const rows = await db
      .select()
      .from(t.userPermissions)
      .where(eq(t.userPermissions.userId, fx.librarianUserId));
    expect(rows.map((r) => r.permissionKey)).toContain('library.manage');
    expect(rows.every((r) => r.granted)).toBe(true);
  });
});

describe('teachers are still scoped to their own classes', () => {
  it('the read widening did not leak the directory to teachers', async () => {
    const teacher = await sessionFor(fx.classTeacherUserId);
    expect(hasSchoolWideRead(teacher)).toBe(false);
    const ids = await visibleStudentIds(teacher);
    expect(ids).not.toBeNull();
    expect(ids!.length).toBeGreaterThan(0);
  });

  it('and did not leak it to parents or students', async () => {
    const parent = await sessionFor(fx.parentUserId);
    expect(hasSchoolWideRead(parent)).toBe(false);
    const ids = await visibleStudentIds(parent);
    expect(ids!.length).toBeLessThan(5);
  });
});

describe('library', () => {
  it('derives availability from open loans rather than a counter', async () => {
    const catalogue = await listCatalogue(fx.schoolId);
    const jungle = catalogue.find((b) => b.title === 'The Jungle Book')!;
    expect(jungle.totalCopies).toBe(4);
    expect(jungle.onLoan).toBe(1);
    expect(jungle.available).toBe(3);
  });

  it('computes a fine from the due date, and freezes it on return', async () => {
    expect(fineFor('2020-01-01', '2020-01-01')).toBe(0);
    expect(fineFor('2020-01-01', '2020-01-04')).toBe(3 * FINE_PER_DAY);

    const returned = (await listLoans(fx.schoolId)).find((l) => l.status === 'RETURNED')!;
    // A settled loan keeps its recorded figure rather than growing forever.
    expect(returned.currentFine).toBe(returned.fineAmount);
  });

  it('shows an overdue loan accruing', async () => {
    const overdue = (await listLoans(fx.schoolId)).find((l) => l.status === 'OVERDUE')!;
    expect(overdue.currentFine).toBeGreaterThan(0);
  });

  it('lets the librarian issue and take back a book', async () => {
    const librarian = await sessionFor(fx.librarianUserId);
    const catalogue = await listCatalogue(fx.schoolId);
    const free = catalogue.find((b) => b.available > 0)!;

    const loan = await issueBook({ session: librarian, bookId: free.id, studentId: fx.students[10].id });
    expect(loan.status).toBe('ISSUED');

    const back = await returnBook({ session: librarian, loanId: loan.id });
    expect(back.status).toBe('RETURNED');
    expect(back.fineAmount).toBe(0);
  });

  it('refuses a second copy when every one is out', async () => {
    const librarian = await sessionFor(fx.librarianUserId);
    const catalogue = await listCatalogue(fx.schoolId);
    const scarce = catalogue.find((b) => b.totalCopies === 2 && b.available > 0);
    if (!scarce) return;

    const borrowers = fx.students.slice(11, 11 + scarce.available);
    for (const s of borrowers) await issueBook({ session: librarian, bookId: scarce.id, studentId: s.id });

    const err = await expectForbidden(() =>
      issueBook({ session: librarian, bookId: scarce.id, studentId: fx.students[25].id }),
    );
    expect(err.message).toMatch(/already on loan/i);
  });

  it('caps how many a student may hold at once', async () => {
    const librarian = await sessionFor(fx.librarianUserId);
    const student = fx.students[26].id;
    const catalogue = await listCatalogue(fx.schoolId);
    const pool = catalogue.filter((b) => b.available > 0).slice(0, MAX_OPEN_LOANS + 1);
    if (pool.length <= MAX_OPEN_LOANS) return;

    for (const book of pool.slice(0, MAX_OPEN_LOANS)) {
      await issueBook({ session: librarian, bookId: book.id, studentId: student });
    }
    const err = await expectForbidden(() =>
      issueBook({ session: librarian, bookId: pool[MAX_OPEN_LOANS].id, studentId: student }),
    );
    expect(err.message).toMatch(/limit is/i);
  });

  it('refuses a book to a student holding something overdue', async () => {
    const librarian = await sessionFor(fx.librarianUserId);
    const overdue = (await listLoans(fx.schoolId)).find((l) => l.status === 'OVERDUE')!;
    const catalogue = await listCatalogue(fx.schoolId);
    const free = catalogue.find((b) => b.available > 0);
    if (!free) return;

    const err = await expectForbidden(() =>
      issueBook({ session: librarian, bookId: free.id, studentId: overdue.studentId }),
    );
    expect(err.message).toMatch(/overdue/i);
  });

  it('will not issue a book to a student from another school', async () => {
    const librarian = await sessionFor(fx.librarianUserId);
    const otherStudent = await db.query.students.findFirst({ where: eq(t.students.schoolId, fx.school2Id) });
    const catalogue = await listCatalogue(fx.schoolId);
    const free = catalogue.find((b) => b.available > 0);
    if (!free) return;
    await expectForbidden(() => issueBook({ session: librarian, bookId: free.id, studentId: otherStudent!.id }));
  });
});
