import { z } from 'zod';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { bookSchema, issueBookSchema, returnBookSchema } from '@/lib/validation/schemas';
import { addBook, issueBook, listCatalogue, listLoans, returnBook } from '@/lib/services/library';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('library.view');
  const { q } = parseQuery(req, z.object({ q: z.string().optional() }));
  return ok({ catalogue: await listCatalogue(session.schoolId, q), loans: await listLoans(session.schoolId, { openOnly: true }) });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('library.manage');
  const input = await parseBody(req, bookSchema);
  const row = await addBook({ session, ...input });
  await recordAudit({ session, action: 'book.added', entity: 'LibraryBook', entityId: row.id, after: { title: row.title, copies: row.totalCopies } });
  return created(row);
});

/** Issue a copy. */
export const PUT = handler(async (req: Request) => {
  const session = await requireSchoolContext('library.manage');
  const input = await parseBody(req, issueBookSchema);
  const loan = await issueBook({
    session,
    bookId: input.bookId,
    studentId: input.studentId,
    dueDate: input.dueDate ? input.dueDate.toISOString().slice(0, 10) : undefined,
  });
  await recordAudit({ session, action: 'book.issued', entity: 'LibraryLoan', entityId: loan.id, after: { bookId: input.bookId, studentId: input.studentId, dueDate: loan.dueDate } });
  return created(loan);
});

/** Take a copy back, or write it off as lost. */
export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('library.manage');
  const input = await parseBody(req, returnBookSchema);
  const loan = await returnBook({ session, loanId: input.loanId, lost: input.lost });
  await recordAudit({ session, action: input.lost ? 'book.lost' : 'book.returned', entity: 'LibraryLoan', entityId: loan.id, after: { fine: loan.fineAmount } });
  return ok(loan);
});
