import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { assertCanViewStudent } from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { guardianUserIds, notify } from '@/lib/services/notify';
import { badRequest, conflict, notFound } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Library.
 *
 * Availability is always derived from open loans rather than stored as a
 * counter, so a crashed request cannot leave a book permanently "out". Fines
 * are computed from the due date on read, and only *fixed* when the book comes
 * back — a fine that changes every time you look at it is not a fine.
 */

export const LOAN_DAYS = 14;
/** Fine per day past the due date, in minor units (₹2/day). */
export const FINE_PER_DAY = 200;
export const MAX_OPEN_LOANS = 3;

const today = () => new Date().toISOString().slice(0, 10);

export const fineFor = (dueDate: string, on: string = today()) => {
  const days = Math.floor((Date.parse(on) - Date.parse(dueDate)) / 864e5);
  return days > 0 ? days * FINE_PER_DAY : 0;
};

/** Catalogue with availability worked out from the loan table. */
export async function listCatalogue(schoolId: string, search?: string) {
  const books = await db
    .select()
    .from(t.libraryBooks)
    .where(eq(t.libraryBooks.schoolId, schoolId))
    .orderBy(asc(t.libraryBooks.title))
    .limit(500);

  const open = await db
    .select({ bookId: t.libraryLoans.bookId, value: count() })
    .from(t.libraryLoans)
    .where(and(eq(t.libraryLoans.schoolId, schoolId), inArray(t.libraryLoans.status, ['ISSUED', 'OVERDUE'])))
    .groupBy(t.libraryLoans.bookId);
  const outMap = new Map(open.map((r) => [r.bookId, Number(r.value)]));

  const filtered = search
    ? books.filter((b) => `${b.title} ${b.author ?? ''} ${b.isbn ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    : books;

  return filtered.map((b) => {
    const onLoan = outMap.get(b.id) ?? 0;
    return { ...b, onLoan, available: Math.max(0, b.totalCopies - onLoan) };
  });
}

export async function addBook(input: {
  session: SessionUser & { schoolId: string };
  title: string;
  author?: string | null;
  isbn?: string | null;
  category?: string | null;
  publisher?: string | null;
  shelf?: string | null;
  totalCopies: number;
}) {
  const [row] = await db
    .insert(t.libraryBooks)
    .values({
      schoolId: input.session.schoolId,
      title: input.title,
      author: input.author || null,
      isbn: input.isbn || null,
      category: input.category || null,
      publisher: input.publisher || null,
      shelf: input.shelf || null,
      totalCopies: input.totalCopies,
    })
    .returning();
  return row;
}

/**
 * Issues a copy. Refuses when no copy is free, when the borrower is already at
 * their limit, or when they are holding something overdue — the three rules a
 * librarian would otherwise have to remember by hand.
 */
export async function issueBook(input: {
  session: SessionUser & { schoolId: string };
  bookId: string;
  studentId: string;
  dueDate?: string;
}) {
  const { session, bookId, studentId } = input;
  const book = assertSameSchool(
    await db.query.libraryBooks.findFirst({ where: eq(t.libraryBooks.id, bookId) }),
    session.schoolId,
  );
  await assertCanViewStudent(session, studentId);

  const [{ value: onLoan }] = await db
    .select({ value: count() })
    .from(t.libraryLoans)
    .where(
      and(
        eq(t.libraryLoans.schoolId, session.schoolId),
        eq(t.libraryLoans.bookId, bookId),
        inArray(t.libraryLoans.status, ['ISSUED', 'OVERDUE']),
      ),
    );
  if (Number(onLoan) >= book.totalCopies) throw conflict('Every copy of that book is already on loan.');

  const openLoans = await db
    .select()
    .from(t.libraryLoans)
    .where(
      and(
        eq(t.libraryLoans.schoolId, session.schoolId),
        eq(t.libraryLoans.studentId, studentId),
        inArray(t.libraryLoans.status, ['ISSUED', 'OVERDUE']),
      ),
    );
  if (openLoans.length >= MAX_OPEN_LOANS) {
    throw conflict(`That student already has ${openLoans.length} books out. The limit is ${MAX_OPEN_LOANS}.`);
  }
  if (openLoans.some((l) => l.dueDate < today())) {
    throw conflict('That student has an overdue book. It must come back before another goes out.');
  }

  const dueDate = input.dueDate ?? new Date(Date.now() + LOAN_DAYS * 864e5).toISOString().slice(0, 10);
  const [loan] = await db
    .insert(t.libraryLoans)
    .values({ schoolId: session.schoolId, bookId, studentId, issuedById: session.id, dueDate, status: 'ISSUED' })
    .returning();

  await notify({
    schoolId: session.schoolId,
    userIds: await guardianUserIds(session.schoolId, [studentId]),
    type: 'LIBRARY',
    title: `Library book issued: ${book.title}`,
    body: `Due back on ${dueDate}. A fine of ₹${FINE_PER_DAY / 100} per day applies after that.`,
    link: '/parent/library',
  });
  return loan;
}

/** Takes a book back and freezes the fine at the amount owed on that day. */
export async function returnBook(input: {
  session: SessionUser & { schoolId: string };
  loanId: string;
  lost?: boolean;
}) {
  const { session, loanId } = input;
  const loan = assertSameSchool(
    await db.query.libraryLoans.findFirst({ where: eq(t.libraryLoans.id, loanId), with: { book: true } }),
    session.schoolId,
  );
  if (loan.returnedAt) throw conflict('That book has already been returned.');

  const fine = input.lost ? 0 : fineFor(loan.dueDate);
  const [updated] = await db
    .update(t.libraryLoans)
    .set({
      returnedAt: input.lost ? null : new Date(),
      status: input.lost ? 'LOST' : 'RETURNED',
      fineAmount: fine,
    })
    .where(eq(t.libraryLoans.id, loanId))
    .returning();

  if (fine > 0) {
    await notify({
      schoolId: session.schoolId,
      userIds: await guardianUserIds(session.schoolId, [loan.studentId]),
      type: 'LIBRARY',
      title: `Late return fine: ₹${(fine / 100).toLocaleString('en-IN')}`,
      body: `${loan.book.title} was due on ${loan.dueDate}.`,
      link: '/parent/library',
    });
  }
  return updated;
}

/** Flags loans past their due date so the desk and the dashboards agree. */
export async function refreshOverdueLoans(schoolId: string) {
  const rows = await db
    .update(t.libraryLoans)
    .set({ status: 'OVERDUE' })
    .where(
      and(
        eq(t.libraryLoans.schoolId, schoolId),
        eq(t.libraryLoans.status, 'ISSUED'),
        lt(t.libraryLoans.dueDate, today()),
      ),
    )
    .returning({ id: t.libraryLoans.id });
  return rows.length;
}

/** Loans, newest first, with the fine each currently stands at. */
export async function listLoans(schoolId: string, opts: { studentId?: string; openOnly?: boolean } = {}) {
  await refreshOverdueLoans(schoolId);
  const rows = await db.query.libraryLoans.findMany({
    where: and(
      eq(t.libraryLoans.schoolId, schoolId),
      opts.studentId ? eq(t.libraryLoans.studentId, opts.studentId) : undefined,
      opts.openOnly ? inArray(t.libraryLoans.status, ['ISSUED', 'OVERDUE']) : undefined,
    ),
    with: {
      book: true,
      student: { columns: { id: true, firstName: true, lastName: true, admissionNumber: true } },
    },
    orderBy: desc(t.libraryLoans.issuedAt),
    limit: 300,
  });

  return rows.map((l) => ({
    ...l,
    // Open loans accrue; settled loans keep the frozen figure.
    currentFine: l.returnedAt || l.status === 'LOST' ? l.fineAmount : fineFor(l.dueDate),
  }));
}

export async function librarySummary(schoolId: string) {
  const [books] = await db
    .select({ titles: count(), copies: sql<number>`coalesce(sum(${t.libraryBooks.totalCopies}), 0)::int` })
    .from(t.libraryBooks)
    .where(eq(t.libraryBooks.schoolId, schoolId));

  const loans = await db
    .select({ status: t.libraryLoans.status, value: count() })
    .from(t.libraryLoans)
    .where(eq(t.libraryLoans.schoolId, schoolId))
    .groupBy(t.libraryLoans.status);

  const out = loans.filter((l) => l.status === 'ISSUED' || l.status === 'OVERDUE').reduce((a, b) => a + b.value, 0);
  return {
    titles: Number(books?.titles ?? 0),
    copies: Number(books?.copies ?? 0),
    onLoan: out,
    overdue: loans.find((l) => l.status === 'OVERDUE')?.value ?? 0,
  };
}
