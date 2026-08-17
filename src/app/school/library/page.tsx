import { and, asc, eq, isNull } from 'drizzle-orm';
import { BookOpen, BookMarked, AlertTriangle, Library } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listCatalogue, listLoans, librarySummary, FINE_PER_DAY } from '@/lib/services/library';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { SearchInput } from '@/components/ui/search-input';
import { QuickForm } from '@/components/forms/quick-form';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoanActions } from './loan-actions';

export const dynamic = 'force-dynamic';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSchoolPage('library.view');
  const { q } = await searchParams;

  const [catalogue, loans, summary, students] = await Promise.all([
    listCatalogue(session.schoolId, q),
    listLoans(session.schoolId),
    librarySummary(session.schoolId),
    db
      .select({ id: t.students.id, firstName: t.students.firstName, lastName: t.students.lastName, admissionNumber: t.students.admissionNumber })
      .from(t.students)
      .where(and(eq(t.students.schoolId, session.schoolId), isNull(t.students.deletedAt), eq(t.students.status, 'ACTIVE')))
      .orderBy(asc(t.students.firstName))
      .limit(500),
  ]);

  const canManage = session.permissions.includes('library.manage');
  const openLoans = loans.filter((l) => l.status === 'ISSUED' || l.status === 'OVERDUE');
  const available = catalogue.filter((b) => b.available > 0);

  return (
    <>
      <PageHeader
        title="Library"
        description={`Catalogue, loans and fines. Overdue books accrue ${formatCurrency(FINE_PER_DAY)} per day.`}
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <QuickForm
                title="Add a book"
                endpoint="/api/school/library"
                triggerLabel="Add book"
                variant="outline"
                successMessage="Book added"
                fields={[
                  { name: 'title', label: 'Title', required: true, colSpan: 2 },
                  { name: 'author', label: 'Author' },
                  { name: 'isbn', label: 'ISBN', maxLength: 20 },
                  { name: 'category', label: 'Category', placeholder: 'Fiction' },
                  { name: 'publisher', label: 'Publisher' },
                  { name: 'shelf', label: 'Shelf', placeholder: 'A-12' },
                  { name: 'totalCopies', label: 'Copies held', type: 'number', required: true, defaultValue: 1, min: 1, max: 999 },
                ]}
              />
              <QuickForm
                title="Issue a book"
                description="Three books per student, and nothing new while something is overdue."
                endpoint="/api/school/library"
                method="PUT"
                triggerLabel="Issue book"
                successMessage="Book issued"
                disabled={!available.length || !students.length}
                disabledHint="Every copy is on loan"
                fields={[
                  { name: 'bookId', label: 'Book', type: 'select', required: true, colSpan: 2, options: available.map((b) => ({ value: b.id, label: `${b.title} (${b.available} free)` })) },
                  { name: 'studentId', label: 'Student', type: 'select', required: true, colSpan: 2, options: students.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} — ${s.admissionNumber}` })) },
                  { name: 'dueDate', label: 'Due date', type: 'date', hint: 'Defaults to 14 days from today', colSpan: 2 },
                ]}
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Titles" value={summary.titles} sub={`${summary.copies} copies held`} icon={Library} />
        <StatCard label="On loan" value={summary.onLoan} icon={BookMarked} tone="blue" />
        <StatCard label="Overdue" value={summary.overdue} icon={AlertTriangle} tone={summary.overdue ? 'red' : 'green'} />
        <StatCard label="Available now" value={catalogue.reduce((a, b) => a + b.available, 0)} icon={BookOpen} tone="green" />
      </div>

      <Card className="mt-5">
        <CardHeader title="Open loans" description="Books currently out" />
        {openLoans.length === 0 ? (
          <EmptyState icon={BookMarked} title="Nothing is out" description="Issued books and their due dates appear here." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Book</TH>
                <TH>Student</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH>Fine</TH>
                <TH>Status</TH>
                {canManage && <TH className="text-right">Action</TH>}
              </TR>
            </THead>
            <TBody>
              {openLoans.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium text-slate-900">{l.book.title}</TD>
                  <TD>
                    {l.student.firstName} {l.student.lastName}
                    <p className="text-xs text-slate-500">{l.student.admissionNumber}</p>
                  </TD>
                  <TD className="text-slate-500">{formatDate(l.issuedAt)}</TD>
                  <TD className={l.status === 'OVERDUE' ? 'font-medium text-rose-600' : ''}>{formatDate(l.dueDate)}</TD>
                  <TD>{l.currentFine ? formatCurrency(l.currentFine) : '—'}</TD>
                  <TD><StatusBadge status={l.status} /></TD>
                  {canManage && (
                    <TD className="text-right">
                      <LoanActions loanId={l.id} title={l.book.title} fine={l.currentFine} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="mt-5 mb-4">
        <SearchInput placeholder="Search the catalogue…" />
      </div>

      {catalogue.length === 0 ? (
        <div className="card">
          <EmptyState icon={Library} title="The catalogue is empty" description="Add your first book to start issuing." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Title</TH>
              <TH>Author</TH>
              <TH>Category</TH>
              <TH>Shelf</TH>
              <TH>Copies</TH>
              <TH>Available</TH>
            </TR>
          </THead>
          <TBody>
            {catalogue.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium text-slate-900">{b.title}</TD>
                <TD>{b.author ?? '—'}</TD>
                <TD>{b.category ? <Badge tone="slate">{b.category}</Badge> : '—'}</TD>
                <TD className="text-slate-500">{b.shelf ?? '—'}</TD>
                <TD>{b.totalCopies}</TD>
                <TD>
                  <Badge tone={b.available > 0 ? 'green' : 'amber'}>
                    {b.available > 0 ? `${b.available} free` : 'all out'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
